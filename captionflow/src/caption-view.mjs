/** View selection without rerunning ASR. Translation variants are cached by target language.
 * Each translated cue retains the original spoken text and timing. Missing/invalid
 * translations fall back to correctly-labelled source-language captions.
 */
export function viewCaptionsForMode(payload, { language, mode }) {
  const segments = payload?.transcript?.segments;
  if (!Array.isArray(segments) || !segments.length) throw new Error('Timed transcript is required');
  const plain = payload?.captionVariants?.plain;
  const translated = payload?.captionVariants?.translations?.[language];
  return segments.map((source, index) => {
    const original = {
      id: source.id, start: source.start, end: source.end,
      originalText: source.text, displayText: source.text,
      language: source.language, mode: 'original', status: 'ready',
    };
    if (language !== source.language) {
      const candidate = Array.isArray(translated) ? translated[index] : null;
      if (candidate && candidate.id === source.id && candidate.start === source.start &&
          candidate.end === source.end && candidate.originalText === source.text &&
          candidate.language === language && candidate.mode === 'translated' &&
          candidate.status === 'needs-review' && typeof candidate.displayText === 'string' &&
          candidate.displayText.trim()) return { ...candidate };
      return { ...original, status: 'fallback' };
    }
    if (mode !== 'plain') return original;
    const proposal = Array.isArray(plain) ? plain[index] : null;
    if (!proposal || proposal.id !== source.id || proposal.start !== source.start ||
        proposal.end !== source.end || proposal.originalText !== source.text ||
        proposal.language !== source.language ||
        typeof proposal.displayText !== 'string' || !proposal.displayText.trim() ||
        !['needs-review', 'fallback'].includes(proposal.status)) {
      return { ...original, status: 'fallback' };
    }
    return { ...proposal };
  });
}