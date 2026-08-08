import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

import {
  ANDROID_SPEECH_EVENTS,
  androidSpeechEvents,
  androidSpeechModuleAvailable,
  isAndroidSpeechAvailable,
  shutdownAndroidSpeech,
  startAndroidSpeech,
  stopAndroidSpeech,
} from '../services/androidSpeech';
import {
  SPEECH_EVENTS,
  initializeSpeech,
  isSpeechModelReady,
  parseSpeechResult,
  shutdownSpeech,
  speechAvailable,
  speechEvents,
  startSpeech,
  stopSpeech,
} from '../services/speech';
import { useSettings } from '../context/SettingsContext';
import { VoiceProvider } from '../types';

export type DictationDenial = 'unsupported' | 'no-model' | 'no-permission' | 'failed';

export interface UseDictationOptions {
  /** Receives the full composed text (starting text + everything spoken so far). */
  onText: (text: string) => void;
  /** Hard cap so dictation cannot exceed the field's own limit. */
  maxLength?: number;
  onDenied?: (reason: DictationDenial) => void;
}

export interface Dictation {
  listening: boolean;
  /** True between tapping Dictate and the recogniser actually starting. */
  starting: boolean;
  supported: boolean;
  /** Which engine is currently selected, for denial messaging that differs by engine. */
  provider: VoiceProvider;
  /** Live transcript of the phrase currently being spoken. */
  partial: string;
  start: (startingText: string) => Promise<void>;
  stop: () => void;
  toggle: (currentText: string) => Promise<void>;
}

interface DictationEngine {
  available: boolean;
  events: NativeEventEmitter | null;
  eventNames: { partial: string; result: string; final?: string; error: string };
  /** Whether the engine is ready to start right now (a model on disk, a recognition service installed). */
  isReady: () => Promise<boolean>;
  /** Any work needed before `start()`, e.g. loading a model into memory. A no-op where there is none. */
  prepare: () => Promise<void>;
  start: () => void;
  stop: () => void;
  shutdown: () => void;
}

const voskEngine: DictationEngine = {
  available: speechAvailable,
  events: speechEvents,
  eventNames: SPEECH_EVENTS,
  isReady: isSpeechModelReady,
  prepare: initializeSpeech,
  start: startSpeech,
  stop: stopSpeech,
  shutdown: shutdownSpeech,
};

const androidEngine: DictationEngine = {
  available: androidSpeechModuleAvailable,
  events: androidSpeechEvents,
  eventNames: ANDROID_SPEECH_EVENTS,
  isReady: isAndroidSpeechAvailable,
  // Starting a session is the whole cost here; there is nothing separate to
  // load into this app's own memory the way there is with an on-device model.
  prepare: async () => {},
  start: startAndroidSpeech,
  stop: stopAndroidSpeech,
  shutdown: shutdownAndroidSpeech,
};

function engineFor(provider: VoiceProvider): DictationEngine {
  return provider === 'android' ? androidEngine : voskEngine;
}

interface SharedDictationSession {
  owner: symbol;
  token: number;
  engine: DictationEngine;
  deactivate: () => void;
}

// Native recognisers are process singletons. Navigation can keep several
// screens mounted, so ownership must be process-wide too, not one ref per hook.
let sharedSession: SharedDictationSession | null = null;

function ownsSession(owner: symbol, token: number, engine: DictationEngine): boolean {
  return sharedSession?.owner === owner && sharedSession.token === token && sharedSession.engine === engine;
}

function claimSession(session: SharedDictationSession): void {
  const previous = sharedSession;
  if (previous && (previous.owner !== session.owner || previous.token !== session.token)) {
    sharedSession = null;
    previous.engine.stop();
    previous.deactivate();
  }
  sharedSession = session;
}

function releaseSession(owner: symbol, token: number): DictationEngine | null {
  if (sharedSession?.owner !== owner || sharedSession.token !== token) return null;
  const engine = sharedSession.engine;
  sharedSession = null;
  return engine;
}

function join(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  return /\s$/.test(base) ? base + addition : `${base} ${addition}`;
}

/**
 * Microphone dictation with correct accumulation, over whichever engine is
 * selected in Settings: the offline Vosk model, or Android's own speech
 * recognizer for when accuracy matters more than staying fully offline.
 *
 * A phrase is folded into `committed` the moment an engine finalises it, and
 * only the in-flight partial is transient, so a long dictation session
 * accumulates correctly instead of each finished phrase overwriting the one
 * before it.
 */
