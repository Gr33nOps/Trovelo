import { useCallback, useEffect, useRef, useState } from 'react';

import { useSettings } from '../context/SettingsContext';
import {
  AI_TASKS,
  AiBusyError,
  AiCancelledError,
  AiTaskId,
  checkModelReady,
  hasDrifted,
  runTask,
} from '../services/ai';
import { getRemoteApiKey, runRemoteTask } from '../services/aiProvider';
import { AiEngineKind } from '../types';

export type AiAvailability = 'ready' | 'disabled' | 'no-model' | 'checking';

export interface AiRunnerState {
  /** The task currently generating, if any. */
  taskId: AiTaskId | null;
  /** Text produced so far. Updates token by token. Empty throughout on the remote engine, which is not streamed. */
  output: string;
  running: boolean;
  error: string | null;
  /**
   * True when a rewrite came back sharing little vocabulary with the note it
   * was given, which on models this small means it stopped editing and started
   * writing something else. The result is still shown, but never as a safe
   * swap for what the user wrote.
   */
  drifted: boolean;
}

export interface AiRunner extends AiRunnerState {
  availability: AiAvailability;
  /** Which engine a run actually used, so the UI can show "On this phone" vs. the provider's name. */
  engine: AiEngineKind;
  /** The configured provider's display name, only meaningful when `engine` is 'remote'. */
  providerLabel: string | null;
  /** `knownTags` is only consulted by the `tags` task; harmless to pass always. */
  run: (taskId: AiTaskId, text: string, knownTags?: string[]) => Promise<string | null>;
  cancel: () => void;
  reset: () => void;
}

const IDLE: AiRunnerState = {
  taskId: null,
  output: '',
  running: false,
  error: null,
  drifted: false,
};

/**
 * Drives one AI task at a time on whichever engine is configured in
 * Settings, on-device or a remote OpenAI-compatible provider, streaming its
 * output when the engine supports that.
 *
 * Generation can take tens of seconds on a phone, so the partial text is
 * surfaced as it arrives and the run is always cancellable. A spinner with no
 * way out is the worst possible shape for this feature.
 */
export function useAiRunner(): AiRunner {
  const { aiEnabled, selectedModelPath, aiEngine, remoteAiConfig } = useSettings();
  const [state, setState] = useState<AiRunnerState>(IDLE);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [remoteReady, setRemoteReady] = useState<boolean | null>(null);
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
    if (!aiEnabled || aiEngine !== 'local' || !selectedModelPath) {
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
  }, [aiEnabled, aiEngine, selectedModelPath]);

  useEffect(() => {
    let active = true;
    if (!aiEnabled || aiEngine !== 'remote' || !remoteAiConfig) {
      setRemoteReady(null);
      return;
    }
    setRemoteReady(null);
    void getRemoteApiKey(remoteAiConfig).then((key) => {
      if (active) setRemoteReady(!!key);
    });
    return () => {
      active = false;
    };
  }, [aiEnabled, aiEngine, remoteAiConfig]);

  const availability: AiAvailability = !aiEnabled
    ? 'disabled'
    : aiEngine === 'remote'
      ? !remoteAiConfig
        ? 'no-model'
        : remoteReady === null
          ? 'checking'
          : remoteReady
            ? 'ready'
            : 'no-model'
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

  const run = useCallback(
    async (taskId: AiTaskId, text: string, knownTags?: string[]): Promise<string | null> => {
      const source = text.trim();
      if (!source) return null;

      if (activeRun.current) {
        setState((current) => ({ ...current, error: 'One thing at a time. The assistant is still working.' }));
        return null;
      }

      if (!aiEnabled) {
        setState({ ...IDLE, error: 'Turn on the assistant first.' });
        return null;
      }

      const id = nextRunId.current++;
      const controller = new AbortController();
      activeRun.current = { id, controller };
      const ownsRun = () =>
        mounted.current && activeRun.current?.id === id && !controller.signal.aborted;

      if (aiEngine === 'remote') {
        if (!remoteAiConfig) {
          activeRun.current = null;
          setState({ ...IDLE, error: 'Set up a cloud provider in Settings first.' });
          return null;
        }
        const apiKey = await getRemoteApiKey(remoteAiConfig);
        if (!ownsRun()) return null;
        if (!apiKey) {
          activeRun.current = null;
          setState({ ...IDLE, error: 'Add an API key for the cloud provider in Settings.' });
          return null;
        }

        setState({ taskId, output: '', running: true, error: null, drifted: false });
        try {
          const result = await runRemoteTask(taskId, source, remoteAiConfig, apiKey, {
            knownTags,
            signal: controller.signal,
          });
          if (!ownsRun()) return null;
          setState({
            taskId,
            output: result,
            running: false,
            error: null,
            drifted: hasDrifted(AI_TASKS[taskId], source, result),
          });
          return result;
        } catch (error) {
          if (!ownsRun()) return null;
          if (error instanceof AiCancelledError) {
            setState((current) => ({ ...current, running: false }));
            return null;
          }
          const message =
            error instanceof Error ? error.message : `${AI_TASKS[taskId].label} did not work this time.`;
          setState({ taskId, output: '', running: false, error: message, drifted: false });
          return null;
        } finally {
          if (activeRun.current?.id === id) activeRun.current = null;
        }
      }

      const path = await checkModelReady(selectedModelPath);
      if (!ownsRun()) return null;
      if (!path) {
        activeRun.current = null;
        setState({ ...IDLE, error: 'Pick a model for the local assistant first.' });
        return null;
      }

      setState({ taskId, output: '', running: true, error: null, drifted: false });

      try {
        const result = await runTask(taskId, source, path, {
          knownTags,
          signal: controller.signal,
          onProgress: (partial) => {
            if (ownsRun()) {
              setState((current) => (current.running ? { ...current, output: partial } : current));
            }
          },
        });
        if (!ownsRun()) return null;
        setState({
          taskId,
          output: result,
          running: false,
          error: null,
          drifted: hasDrifted(AI_TASKS[taskId], source, result),
        });
        return result;
      } catch (error) {
        if (!ownsRun()) return null;
        if (error instanceof AiCancelledError) {
          setState((current) => ({ ...current, running: false }));
          return null;
        }
        const message =
          error instanceof AiBusyError
            ? 'One thing at a time. The assistant is still working.'
            : error instanceof Error
              ? error.message
              : `${AI_TASKS[taskId].label} did not work this time.`;
        setState({ taskId, output: '', running: false, error: message, drifted: false });
        return null;
      } finally {
        if (activeRun.current?.id === id) activeRun.current = null;
      }
    },
    [aiEnabled, aiEngine, selectedModelPath, remoteAiConfig],
  );

  return {
    ...state,
    availability,
    engine: aiEngine,
    providerLabel: aiEngine === 'remote' ? (remoteAiConfig?.label ?? null) : null,
    run,
    cancel,
    reset,
  };
}
