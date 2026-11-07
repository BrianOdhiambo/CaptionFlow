/** Pure player timing logic: relative video seconds, half-open [start,end) cues.
 * When ASR cues overlap, prefer the most recently started cue.
 */
export function selectActiveCue(cues, time) {
  if (!Number.isFinite(time) || time < 0) return null;
  let found = null;
  for (const cue of cues) {
    if (cue.start > time) break;
    if (time < cue.end) found = cue;
  }
  return found;
}

export function nextCue(cues, currentTime) {
  return cues.find(cue => cue.start > currentTime + 0.05) ?? null;
}

/** Legacy cue replay, kept for consumers that want only the current cue. */
export function replayCue(cues, currentTime) {
  const active = selectActiveCue(cues, currentTime);
  if (active) return active;
  return [...cues].reverse().find(cue => cue.start <= currentTime) ?? null;
}

const ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'vs',
  'e.g', 'i.e', 'etc', 'fig', 'no', 'hon',
]);
const CONTEXT_FALLBACK_SECONDS = 14;

/**
 * Find plausible sentence-ending punctuation in the original spoken text.
 * Deliberately ignores common titles/abbreviations and decimal points.
 * Cue-level timestamp precision means we can only seek to a cue boundary,
 * never to an individual full stop that falls *within* a cue.
 */
function lastSentenceStop(text) {
  const original = typeof text === 'string' ? text : '';
  const matches = [...original.matchAll(/[.!?]+(?=(?:["'”’)}\]]*\s+|["'”’)}\]]*$|$))/g)];
  let boundary = -1;
  for (const match of matches) {
    const pos = match.index;
    const token = match[0];
    if (token.includes('.') && !token.includes('!') && !token.includes('?')) {
      const prev = original[pos - 1] ?? '';
      const next = original[pos + token.length] ?? '';
      if (/\d/.test(prev) && /\d/.test(next)) continue;
      const prefix = original.slice(0, pos);
      const lastWord = prefix.match(/([A-Za-z]+(?:\.[A-Za-z]+)*)$/)?.[1]?.toLowerCase();
      if (lastWord && ABBREVIATIONS.has(lastWord)) continue;
      if (/(?:\b[A-Za-z]\.){2,}[A-Za-z]?$/i.test(prefix + token)) continue;
    }
    boundary = pos + token.length;
  }
  return boundary;
}

function spokenText(cue) {
  // Translations can introduce/omit punctuation; replay follows source speech.
  return cue.originalText ?? cue.text ?? cue.displayText ?? '';
}

/**
 * Return the sentence-range that surrounds the cue nearest the media clock.
 * startCue is the cue at/before the last completed sentence boundary;
 * endCue is the last cue of the same sentence, used to avoid interrupting a
 * sentence replay in manual pause mode. Timing is never fabricated.
 * If ASR has no useful punctuation, replay at most 14 seconds of context.
 */
export function sentenceReplayRange(cues, currentTime) {
  const currentCue = replayCue(cues, currentTime);
  if (!currentCue) return null;
  const currentIndex = cues.indexOf(currentCue);
  let startIndex = 0;
  let foundBoundary = false;

  for (let i = currentIndex - 1; i >= 0; i--) {
    const text = spokenText(cues[i]);
    const stop = lastSentenceStop(text);
    if (stop === -1) continue;
    // If an earlier cue says "Sentence one. Sentence two starts", start at
    // that cue; its word-level punctuation position is not available here.
    const textAfterStop = text.slice(stop).replace(/["'”’)}\]\s]+$/g, '').trim();
    startIndex = textAfterStop ? i : i + 1;
    foundBoundary = true;
    break;
  }
  if (!foundBoundary) {
    // Avoid an accidental rewind to the start of a long, unpunctuated video.
    const floor = currentCue.start - CONTEXT_FALLBACK_SECONDS;
    startIndex = Math.max(0, cues.findIndex(c => c.start >= floor));
  }
  // When multiple sentences occur within one cue, its start time is our
  // closest available approximation to the requested sentence start.
  // We cannot determine where the viewer is *within* that cue from timing.

  let endIndex = currentIndex;
  for (let i = currentIndex; i < cues.length; i++) {
    // Without punctuation, don't disable manual pausing for an entire long video.
    if (i > currentIndex && cues[i].start > currentCue.start + CONTEXT_FALLBACK_SECONDS) break;
    endIndex = i;
    if (lastSentenceStop(spokenText(cues[i])) !== -1) break;
  }
  return {
    startCue: cues[startIndex],
    currentCue,
    endCue: cues[endIndex],
    usedSentenceBoundary: foundBoundary,
  };
}