export function useDictation({ onText, maxLength, onDenied }: UseDictationOptions): Dictation {
  const { voiceProvider } = useSettings();
  const engine = useMemo(() => engineFor(voiceProvider), [voiceProvider]);

  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [partial, setPartial] = useState('');

  const committed = useRef('');
  const lastPhrase = useRef('');
  const livePartial = useRef('');
  const mounted = useRef(true);
  const owner = useRef(Symbol('dictation-owner'));
  const nextSessionToken = useRef(1);
  const currentSessionToken = useRef<number | null>(null);
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;
  const maxRef = useRef(maxLength);
  maxRef.current = maxLength;
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const emit = useCallback((value: string) => {
    const limit = maxRef.current;
    onTextRef.current(limit !== undefined ? value.slice(0, limit) : value);
  }, []);

  const deactivate = useCallback(() => {
    currentSessionToken.current = null;
    listeningRef.current = false;
    startingRef.current = false;
    livePartial.current = '';
    if (!mounted.current) return;
    setListening(false);
    setStarting(false);
    setPartial('');
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const events = engine.events;
    if (!events) return;

    const commit = (json: string, source: 'result' | 'final') => {
      const token = currentSessionToken.current;
      if (token === null || !ownsSession(owner.current, token, engine) || !listeningRef.current) return;
      const spoken = parseSpeechResult(json).text?.trim();
      livePartial.current = '';
      setPartial('');
      if (!spoken) return;
      // Vosk replays the last utterance through onFinalResult when listening
      // stops, which would otherwise append the same phrase twice. Android's
      // recognizer has no equivalent "final" event, so this only ever
      // matters when `source` is 'final', which only Vosk emits.
      if (source === 'final' && spoken === lastPhrase.current) return;
      lastPhrase.current = spoken;
      committed.current = join(committed.current, spoken);
      emit(committed.current);
    };

    const handleResult = (json: string) => commit(json, 'result');
    const handleFinal = (json: string) => commit(json, 'final');

    const handlePartial = (json: string) => {
      const token = currentSessionToken.current;
      if (token === null || !ownsSession(owner.current, token, engine) || !listeningRef.current) return;
      const fragment = parseSpeechResult(json).partial?.trim() ?? '';
      livePartial.current = fragment;
      setPartial(fragment);
      emit(join(committed.current, fragment));
    };

    const subscriptions = [
      events.addListener(engine.eventNames.result, handleResult),
      events.addListener(engine.eventNames.error, () => {
        const token = currentSessionToken.current;
        if (token === null || !ownsSession(owner.current, token, engine)) return;
        releaseSession(owner.current, token);
        engine.stop();
        currentSessionToken.current = null;
        listeningRef.current = false;
        startingRef.current = false;
        livePartial.current = '';
        setListening(false);
        setStarting(false);
        setPartial('');
        onDeniedRef.current?.('failed');
      }),
    ];
    if (engine.eventNames.final) {
      subscriptions.push(events.addListener(engine.eventNames.final, handleFinal));
    }
    subscriptions.push(events.addListener(engine.eventNames.partial, handlePartial));

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
    // Switching engines mid-session is rare, but re-subscribing to the right
    // emitter when it happens is what keeps a stale listener from lingering.
  }, [engine, emit]);

  // Release the recogniser (and the microphone) when the screen goes away, or
  // when the selected engine changes out from under an active session.
  useEffect(() => {
    const ownedEngine = engine;
    const hookOwner = owner.current;
    return () => {
      const token = currentSessionToken.current;
      if (token !== null) {
        const released = releaseSession(hookOwner, token);
        if (released) released.stop();
      }
      deactivate();
      // Do not tear down a process singleton another mounted hook now owns.
      if (!sharedSession || sharedSession.engine !== ownedEngine) ownedEngine.shutdown();
    };
  }, [deactivate, engine]);

  const stop = useCallback(() => {
    const token = currentSessionToken.current;
    if (token === null) return;
    const active = releaseSession(owner.current, token);
    currentSessionToken.current = null;
    startingRef.current = false;
    listeningRef.current = false;

    // Once ownership is released, late native final events are intentionally
    // ignored. Preserve the last visible phrase before asking native to stop.
    const fragment = livePartial.current.trim();
    if (fragment) {
      committed.current = join(committed.current, fragment);
      lastPhrase.current = fragment;
      emit(committed.current);
    }
    livePartial.current = '';
    setListening(false);
    setStarting(false);
    setPartial('');
    active?.stop();
  }, [emit]);

  const start = useCallback(async (startingText: string) => {
    if (startingRef.current || listeningRef.current) return;
    const active = engineRef.current;
    if (!active.available) {
      onDeniedRef.current?.('unsupported');
      return;
    }

    const token = nextSessionToken.current++;
    currentSessionToken.current = token;
    startingRef.current = true;
    setStarting(true);
    claimSession({ owner: owner.current, token, engine: active, deactivate });
    const stillOwned = () => mounted.current && ownsSession(owner.current, token, active);

    const deny = (reason: DictationDenial) => {
      if (!stillOwned()) return;
      releaseSession(owner.current, token);
      currentSessionToken.current = null;
      startingRef.current = false;
      listeningRef.current = false;
      livePartial.current = '';
      setStarting(false);
      setListening(false);
      setPartial('');
      onDeniedRef.current?.(reason);
    };

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!stillOwned()) return;
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          deny('no-permission');
          return;
        }
      } catch {
        deny('no-permission');
        return;
      }
    }

    try {
      if (!(await active.isReady())) {
        deny('no-model');
        return;
      }
      if (!stillOwned()) return;
      await active.prepare();
      if (!stillOwned()) return;
      committed.current = startingText;
      lastPhrase.current = '';
      livePartial.current = '';
      setPartial('');
      listeningRef.current = true;
      startingRef.current = false;
      active.start();
      setListening(true);
      setStarting(false);
    } catch {
      deny('failed');
    } finally {
      if (currentSessionToken.current === token) {
        startingRef.current = false;
        if (mounted.current) setStarting(false);
      }
    }
  }, [deactivate]);

  const toggle = useCallback(
    async (currentText: string) => {
      if (listeningRef.current || startingRef.current) stop();
      else await start(currentText);
    },
    [start, stop],
  );

  return {
    listening,
    starting,
    supported: engine.available,
    provider: voiceProvider,
    partial,
    start,
    stop,
    toggle,
  };
}
