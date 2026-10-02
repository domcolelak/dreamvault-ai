/**
 * Pulls the first complete JSON value out of a model response. Models wrap JSON
 * in prose, fences or <think> blocks; we tolerate that but never try to repair
 * malformed JSON into something we then act on.
 */
export function extractJsonCandidate(raw: string): string | null {
  let text = raw.trim();

  // Reasoning models (qwen3 among them) emit a thinking block first.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/<\|[^|]*\|>/g, '').trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) return inner;
  }

  const start = firstIndexOfAny(text, ['{', '[']);
  if (start < 0) return null;

  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function firstIndexOfAny(text: string, chars: string[]): number {
  let best = -1;
  for (const char of chars) {
    const index = text.indexOf(char);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

export function parseJsonSafely(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const candidate = extractJsonCandidate(raw);
  if (candidate === null) return { ok: false, error: 'No JSON object found in model response.' };
  try {
    return { ok: true, value: JSON.parse(candidate) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}
