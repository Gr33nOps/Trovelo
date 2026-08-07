import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AI_MODELS, AIModelInfo } from '../constants/models';
import { unloadModel } from '../services/ai';
import {
  DownloadCancelledError,
  DownloadPausedError,
  ModelDownload,
  downloadModel,
  freeDiskBytes,
  getModelPath,
  partialBytesFor,
} from '../services/modelStore';
import { useSettings } from './SettingsContext';

export interface ActiveDownload {
  modelId: string;
  modelName: string;
  fraction: number;
  receivedBytes: number;
  totalBytes: number;
  /** Bytes per second, smoothed. */
  bytesPerSecond: number;
  paused: boolean;
}

export interface DownloadContextValue {
  active: ActiveDownload | null;
  /** Set when the last attempt failed, cleared when a new one starts. */
  error: string | null;
  /** Bytes already on disk per model id, for "Resume (43%)" affordances. */
  partials: Record<string, number>;
  startDownload: (model: AIModelInfo) => Promise<void>;
  pauseDownload: () => void;
  cancelDownload: () => void;
  dismissError: () => void;
  refreshPartials: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

export class NotEnoughSpaceError extends Error {
  constructor(needed: string, free: string) {
    super(`This model needs about ${needed} and only ${free} is free. Free up some space and try again.`);
    this.name = 'NotEnoughSpaceError';
  }
}

/**
 * Owns the one in-flight model download.
 *
 * Lives above the navigator so leaving Settings mid-download does not tear the
 * transfer down, and so any screen can show its progress.
 */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const { setSelectedModelPath } = useSettings();
  const [active, setActive] = useState<ActiveDownload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partials, setPartials] = useState<Record<string, number>>({});

  const handle = useRef<ModelDownload | null>(null);
  const mounted = useRef(true);
  const rate = useRef({ at: 0, bytes: 0, smoothed: 0 });

  useEffect(
    () => () => {
      mounted.current = false;
      handle.current?.pause();
    },
    [],
  );

  const refreshPartials = useCallback(async () => {
    const sizes = await Promise.all(
      AI_MODELS.map(async (model) => [model.id, await partialBytesFor(model)] as const),
    );
    if (!mounted.current) return;
    setPartials(Object.fromEntries(sizes.filter(([, bytes]) => bytes > 0)));
  }, []);

  useEffect(() => {
    void refreshPartials();
  }, [refreshPartials]);

  const startDownload = useCallback(
    async (model: AIModelInfo) => {
      if (handle.current) return;
      setError(null);

      const alreadyHave = await partialBytesFor(model);
      const free = await freeDiskBytes();
      const needed = Math.max(0, model.sizeBytes - alreadyHave);
      if (free !== null && free < needed * 1.15) {
        const format = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
        setError(new NotEnoughSpaceError(format(needed), format(free)).message);
        return;
      }

      rate.current = { at: Date.now(), bytes: alreadyHave, smoothed: 0 };
      setActive({
        modelId: model.id,
        modelName: model.name,
        fraction: model.sizeBytes > 0 ? alreadyHave / model.sizeBytes : 0,
        receivedBytes: alreadyHave,
        totalBytes: model.sizeBytes,
        bytesPerSecond: 0,
        paused: false,
      });

      const download = downloadModel(model, (progress) => {
        if (!mounted.current) return;
        const now = Date.now();
        const elapsed = (now - rate.current.at) / 1000;
        let speed = rate.current.smoothed;
        if (elapsed > 0.75) {
          const instant = Math.max(0, progress.receivedBytes - rate.current.bytes) / elapsed;
          // Exponential smoothing keeps the estimate from flickering.
          speed = rate.current.smoothed === 0 ? instant : rate.current.smoothed * 0.7 + instant * 0.3;
          rate.current = { at: now, bytes: progress.receivedBytes, smoothed: speed };
        }
        setActive({
          modelId: model.id,
          modelName: model.name,
          fraction: progress.fraction,
          receivedBytes: progress.receivedBytes,
          totalBytes: progress.totalBytes || model.sizeBytes,
          bytesPerSecond: speed,
          paused: false,
        });
      });
      handle.current = download;

      try {
        const path = await download.promise;
        // Any context built from an older file at this path is now stale.
        await unloadModel().catch(() => {});
        if (!mounted.current) return;
        setSelectedModelPath(path);
      } catch (caught) {
        if (!mounted.current) return;
        if (caught instanceof DownloadCancelledError || caught instanceof DownloadPausedError) {
          // Both are user-initiated; the partial file state tells the story.
        } else {
          setError(caught instanceof Error ? caught.message : 'The download failed. Please try again.');
        }
      } finally {
        handle.current = null;
        if (mounted.current) {
          setActive(null);
          void refreshPartials();
        }
      }
    },
    [refreshPartials, setSelectedModelPath],
  );

  const pauseDownload = useCallback(() => {
    handle.current?.pause();
    setActive((current) => (current ? { ...current, paused: true } : current));
  }, []);

  const cancelDownload = useCallback(() => {
    handle.current?.cancel();
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo<DownloadContextValue>(
    () => ({
      active,
      error,
      partials,
      startDownload,
      pauseDownload,
      cancelDownload,
      dismissError,
      refreshPartials,
    }),
    [active, error, partials, startDownload, pauseDownload, cancelDownload, dismissError, refreshPartials],
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownload(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownload must be used within a DownloadProvider');
  return ctx;
}
