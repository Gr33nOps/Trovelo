export interface AIModelInfo {
  id: string;
  name: string;
  shortName: string;
  sizeLabel: string;
  /** Approximate download size; used for the storage warning, not for validation. */
  sizeBytes: number;
  url: string;
  fileName: string;
  description: string;
  /** How much RAM the loaded model roughly needs, for the low-memory warning. */
  ramBytes: number;
  speed: 'fastest' | 'balanced' | 'best';
}

const MB = 1024 * 1024;

export const AI_MODELS: AIModelInfo[] = [
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen 2.5 · 0.5B',
    shortName: 'Qwen 0.5B',
    sizeLabel: '491 MB',
    sizeBytes: 491 * MB,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    description: 'Quickest to answer. Good for tidying up short notes on any phone.',
    ramBytes: 700 * MB,
    speed: 'fastest',
  },
  {
    id: 'llama3.2-1b',
    name: 'Llama 3.2 · 1B',
    shortName: 'Llama 1B',
    sizeLabel: '808 MB',
    sizeBytes: 808 * MB,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    fileName: 'llama3.2-1b-instruct-q4_k_m.gguf',
    description: 'A good balance of quality and speed. Recommended for most phones.',
    ramBytes: 1100 * MB,
    speed: 'balanced',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen 2.5 · 1.5B',
    shortName: 'Qwen 1.5B',
    sizeLabel: '1.1 GB',
    sizeBytes: 1120 * MB,
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    description: 'The best writing of the three. Needs a newer phone with plenty of memory.',
    ramBytes: 1900 * MB,
    speed: 'best',
  },
];

export function getModelById(id: string | null): AIModelInfo | null {
  if (!id) return null;
  return AI_MODELS.find((model) => model.id === id) ?? null;
}

export function getModelByFileName(fileName: string): AIModelInfo | null {
  return AI_MODELS.find((model) => model.fileName === fileName) ?? null;
}
