/** Word timing for the spoken-word highlight. ASR gives timings only per caption segment,
 * so each word's time is estimated from its share of the segment's length. Estimates are
 * approximate; they do not claim word-level accuracy. Pure logic, served to the browser
 * at /caption-words.mjs and tested in Node.
 */
export function wordTimings(text, start, end) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const duration = Math.max(0, end - start);
  const totalWeight = words.reduce((sum, word) => sum + word.length + 1, 0) || 1;
  let cursor = start;
  return words.map(word => {
    const from = cursor;
    cursor += ((word.length + 1) / totalWeight) * duration;
    return { word, start: from, end: cursor };
  });
}

export function activeWordIndex(timings, seconds) {
  return timings.findIndex(timing => seconds >= timing.start && seconds < timing.end);
}
