import { useCallback, useEffect, useRef, useState } from 'react';

import { useSettings } from '../context/SettingsContext';
import {
  AiBusyError,
  AiCancelledError,
  AskBoxSource,
  askBox,
  checkModelReady,
} from '../services/ai';

export type AskBoxAvailability = 'ready' | 'disabled' | 'no-model' | 'checking';

interface AskBoxState {
  running: boolean;
  answer: string;
  usedIds: string[];
  error: string | null;
}

const IDLE: AskBoxState = { running: false, answer: '', usedIds: [], error: null };

export interface AskBoxRunner extends AskBoxState {
  availability: AskBoxAvailability;
  ask: (question: string, sources: AskBoxSource[]) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

/** Same shape as {@link useAiRunner}, aimed at the multi-note question flow instead of a single entry. */
export function useAskBox(): AskBoxRunner {
  const { aiEnabled, selectedModelPath } = useSettings();
  const [state, setState] = useState<AskBoxState>(IDLE);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const mounted = useRef(true);
  const nextRunId = useRef(1);
  const activeRun = useRef<{ id: number; controller: AbortController } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRun.current?.controller.abort();
      activeRun.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!aiEnabled || !selectedModelPath) {
      setModelReady(null);
      return;
    }
    setModelReady(null);
    void checkModelReady(selectedModelPath).then((path) => {
      if (active) setModelReady(path !== null);
    });
    return () => {
      active = false;
    };
  }, [aiEnabled, selectedModelPath]);

  const availability: AskBoxAvailability = !aiEnabled
    ? 'disabled'
    : !selectedModelPath
      ? 'no-model'
      : modelReady === null
        ? 'checking'
        : modelReady
          ? 'ready'
          : 'no-model';

  const reset = useCallback(() => {
    activeRun.current?.controller.abort();
    activeRun.current = null;
    setState(IDLE);
  }, []);

  const cancel = useCallback(() => {
    activeRun.current?.controller.abort();
    activeRun.current = null;
    setState((current) => ({ ...current, running: false }));
  }, []);

  const ask = useCallback(
    async (question: string, sources: AskBoxSource[]) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      if (activeRun.current) {
        setState((current) => ({ ...current, error: 'One thing at a time. The assistant is still working.' }));
        return;
      }

      if (!aiEnabled) {
        setState({ ...IDLE, error: 'Turn on the local assistant and pick a model first.' });
        return;
      }

      const id = nextRunId.current++;
      const controller = new AbortController();
      activeRun.current = { id, controller };
      const ownsRun = () =>
        mounted.current && activeRun.current?.id === id && !controller.signal.aborted;

      const path = await checkModelReady(selectedModelPath);
      if (!ownsRun()) return;
      if (!path) {
        activeRun.current = null;
        setState({ ...IDLE, error: 'Turn on the local assistant and pick a model first.' });
        return;
      }

      setState({ running: true, answer: '', usedIds: [], error: null });

      try {
        const result = await askBox(trimmed, sources, path, {
          signal: controller.signal,
          onProgress: (partial) => {
            if (ownsRun()) {
              setState((current) => (current.running ? { ...current, answer: partial } : current));
            }
          },
        });
        if (!ownsRun()) return;
        setState({ running: false, answer: result.answer, usedIds: result.usedIds, error: null });
      } catch (error) {
        if (!ownsRun()) return;
        if (error instanceof AiCancelledError) {
          setState((current) => ({ ...current, running: false }));
          return;
        }
        const message =
          error instanceof AiBusyError
            ? 'One thing at a time. The assistant is still working.'
            : error instanceof Error
              ? error.message
              : 'That did not work this time.';
        setState({ running: false, answer: '', usedIds: [], error: message });
      } finally {
        if (activeRun.current?.id === id) activeRun.current = null;
      }
    },
    [aiEnabled, selectedModelPath],
  );

  return { ...state, availability, ask, cancel, reset };
}
