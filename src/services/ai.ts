import { AppState, AppStateStatus } from 'react-native';
import { LlamaContext, initLlama } from 'llama.rn';

import { isUsableModel } from './modelStore';

export {
  deleteModelFile,
  downloadModel,
  ensureModelsDir,
  formatBytes,
  freeDiskBytes,
  getModelPath,
  importModelFromFile,
  isModelDownloaded,
  isUsableModel,
  listLocalModels,
  partialBytesFor,
} from './modelStore';
export type { DownloadProgress, LocalModelFile, ModelDownload } from './modelStore';

/* ------------------------------------------------------- context handling -- */

let context: LlamaContext | null = null;
let contextModelPath: string | null = null;
let loading: Promise<LlamaContext> | null = null;
let generating = false;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A quantised 1B model holds ~1 GB resident, so it does get dropped, but not
 * on a 90-second timer as before: reloading costs seconds of staring at a
 * spinner, and 90 seconds is well inside the time it takes to write a note and
 * then ask for tags on it. Leaving the app is what reliably frees it
 * (see `installAiLifecycleHooks`); this timer only covers a session left open
 * and untouched.
 */
const IDLE_RELEASE_MS = 300_000;

function cancelIdleRelease() {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

function scheduleIdleRelease() {
  cancelIdleRelease();
  releaseTimer = setTimeout(() => {
    if (!generating) void unloadModel();
  }, IDLE_RELEASE_MS);
}

/**
 * Loads the model, reusing the live context when the path has not changed.
 *
 * Concurrent callers share one in-flight load. Without this, two taps on
 * "Polish" could each call `initLlama` and allocate a second copy of the
 * weights, which on a mid-range phone is an immediate out-of-memory kill.
 */
async function acquireContext(modelPath: string): Promise<LlamaContext> {
  cancelIdleRelease();

  if (context && contextModelPath === modelPath) return context;
  if (loading) {
    const existing = await loading;
    if (contextModelPath === modelPath) return existing;
  }

  loading = (async () => {
    if (context) {
      await context.release().catch(() => {});
      context = null;
      contextModelPath = null;
    }
    const next = await initLlama({
      model: modelPath,
      n_ctx: 2048,
      n_batch: 512,
      n_gpu_layers: 0,
      // n_threads is left unset so llama.cpp sizes it to the device rather
      // than always assuming four cores.
    });
    context = next;
    contextModelPath = modelPath;
    return next;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function unloadModel(): Promise<void> {
  cancelIdleRelease();
  const live = context;
  context = null;
  contextModelPath = null;
  if (live) await live.release().catch(() => {});
}

export function isModelLoaded(path?: string): boolean {
  return context !== null && (path === undefined || contextModelPath === path);
}

/** Free the model when the app leaves the foreground. */
export function installAiLifecycleHooks(): () => void {
  const onChange = (state: AppStateStatus) => {
    if (state !== 'active' && !generating) void unloadModel();
  };
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}

/** Verifies the stored path still points at a real model. */
export async function checkModelReady(path: string | null): Promise<string | null> {
  if (!path) return null;
  return (await isUsableModel(path)) ? path : null;
}

/* ------------------------------------------------------------------ tasks -- */

export type AiTaskId = 'polish' | 'title' | 'tags' | 'summary' | 'expand' | 'spark';

export interface AiTask {
  id: AiTaskId;
  label: string;
  /** Verb shown while it runs, e.g. "Polishing…". */
  runningLabel: string;
  description: string;
  icon: string;
  system: string;
  /**
   * Worked examples, replayed as prior turns before the real note.
   *
   * Models this small follow a demonstration far more reliably than a written
   * rule. Telling a 1B model "keep every fact" is close to useless on its own;
   * showing it two notes that come back with their facts intact is what
   * actually stops it drifting off into invented content.
   */
  examples?: { user: string; assistant: string }[];
  /** Extra stop strings beyond the shared end-of-turn tokens, e.g. a newline for a one-line task. */
  extraStops?: string[];
  maxTokens: number;
  temperature: number;
  /** Replaces the note when true; otherwise the result is offered separately. */
  rewrites: boolean;
}

export const AI_TASKS: Record<AiTaskId, AiTask> = {
  polish: {
    id: 'polish',
    label: 'Polish',
    runningLabel: 'Polishing',
    description: 'Fix the spelling and grammar, keeping your words.',
    icon: 'sparkles-outline',
    system:
      "You are a copy editor. Correct only the spelling, grammar and punctuation of the user's note. Keep every fact, name, number, product and idea exactly as written, including unusual or technical words. Never add information the note does not already contain. Never change what the note is about. Never replace it with a different note. If it is already correct, repeat it back unchanged. Reply with the corrected note and nothing else.",
    // Both examples are terse, shorthand notes of the kind people actually
    // save here, and both come back with every specific intact. The second
    // deliberately carries odd tool names so the model learns to preserve
    // vocabulary it does not recognise rather than smoothing it into
    // something more familiar, which is exactly how a note turns into a
    // generic paragraph about something else.
    examples: [
      {
        user: 'meet sara tues abt the budget thing, need numbrs frm q3 befor that',
        assistant: 'Meet Sara on Tuesday about the budget. I need the Q3 numbers before then.',
      },
      {
        user: 'build small tool for self hosted backup, maybe rclone + cron, keep it cheap',
        assistant:
          'Build a small tool for self-hosted backup, maybe using rclone and cron. Keep it cheap.',
      },
    ],
    maxTokens: 400,
    // Was 0.3. A rewrite that must preserve meaning wants the least creative
    // sampling that still reads naturally.
    temperature: 0.15,
    rewrites: true,
  },
  title: {
    id: 'title',
    label: 'Name it',
    runningLabel: 'Naming',
    description: 'Suggest a short title for this note.',
    icon: 'pricetag-outline',
    system:
      "Write a title for the user's note using the specific people, places, projects and things it actually names. Never a generic label like 'Quick note' or 'Random idea'. Between two and six words. Plain language, no punctuation at the end, no quotes, no labels. Reply with the title only.",
    examples: [
      {
        user: 'meet sara tues abt the budget thing, need numbrs frm q3 befor that',
        assistant: 'Budget meeting with Sara',
      },
      {
        user: 'build small tool for self hosted backup, maybe rclone + cron, keep it cheap',
        assistant: 'Self-hosted backup tool',
      },
    ],
    // A title that runs on is a title that stopped following instructions;
    // cutting it off at the first newline is cheaper and more reliable than
    // hoping the model wraps up on its own.
    extraStops: ['\n'],
    maxTokens: 24,
    temperature: 0.2,
    rewrites: false,
  },
  tags: {
    id: 'tags',
    label: 'Suggest tags',
    runningLabel: 'Reading',
    description: 'Pick a few tags so this is easy to find later.',
    icon: 'bookmarks-outline',
    system:
      "Read the user's note and choose three to five short topic tags for it. Reuse one of the tags already used in this person's library whenever it genuinely fits the note, rather than coining a near-duplicate of it. Only invent a new tag when nothing existing fits. Each tag is one or two lowercase words. Reply with the tags on a single line, separated by commas. No numbering, no explanation, no hashtags.",
    // Both examples carry the same "Tags already used" preamble the real
    // prompt uses (see `buildTagsPrompt`), so the model sees the exact input
    // shape it will get at inference, not a simplified stand-in for it.
    examples: [
      {
        user:
          'Tags already used: home, garden, family, work, reading\n\nNote: meet sara tues abt the budget thing, need numbrs frm q3 befor that',
        assistant: 'work, budget, meetings',
      },
      {
        user:
          'Tags already used: home, garden, family, work, reading\n\nNote: build small tool for self hosted backup, maybe rclone + cron, keep it cheap',
        assistant: 'self-hosted, backup, tools',
      },
    ],
    extraStops: ['\n'],
    maxTokens: 48,
    temperature: 0.3,
    rewrites: false,
  },
  summary: {
    id: 'summary',
    label: 'Sum up',
    runningLabel: 'Summarising',
    description: 'Boil it down to one sentence.',
    icon: 'contract-outline',
    system:
      "Sum up the user's note in one clear sentence of at most 25 words. Keep the original meaning. Reply with the sentence only.",
    maxTokens: 60,
    temperature: 0.3,
    rewrites: false,
  },
  expand: {
    id: 'expand',
    label: 'Next steps',
    runningLabel: 'Thinking',
    description: 'Turn this into a few concrete things you could do.',
    icon: 'list-outline',
    system:
      "The user saved this note. Suggest three concrete, specific next steps they could take. Each step is one short line starting with a dash. No introduction, no conclusion, no numbering.",
    maxTokens: 220,
    temperature: 0.7,
    rewrites: false,
  },
  spark: {
    id: 'spark',
    label: 'Ask me something',
    runningLabel: 'Wondering',
    description: 'A question that makes you look at it again.',
    icon: 'help-circle-outline',
    system:
      "The user saved this note a while ago and is rediscovering it. Ask them one short, thought-provoking question about it that would help them decide whether to act on it. Reply with the question only.",
    maxTokens: 70,
    temperature: 0.8,
    rewrites: false,
  },
};

export const AI_TASK_ORDER: AiTaskId[] = ['polish', 'title', 'tags', 'summary', 'expand', 'spark'];

const EOS_STOPS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
];

/** Small models love to preface their answer. Strip it. */
const LEADING_CHATTER =
  /^(?:(?:sure|of course|certainly|absolutely|ok|okay|here(?:'s| is))[\s,!:.\-]*)+(?:the\s+|a\s+|your\s+|my\s+)?(?:(?:rewritten|polished|corrected|revised|edited|suggested)\s*)?(?:note|text|version|title|tags|summary|sentence|question|steps)?(?:\s+(?:is|are|would be))?[\s:.\-]*/i;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const pairs: Record<string, string> = { '"': '"', "'": "'", '“': '”' };
  if (first && pairs[first] === last && trimmed.length > 1) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Cuts the output at the first repeated sentence. Small quantised models fall
 * into loops near their token limit, and a note that restates itself three
 * times is worse than one that stops early.
 */
function truncateAtRepeat(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  let position = 0;
  for (const sentence of sentences) {
    const key = sentence.trim().toLowerCase();
    if (key.length > 12) {
      if (seen.has(key)) return text.slice(0, position).trim();
      seen.add(key);
    }
    position += sentence.length + 1;
  }
  return text;
}

export function cleanOutput(raw: string, task: AiTask, sourceLength: number): string {
  let output = stripWrappingQuotes(raw);

  let previous = '';
  while (previous !== output) {
    previous = output;
    output = stripWrappingQuotes(output.replace(LEADING_CHATTER, ''));
  }

  output = truncateAtRepeat(output);

  if (task.id === 'title') {
    output = output.split('\n')[0].replace(/[.]+$/, '').trim().slice(0, 80);
  }

  if (task.rewrites) {
    // Never let a "rewrite" balloon into something unrecognisable.
    const cap = Math.max(sourceLength + 200, Math.floor(sourceLength * 1.9));
    if (output.length > cap) {
      const slice = output.slice(0, cap);
      const boundary = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n'),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('\n'),
      );
      output = (boundary > cap * 0.4 ? slice.slice(0, boundary + 1) : slice).trim();
    }
  }

  return output.trim();
}

/* ------------------------------------------------------------ faithfulness -- */

/**
 * Words too common to say anything about whether two texts are about the same
 * thing. Kept deliberately short: the goal is to ignore filler, not to build a
 * real stemmer.
 */
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'that', 'this', 'have', 'has',
  'had', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'from', 'into', 'onto', 'out',
  'about', 'they', 'them', 'their', 'there', 'here', 'what', 'when', 'where', 'which', 'who', 'how',
  'all', 'any', 'some', 'more', 'most', 'other', 'than', 'then', 'also', 'just', 'like', 'get',
  'got', 'make', 'made', 'use', 'used', 'using', 'need', 'want', 'been', 'being', 'its', 'it',
]);

function contentWords(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return new Set(matches.filter((word) => word.length > 2 && !COMMON_WORDS.has(word)));
}

/**
 * How much of the note's distinctive vocabulary survived into `output`, 0 to 1.
 *
 * A genuine copy edit keeps nearly all of it: the nouns, names and technical
 * terms are the note. When a small model loses the thread it does not produce
 * a slightly-worse edit, it produces fluent prose about a different subject,
 * and that scores very low here. This is the cheap, local check that catches
 * exactly the failure the models are prone to, without needing a second
 * generation to grade the first.
 */
export function retainedFraction(source: string, output: string): number {
  const from = contentWords(source);
  if (from.size === 0) return 1;
  const to = contentWords(output);
  let kept = 0;
  for (const word of from) {
    if (to.has(word)) kept += 1;
  }
  return kept / from.size;
}

/** Below this, a "rewrite" has wandered far enough to warn the user about it. */
export const FAITHFUL_THRESHOLD = 0.45;

export function hasDrifted(task: AiTask, source: string, output: string): boolean {
  if (!task.rewrites || !output) return false;
  return retainedFraction(source, output) < FAITHFUL_THRESHOLD;
}

/**
 * Tokens worth generating for one task.
 *
 * `cleanOutput` already discards anything a rewrite produces past roughly
 * 1.9x the original length, so letting the model run to a flat 400 tokens on a
 * two-line note spent most of its time producing text that was thrown away
 * before it ever reached the screen. Sizing the budget to the note turns that
 * dead time back into responsiveness on exactly the short notes this app is
 * built around.
 */
export function predictBudget(task: AiTask, sourceLength: number): number {
  if (!task.rewrites) return task.maxTokens;
  const estimated = Math.ceil((sourceLength * 1.9) / 3.2) + 24;
  return Math.max(64, Math.min(task.maxTokens, estimated));
}

/**
 * Prefixes the note with the library's existing tags so the model can reuse
 * one instead of coining a near-duplicate ("mobile" vs "mobile-apps"). Capped
 * at 30: past that it is more context than a 1B model reliably attends to,
 * and the caller already sorts by frequency, so the cap keeps the tags most
 * worth reusing.
 */
function buildTagsPrompt(source: string, knownTags: string[]): string {
  if (knownTags.length === 0) return source;
  return `Tags already used: ${knownTags.slice(0, 30).join(', ')}\n\nNote: ${source}`;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * The message list for one task, shared by the local (llama.cpp) and remote
 * (OpenAI-compatible) code paths so a prompt change only has to happen once.
 * Examples are replayed as if they already happened, which is what makes a
 * model treat them as the house style rather than as instructions to reason
 * about.
 */
export function buildMessages(taskId: AiTaskId, text: string, knownTags: string[] = []): ChatMessage[] {
  const task = AI_TASKS[taskId];
  const source = text.trim();
  const userContent = taskId === 'tags' ? buildTagsPrompt(source, knownTags) : source;
  return [
    { role: 'system', content: task.system },
    ...(task.examples ?? []).flatMap<ChatMessage>((example) => [
      { role: 'user', content: example.user },
      { role: 'assistant', content: example.assistant },
    ]),
    { role: 'user', content: userContent },
  ];
}

export interface RunTaskOptions {
  /** Called with the full text so far as tokens arrive. */
  onProgress?: (partial: string) => void;
  /** Existing library tags, most-used first. Only consulted for the tags task. */
  knownTags?: string[];
}

export class AiBusyError extends Error {
  constructor() {
    super('The model is already working on something.');
    this.name = 'AiBusyError';
  }
}

export class AiCancelledError extends Error {
  constructor() {
    super('Stopped.');
    this.name = 'AiCancelledError';
  }
}

let cancelRequested = false;

/** Asks the running generation to stop. Safe to call when nothing is running. */
export function stopGeneration(): void {
  if (!generating) return;
  cancelRequested = true;
  void context?.stopCompletion().catch(() => {});
}

export function isGenerating(): boolean {
  return generating;
}

/**
 * Runs one AI task against the note text and returns the cleaned result.
 *
 * Only one generation may run at a time. llama.cpp contexts are not
 * re-entrant, and overlapping calls previously corrupted each other's output.
 */
export async function runTask(
  taskId: AiTaskId,
  text: string,
  modelPath: string,
  options: RunTaskOptions = {},
): Promise<string> {
  if (generating) throw new AiBusyError();

  const task = AI_TASKS[taskId];
  const source = text.trim();
  if (!source) return '';

  generating = true;
  cancelRequested = false;

  try {
    const ctx = await acquireContext(modelPath);
    if (cancelRequested) throw new AiCancelledError();

    let streamed = '';
    const result = await ctx.completion(
      {
        messages: buildMessages(taskId, source, options.knownTags ?? []),
        n_predict: predictBudget(task, source.length),
        temperature: task.temperature,
        top_k: 40,
        top_p: 0.9,
        min_p: 0.05,
        penalty_repeat: 1.15,
        penalty_last_n: 256,
        stop: task.extraStops ? [...EOS_STOPS, ...task.extraStops] : EOS_STOPS,
        jinja: true,
      },
      options.onProgress
        ? (data) => {
            streamed += data.token;
            options.onProgress?.(streamed);
          }
        : undefined,
    );

    if (cancelRequested) {
      // Keep whatever was produced before the stop. It is often usable.
      const partial = cleanOutput(result.text || streamed, task, source.length);
      if (!partial) throw new AiCancelledError();
      return partial;
    }

    return cleanOutput(result.text, task, source.length);
  } finally {
    generating = false;
    cancelRequested = false;
    scheduleIdleRelease();
  }
}

/** Convenience wrapper kept for the polish flow. */
export function fixText(text: string, modelPath: string, options?: RunTaskOptions): Promise<string> {
  return runTask('polish', text, modelPath, options);
}

/* --------------------------------------------------------------- ask box -- */

export interface AskBoxSource {
  id: string;
  title?: string;
  text: string;
}

export interface AskBoxResult {
  answer: string;
  usedIds: string[];
}

const ASK_BOX_SYSTEM =
  'You answer a question using only the numbered notes the user gives you. If the notes do not contain the answer, say so plainly instead of guessing. Keep the answer to a few short sentences. When it helps, mention which note a fact came from using its number in brackets, like [2].';

/** Characters of note text sent to the model, roughly 1000 tokens of room. */
const ASK_BOX_CONTEXT_BUDGET = 3600;
const ASK_BOX_SNIPPET_LENGTH = 500;

/**
 * Answers a question using a small, caller-chosen set of notes rather than
 * the whole library. The caller (see `utils/search.ts`) is expected to have
 * already picked the entries most likely to be relevant by keyword; this
 * function only assembles the prompt and runs it, the same one-generation-
 * at-a-time context `runTask` uses.
 */
export async function askBox(
  question: string,
  sources: AskBoxSource[],
  modelPath: string,
  options: RunTaskOptions = {},
): Promise<AskBoxResult> {
  if (generating) throw new AiBusyError();

  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || sources.length === 0) return { answer: '', usedIds: [] };

  generating = true;
  cancelRequested = false;

  try {
    const ctx = await acquireContext(modelPath);
    if (cancelRequested) throw new AiCancelledError();

    let budget = ASK_BOX_CONTEXT_BUDGET;
    const usedIds: string[] = [];
    const blocks: string[] = [];
    for (const [index, source] of sources.entries()) {
      if (budget <= 0) break;
      const label = source.title ? `${source.title}: ` : '';
      const snippet = `${label}${source.text}`.replace(/\s+/g, ' ').slice(0, ASK_BOX_SNIPPET_LENGTH);
      blocks.push(`[${index + 1}] ${snippet}`);
      usedIds.push(source.id);
      budget -= snippet.length;
    }

    const prompt = `Notes:\n${blocks.join('\n\n')}\n\nQuestion: ${trimmedQuestion}`;

    let streamed = '';
    const result = await ctx.completion(
      {
        messages: [
          { role: 'system', content: ASK_BOX_SYSTEM },
          { role: 'user', content: prompt },
        ],
        n_predict: 300,
        temperature: 0.3,
        top_k: 40,
        top_p: 0.9,
        min_p: 0.05,
        penalty_repeat: 1.15,
        penalty_last_n: 256,
        stop: EOS_STOPS,
        jinja: true,
      },
      options.onProgress
        ? (data) => {
            streamed += data.token;
            options.onProgress?.(streamed);
          }
        : undefined,
    );

    if (cancelRequested) {
      const partial = stripWrappingQuotes(result.text || streamed);
      if (!partial) throw new AiCancelledError();
      return { answer: partial, usedIds };
    }

    return { answer: stripWrappingQuotes(result.text).trim(), usedIds };
  } finally {
    generating = false;
    cancelRequested = false;
    scheduleIdleRelease();
  }
}
