/**
 * Rule-based grammar and style cleanup. No model, no network: whitespace and
 * punctuation normalisation, sentence capitalisation, and a small table of
 * common apostrophe-less contractions ("dont" -> "don't").
 */

const CONTRACTIONS: Record<string, string> = {
  dont: "don't",
  cant: "can't",
  wont: "won't",
  im: "I'm",
  ive: "I've",
  id: "I'd",
  ill: "I'll",
  youre: "you're",
  youve: "you've",
  youll: "you'll",
  youd: "you'd",
  theyre: "they're",
  theyve: "they've",
  theyll: "they'll",
  theyd: "they'd",
  wasnt: "wasn't",
  isnt: "isn't",
  arent: "aren't",
  didnt: "didn't",
  doesnt: "doesn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  hasnt: "hasn't",
  havent: "haven't",
  hadnt: "hadn't",
  werent: "weren't",
  thats: "that's",
  whats: "what's",
  whos: "who's",
  lets: "let's",
  hes: "he's",
  shes: "she's",
  weve: "we've",
};

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) return replacement.toUpperCase();
  if (source.startsWith(source[0].toUpperCase())) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function expandContractions(text: string): string {
  return text.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const fixed = CONTRACTIONS[word.toLowerCase()];
    return fixed ? matchCase(word, fixed) : word;
  });
}

function capitalizeSentences(text: string): string {
  let result = '';
  let capitalizeNext = true;
  for (const char of text) {
    if (capitalizeNext && /[a-z]/.test(char)) {
      result += char.toUpperCase();
      capitalizeNext = false;
    } else {
      result += char;
      if (/[.!?]/.test(char)) capitalizeNext = true;
      else if (!/\s/.test(char)) capitalizeNext = false;
    }
  }
  return result;
}

/** Fixes grammar, spacing and style deterministically, without any model or network call. */
export function fixGrammarAndStyle(text: string): string {
  let result = text;

  // Collapse runs of spaces/tabs, but keep line breaks.
  result = result.replace(/[ \t]+/g, ' ');
  // At most one blank line between paragraphs.
  result = result.replace(/\n{3,}/g, '\n\n');
  // Trim trailing spaces on each line. split/trimEnd is immune to the
  // super-linear backtracking a trailing "+$" regex can hit on adversarial
  // input, and is simpler besides.
  result = result
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  // No space before a punctuation mark. Bounded rather than "\s+" so a long
  // run of whitespace can't force quadratic backtracking when it turns out
  // not to be followed by punctuation at all.
  result = result.replace(/\s{1,20}([,.!?;:])/g, '$1');
  // Exactly one space after a punctuation mark, when directly glued to the
  // next word. Only triggers before a letter, so numbers like "3.14" or
  // "1,000" and times like "3:30" are left alone.
  result = result.replace(/([,.!?;:])(?=[A-Za-z])/g, '$1 ');
  // Collapse repeated ! or ? into one.
  result = result.replace(/([!?])\1+/g, '$1');

  result = expandContractions(result);

  // Standalone "i" as a word becomes "I".
  result = result.replace(/\bi\b/g, 'I');

  result = capitalizeSentences(result);

  return result.trim();
}
