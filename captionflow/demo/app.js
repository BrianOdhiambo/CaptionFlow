import { selectActiveCue, nextCue, sentenceReplayRange } from '/player-sync.mjs';
import { viewCaptionsForMode } from '/caption-view.mjs';
import { HIDE_CONTROLS_AFTER_MS, shouldHideControls, shortcutFor, cueLabel } from '/player-controls.mjs';
import { connectCaptionSettingsPort } from '/caption-settings-port.mjs';
import '/caption-settings-panel.mjs';

const byId = id => document.getElementById(id);
const ids = ['video','video-file','caption-file','caption','caption-wrap','language','mode','replay','next','transcript','message','time-status','provider','generate','provider-note','hosted-consent-wrap','hosted-consent','download-json','download-transcript','demo-warning','caption-status',
  'video-shell','player-bar','player-hint','play','time','seek','pace-button','pace-text','pace-menu','transcript-toggle','watch-layout','transcript-panel','summarise-transcript','cc','mute','fullscreen','caption-settings-root',
  'transcript-options-button','transcript-options','follow','show-times','transcript-size','transcript-search','search-prev','search-next','search-status','target-language','translate','translation-status','text-ai-consent','summarize','summary-status','summary-points','summary-section'];
const els = Object.fromEntries(ids.map(id => [id, byId(id)]));
let cues = [];
let payload = null;
let source = 'fixture';  // fixture | generated | external
let currentCueId = null;
let lastManualPausedId = null;
let skipManualPauseForCueId = null;
let sentenceReplayUntil = null;
let isTranslating = false;
let isSummarizing = false;
let textAIAvailable = false;
let videoSelectionVersion = 0;
let isGenerating = false;
let objectUrl = null;
let providerAvailability = { fixture: true, local: true, hosted: false };
let pace = 'normal';  // normal | slow | 0.5 | 0.25 | manual
let matchIds = [];
let matchIndex = -1;
const timeLabel = t => `${Math.floor(t/60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const message = text => {
  els.message.textContent = text;
  els['caption-status'].textContent = text;
};

function validateCues(data) {
  if (!data || !Array.isArray(data.captions) || !data.captions.length) {
    throw new Error('Expected caption output with a nonempty captions array');
  }
  let lastStart = -1;
  const ids = new Set();
  return data.captions.map((cue, i) => {
    if (!cue || typeof cue.id !== 'string' || !cue.id.trim() || ids.has(cue.id) ||
        !Number.isFinite(cue.start) || !Number.isFinite(cue.end) ||
        cue.start < 0 || cue.end <= cue.start || cue.start < lastStart ||
        typeof cue.originalText !== 'string' || !cue.originalText.trim() ||
        typeof cue.displayText !== 'string' || !cue.displayText.trim()) {
      throw new Error(`Invalid caption at index ${i}`);
    }
    ids.add(cue.id);
    lastStart = cue.start;
    return { ...cue };
  });
}

function captionsFromTranscript(data) {
  const transcript = data?.transcript?.segments ? data.transcript : data;
  if (!Array.isArray(transcript?.segments) || transcript.segments.length === 0) throw new Error('No transcript segments found');
  return {
    videoId: transcript.videoId || 'local-transcript',
    sourceLanguage: transcript.sourceLanguage,
    transcript,
    captions: transcript.segments.map(segment => ({
      id: segment.id, start: segment.start, end: segment.end,
      originalText: segment.text, displayText: segment.text,
      language: segment.language || transcript.sourceLanguage,
      mode: 'original', status: 'ready',
    })),
    warnings: [],
  };
}

function renderTranscript() {
  els.transcript.replaceChildren();
  for (const cue of cues) {
    const li = document.createElement('li');
    li.dataset.id = cue.id;
    const button = document.createElement('button');
    button.type = 'button';
    const timestamp = document.createElement('span');
    timestamp.className = 'time';
    timestamp.textContent = timeLabel(cue.start);
    const text = document.createElement('span');
    text.className = 'line-text';
    text.textContent = cue.displayText;
    button.append(timestamp, ' ', text);
    if (cue.status && cue.status !== 'ready') {
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = cue.status === 'needs-review' ? ' Unreviewed wording' : ' Original fallback';
      button.append(' ', flag);
    }
    button.addEventListener('click', () => {
      els.video.currentTime = cue.start;
      sync();
      els.video.focus();
    });
    li.append(button);
    els.transcript.append(li);
  }
  applySearch();
}

function appendHighlighted(parent, text, query) {
  parent.replaceChildren();
  if (!query) {
    parent.textContent = text;
    return;
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let from = 0;
  for (let at = lowerText.indexOf(lowerQuery); at !== -1; at = lowerText.indexOf(lowerQuery, from)) {
    if (at > from) parent.append(text.slice(from, at));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + query.length);
    parent.append(mark);
    from = at + query.length;
  }
  if (from < text.length) parent.append(text.slice(from));
}

function searchQuery() {
  return els['transcript-search'].value.trim();
}

function applySearch() {
  const query = searchQuery();
  matchIds = query ? cues.filter(cue => cue.displayText.toLowerCase().includes(query.toLowerCase())).map(cue => cue.id) : [];
  matchIndex = -1;
  for (const li of els.transcript.children) {
    const isMatch = matchIds.includes(li.dataset.id);
    li.classList.toggle('match', isMatch);
    li.classList.remove('match-current');
    appendHighlighted(li.querySelector('.line-text'), cues.find(cue => cue.id === li.dataset.id).displayText, query);
  }
  updateSearchControls();
}

function updateSearchControls() {
  const count = matchIds.length;
  els['search-prev'].disabled = count === 0;
  els['search-next'].disabled = count === 0;
  if (!searchQuery()) els['search-status'].textContent = '';
  else if (count === 0) els['search-status'].textContent = 'No matches in this transcript.';
  else if (matchIndex < 0) els['search-status'].textContent = `${count} ${count === 1 ? 'match' : 'matches'}. Press Next match to start.`;
  else els['search-status'].textContent = `Match ${matchIndex + 1} of ${count}.`;
}

function goToMatch(step) {
  if (!matchIds.length) return;
  const count = matchIds.length;
  matchIndex = matchIndex < 0 ? (step > 0 ? 0 : count - 1) : (matchIndex + step + count) % count;
  const id = matchIds[matchIndex];
  const cue = cues.find(item => item.id === id);
  for (const li of els.transcript.children) li.classList.toggle('match-current', li.dataset.id === id);
  els.video.currentTime = cue.start;
  const line = els.transcript.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  scrollLineIntoTranscript(line);
  sync();
  updateSearchControls();
}

function scrollLineIntoTranscript(line) {
  if (!line) return;
  const top = line.offsetTop - els.transcript.clientHeight / 2 + line.offsetHeight / 2;
  els.transcript.scrollTo({ top, behavior: 'auto' });
}

function followActiveLine() {
  scrollLineIntoTranscript(els.transcript.querySelector('.active'));
}

function transcriptText() {
  return cues.map(cue => `[${timeLabel(cue.start)}] ${cue.displayText}`).join('\n');
}

function sync() {
  const cue = selectActiveCue(cues, els.video.currentTime || 0);
  if (sentenceReplayUntil && (els.video.currentTime >= sentenceReplayUntil.end - 0.05 || els.video.currentTime < sentenceReplayUntil.start - 0.2)) sentenceReplayUntil = null;
  els.caption.textContent = cue?.displayText ?? (cues.length ? '' :
    (els['video-file'].files?.length ? 'Captions not loaded yet' : 'Choose a video to begin.'));
  if (skipManualPauseForCueId && cue?.id !== skipManualPauseForCueId) {
    skipManualPauseForCueId = null;
  }
  if (cue?.id !== currentCueId) {
    currentCueId = cue?.id ?? null;
    for (const li of els.transcript.children) {
      const isActive = li.dataset.id === currentCueId;
      li.classList.toggle('active', isActive);
      if (isActive) li.firstElementChild.setAttribute('aria-current', 'true');
      else li.firstElementChild.removeAttribute('aria-current');
    }
    if (currentCueId && els.follow.checked) followActiveLine();
  }
  const label = cueLabel(cues, cue);
  els['time-status'].textContent = `Playback position: ${timeLabel(els.video.currentTime || 0)}${label ? ` · ${label}` : ''}`;
  updateTime();
  if (cue && pace === 'manual' && !els.video.paused &&
      cue.id !== lastManualPausedId && cue.id !== skipManualPauseForCueId && !sentenceReplayUntil &&
      els.video.currentTime >= cue.start + 0.06) {
    lastManualPausedId = cue.id;
    els.video.pause();
    els['player-hint'].hidden = false;
    noteActivity();
    message('Paused so you can read. Press Play or Next.');
  }
}
function setCaptions(data, nextSource) {
  cues = validateCues(data);
  payload = data;
  source = nextSource;
  currentCueId = null;
  lastManualPausedId = null;
  skipManualPauseForCueId = null;
  sentenceReplayUntil = null;
  renderTranscript();
  sync();
  els['download-json'].disabled = false;
  els['download-transcript'].disabled = false;
  els.replay.disabled = false;
  els.next.disabled = false;
  els['demo-warning'].hidden = nextSource !== 'fixture';
  updateTextActions();
  showCachedSummary();
}
function displayLanguage() {
  return els['target-language'].value || payload?.sourceLanguage || 'en';
}
function updateTextActions() {
  const ready = Boolean(payload?.transcript?.segments?.length) && source !== 'fixture';
  els.translate.disabled = !ready || !textAIAvailable || isTranslating;
  els.summarize.disabled = !ready || !textAIAvailable || isSummarizing;
  els['summarise-transcript'].disabled = els.summarize.disabled;

}
function showCachedSummary() {
  els['summary-points'].replaceChildren();
  const summary = payload?.summaries?.[displayLanguage()];
  if (!summary) {
    els['summary-status'].textContent = 'AI key points will appear here after you request them. Verify them against the original transcript.';
    return;
  }
  for (const point of summary.points) {
    const li = document.createElement('li');
    li.textContent = point;
    els['summary-points'].append(li);
  }
  els['summary-status'].textContent = `AI-generated key points (${summary.language === 'sw' ? 'Swahili' : 'English'}). Check them against the transcript; they have not been independently verified.`;
}
function clearTextOutputs() {
  els['target-language'].value = '';
  els['summary-points'].replaceChildren();
  els['summary-status'].textContent = 'AI key points will appear here after you request them.';
  els['translation-status'].textContent = 'Select English or Kiswahili after loading timed captions.';
  updateTextActions();
}
function applyGeneratedMode() {
  if (!['generated', 'external'].includes(source) || !payload?.transcript?.segments) return;
  const desiredLanguage = displayLanguage();
  const desiredMode = els.mode.value;
  const changed = {
    ...payload,
    captions: viewCaptionsForMode(payload, { language: desiredLanguage, mode: desiredMode }),
  };
  setCaptions(changed, source);
  if (changed.captions.some(c => c.language !== desiredLanguage)) {
    message(`Translation to ${desiredLanguage} is not loaded. Click Translate captions with AI; showing original speech text for now.`);
  } else if (desiredLanguage !== payload.sourceLanguage) {
    message(`Showing AI-translated ${desiredLanguage === 'sw' ? 'Kiswahili' : 'English'} captions. Check the unreviewed wording against the original.`);
  } else if (desiredMode === 'plain') {
    const reviewed = changed.captions.filter(c => c.status === 'needs-review').length;
    message(reviewed
      ? `Showing ${changed.captions.length} timed captions with ${reviewed} experimental wording suggestions. Review the changes; original text is always available.`
      : 'No safe rule-based rewrite was found for these captions. Showing original speech rather than inventing simpler wording.');
  } else {
    message(`Showing ${cues.length} original timed captions from ${payload.provider || 'the selected provider'}.`);
  }
}
async function loadDemoCues() {
  const language = els.language.value === 'sw' ? 'sw' : 'en';
  const params = new URLSearchParams({ lang: language, mode: els.mode.value });
  const response = await fetch(`/api/captions?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Fixture captions unavailable');
  setCaptions(data, 'fixture');
  message(`${cues.length} fictional sample captions loaded; they are NOT related to an arbitrary selected video.`);
}
function applyPace() {
  els.video.playbackRate = pace === 'slow' ? 0.75 : (['0.5','0.25'].includes(pace) ? Number(pace) : 1);
  lastManualPausedId = null;
  sentenceReplayUntil = null;
  sync();
}
function updateProviderUI() {
  const provider = els.provider.value;
  els['hosted-consent-wrap'].hidden = provider !== 'hosted';
  els.generate.textContent = provider === 'fixture' ? 'Load sample captions' : 'Generate captions from this video';
  els.generate.disabled = isGenerating || !providerAvailability[provider];
  els['provider-note'].textContent = provider === 'fixture'
    ? 'Fixture mode loads fictional captions for interface testing. They do not correspond to your selected video.'
    : provider === 'local'
      ? 'Local mode temporarily sends this video to the loopback server running faster-whisper. The temporary file is deleted afterward.'
      : 'Hosted mode sends your video to the configured external ASR endpoint. Use only consented material. Requires a compatible endpoint and token.';
}

els['video-file'].addEventListener('change', () => {
  videoSelectionVersion += 1;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  const file = els['video-file'].files?.[0];
  if (!file) {
    objectUrl = null;
    els.video.removeAttribute('src');
    els.video.load();
    cues = []; payload = null; currentCueId = null; sentenceReplayUntil = null;
    clearTextOutputs();
    els.transcript.replaceChildren();
    els.caption.textContent = 'Choose a video to begin.';
    els.replay.disabled = true; els.next.disabled = true; els['download-json'].disabled = true; els['download-transcript'].disabled = true;
    message('No video or captions selected. Choose a video to continue.');
    return;
  }
  els['player-hint'].hidden = true;
  objectUrl = URL.createObjectURL(file);
  els.video.src = objectUrl;
  els.video.load();
  // Never show unrelated fixture captions against a new video automatically.
  cues = []; payload = null; source = 'external'; currentCueId = null;
  skipManualPauseForCueId = null; lastManualPausedId = null; sentenceReplayUntil = null;
  els.transcript.replaceChildren();
  els.caption.textContent = 'No captions yet';
  els.replay.disabled = true; els.next.disabled = true;
  els['download-json'].disabled = true;
  els['download-transcript'].disabled = true;
  els['demo-warning'].hidden = true;
  clearTextOutputs();
  message('Video opened. Select Local and generate matching timed captions, or load a transcript JSON for this exact clip.');
});

els['caption-file'].addEventListener('change', async () => {
  const file = els['caption-file'].files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const parsed = Array.isArray(data.captions) ? data : captionsFromTranscript(data);
    els['target-language'].value = '';
    setCaptions(parsed, 'external');
    message(`Loaded ${cues.length} caption segments from JSON. Verify they match the selected video and its timestamps.`);
  } catch (error) { message(`Unable to load caption JSON: ${error.message}`); }
});

els.generate.addEventListener('click', async () => {
  const provider = els.provider.value;
  if (provider === 'fixture') {
    try { await loadDemoCues(); }
    catch (error) { message(error.message); }
    return;
  }
  const file = els['video-file'].files?.[0];
  if (!file) { message('Choose a video file first.'); return; }
  const selectionVersion = videoSelectionVersion;
  if (provider === 'hosted' && !els['hosted-consent'].checked) {
    message('Please explicitly consent to sending this video to the hosted ASR endpoint.'); return;
  }
  const language = els.language.value;
  const params = new URLSearchParams({ provider, language, mode: els.mode.value, consent: provider === 'hosted' ? 'yes' : 'no' });
  isGenerating = true;
  updateProviderUI();
  message(provider === 'local' ? 'Local faster-whisper is transcribing the selected video. This can take a while on a CPU…' : 'Sending consented video to the configured hosted transcription service…');
  try {
    const response = await fetch(`/api/transcribe?${params}`, {
      method: 'POST', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Transcription failed with status ${response.status}`);
    if (selectionVersion !== videoSelectionVersion || els['video-file'].files?.[0] !== file) {
      message('The video changed while transcription was running. The old result was discarded; generate captions for the new video.');
      return;
    }
    els['target-language'].value = '';
    setCaptions(data, 'generated');
    if (['en', 'sw'].includes(data.sourceLanguage)) els.language.value = data.sourceLanguage;
    applyGeneratedMode();
    if (Number.isFinite(els.video.duration) && cues.at(-1)?.end > els.video.duration + 1) {
      message('Warning: generated captions extend past this video duration. Verify the video and ASR output.');
    }
  } catch (error) { message(`Could not transcribe: ${error.message}`); }
  finally { isGenerating = false; updateProviderUI(); }
});

els.provider.addEventListener('change', () => {
  if (els.provider.value !== 'fixture') els.mode.value = 'original';
  updateProviderUI();
});
els.language.addEventListener('change', () => {
  if (source === 'fixture') loadDemoCues().catch(error => message(error.message));
  else message('Spoken-language selection applies when generating captions. Use Caption display language to translate existing captions.');
});
els.mode.addEventListener('change', () => {
  if (['generated', 'external'].includes(source) && payload?.transcript?.segments) applyGeneratedMode();
  else if (source === 'fixture') loadDemoCues().catch(error => message(error.message));
});
els['target-language'].addEventListener('change', () => {
  if (['generated', 'external'].includes(source) && payload?.transcript?.segments) applyGeneratedMode();
  showCachedSummary();
});
els['transcript-size'].addEventListener('change', () => { els.transcript.dataset.size = els['transcript-size'].value; });
els['show-times'].addEventListener('change', () => els.transcript.classList.toggle('hide-times', !els['show-times'].checked));
els['transcript-search'].addEventListener('input', applySearch);
els['transcript-search'].addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    goToMatch(event.shiftKey ? -1 : 1);
  }
});
els['search-next'].addEventListener('click', () => goToMatch(1));
els['search-prev'].addEventListener('click', () => goToMatch(-1));
els['download-transcript'].addEventListener('click', () => {
  if (!cues.length) return;
  const url = URL.createObjectURL(new Blob([transcriptText()], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${payload?.videoId || 'captionflow'}-${displayLanguage()}-transcript.txt`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function openTranscriptOptions() {
  els['transcript-options'].hidden = false;
  els['transcript-options-button'].setAttribute('aria-expanded', 'true');
  els.follow.focus();
}
function closeTranscriptOptions({ focusButton = false } = {}) {
  if (els['transcript-options'].hidden) return;
  els['transcript-options'].hidden = true;
  els['transcript-options-button'].setAttribute('aria-expanded', 'false');
  if (focusButton) els['transcript-options-button'].focus();
}
els['transcript-options-button'].addEventListener('click', () => {
  if (els['transcript-options'].hidden) openTranscriptOptions(); else closeTranscriptOptions();
});
els['transcript-options'].addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  closeTranscriptOptions({ focusButton: true });
});
els['transcript-options'].addEventListener('focusout', event => {
  if (event.relatedTarget && !els['transcript-options-button'].parentElement.contains(event.relatedTarget)) closeTranscriptOptions();
});
document.addEventListener('pointerdown', event => {
  if (!els['transcript-options-button'].parentElement.contains(event.target)) closeTranscriptOptions();
});
// The ⋮ item runs the same summary as the Summarize button and moves focus to its results.
els['summarise-transcript'].addEventListener('click', () => {
  closeTranscriptOptions();
  if (!els['text-ai-consent'].checked) byId('text-ai-options').open = true;
  els['summary-section'].scrollIntoView({ block: 'nearest' });
  els.summarize.focus();
  els.summarize.click();
});
function replay() {
  const range = sentenceReplayRange(payload?.transcript?.segments ?? cues, els.video.currentTime);
  if (!range) { message('No sentence is available to replay at this position.'); return; }
  // Keep playback continuous across short cues in manual pace mode.
  sentenceReplayUntil = { start: range.startCue.start, end: range.endCue.end };
  skipManualPauseForCueId = range.startCue.id;
  lastManualPausedId = null;
  els.video.currentTime = range.startCue.start;
  sync();
  els.video.play().then(
    () => message(range.usedSentenceBoundary
      ? `Replaying sentence from ${timeLabel(range.startCue.start)}.`
      : `Replaying nearby context from ${timeLabel(range.startCue.start)} (no clear full stop found).`),
    error => { sentenceReplayUntil = null; message(`Unable to resume playback: ${error.message}`); },
  );
}
function next() {
  sentenceReplayUntil = null;
  const cue = nextCue(cues, els.video.currentTime);
  if (cue) {
    els.video.currentTime = cue.start;
    sync();
    message(`Moved to ${cueLabel(cues, cue).toLowerCase()}. Press Play to continue.`);
  } else message('You are already at the last available caption.');
}
els.replay.addEventListener('click', replay);
els.next.addEventListener('click', next);
els['download-json'].addEventListener('click', () => {
  if (!payload) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${payload.videoId || 'captionflow'}-captions.json`;
  anchor.click();
  // Allow the click to consume its object URL; release after the next task.
  queueMicrotask(() => URL.revokeObjectURL(url));
});
els.translate.addEventListener('click', async () => {
  if (!payload?.transcript?.segments || !textAIAvailable || isTranslating) return;
  const targetLanguage = els['target-language'].value;
  if (!['en', 'sw'].includes(targetLanguage)) {
    els['translation-status'].textContent = 'Select English or Kiswahili under Caption display language.';
    return;
  }
  if (targetLanguage === payload.sourceLanguage) {
    applyGeneratedMode();
    els['translation-status'].textContent = 'Already in the original spoken language. No AI request needed.';
    return;
  }
  if (payload?.captionVariants?.translations?.[targetLanguage]) {
    applyGeneratedMode();
    els['translation-status'].textContent = 'Using previously generated translation; no additional tokens used.';
    return;
  }
  if (!els['text-ai-consent'].checked) {
    els['translation-status'].textContent = 'Please consent to sending the transcript text to hosted AI.';
    return;
  }
  const selectedVideoVersion = videoSelectionVersion;
  const transcript = payload.transcript;
  isTranslating = true; updateTextActions();
  els['translation-status'].textContent = 'Translating captions with Gemini…';
  try {
    const response = await fetch('/api/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, targetLanguage, consent: true }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Translation HTTP ${response.status}`);
    if (selectedVideoVersion !== videoSelectionVersion || payload?.transcript !== transcript) return;
    if (data.videoId !== transcript.videoId || data.targetLanguage !== targetLanguage) throw new Error('Translation response does not match the selected video');
    payload = { ...payload, captionVariants: { ...payload.captionVariants,
      translations: { ...payload.captionVariants?.translations, [targetLanguage]: data.captions } } };
    applyGeneratedMode();
    const failed = data.captions.filter(c => c.status === 'fallback').length;
    els['translation-status'].textContent = `Translation ready: ${data.captions.length - failed} captions generated, ${failed} fell back to the original. AI wording requires review.`;
  } catch (error) {
    els['translation-status'].textContent = `Could not translate: ${error.message}`;
  } finally { isTranslating = false; updateTextActions(); }
});
els.summarize.addEventListener('click', async () => {
  if (!payload?.transcript?.segments || !textAIAvailable || isSummarizing) return;
  const language = displayLanguage();
  if (!['en', 'sw'].includes(language)) return;
  if (payload.summaries?.[language]) { showCachedSummary(); return; }
  if (!els['text-ai-consent'].checked) {
    els['summary-status'].textContent = 'Consent to sending transcript text to the AI service first.';
    els['text-ai-consent'].focus();
    return;
  }
  const selectedVideoVersion = videoSelectionVersion;
  const transcript = payload.transcript;
  isSummarizing = true; updateTextActions();
  els['summary-status'].textContent = 'Generating key points from the full transcript…';
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, language, consent: true }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Summary HTTP ${response.status}`);
    if (selectedVideoVersion !== videoSelectionVersion || payload?.transcript !== transcript) return;
    if (data.videoId !== transcript.videoId || data.language !== language || !Array.isArray(data.points)) throw new Error('Summary response does not match the transcript');
    payload = { ...payload, summaries: { ...payload.summaries, [language]: data } };
    showCachedSummary();
  } catch (error) {
    els['summary-status'].textContent = `Could not summarize: ${error.message}`;
  } finally { isSummarizing = false; updateTextActions(); }
});
// In-player control bar. Everything lives inside #video-shell so full screen keeps it all.
const shell = els['video-shell'];
const PACE_LABELS = { normal: 'Normal', slow: 'Slow (0.75×)', '0.5': '0.5×', '0.25': '0.25×', manual: 'Pause at each caption' };
const PACE_SHORT = { normal: 'Normal', slow: '0.75×', '0.5': '0.5×', '0.25': '0.25×', manual: 'Pause' };
const SEEK_STEP_SECONDS = 5;
let lastActivity = Date.now();
let hideTimer = null;
let wasPlayingBeforePanel = false;
let tapRevealedControls = false;

function keyboardFocusInBar() {
  const active = document.activeElement;
  if (!active || !els['player-bar'].contains(active)) return false;
  try { return active.matches(':focus-visible'); } catch { return true; }
}
function checkControls() {
  clearTimeout(hideTimer);
  const state = {
    paused: els.video.paused,
    menuOpen: !els['pace-menu'].hidden,
    panelOpen: captionSettings.isOpen(),
    focusInside: keyboardFocusInBar(),
    msSinceActivity: Date.now() - lastActivity,
  };
  if (shouldHideControls(state)) { shell.classList.remove('controls-visible'); return; }
  shell.classList.add('controls-visible');
  // Only the idle time is left to wait for; anything else re-checks when it changes.
  if (!state.paused && !state.menuOpen && !state.panelOpen && !state.focusInside) {
    hideTimer = setTimeout(checkControls, HIDE_CONTROLS_AFTER_MS - state.msSinceActivity);
  }
}
function noteActivity() {
  lastActivity = Date.now();
  checkControls();
}

function hasVideo() { return Boolean(els.video.currentSrc || els.video.getAttribute('src')); }
function togglePlay() {
  if (!hasVideo()) { message('Choose a video first.'); return; }
  if (els.video.paused || els.video.ended) els.video.play().catch(error => message(`Unable to play: ${error.message}`));
  else els.video.pause();
}
function updatePlayButton() {
  const playing = !els.video.paused;
  els.play.dataset.state = playing ? 'playing' : 'paused';
  els.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  els.play.title = `${playing ? 'Pause' : 'Play'} (Space or K)`;
}
function duration() { return Number.isFinite(els.video.duration) ? els.video.duration : 0; }
function updateTime() {
  const total = duration();
  const current = els.video.currentTime || 0;
  els.time.textContent = `${timeLabel(current)} / ${timeLabel(total)}`;
  els.seek.max = String(total);
  els.seek.value = String(current);
  els.seek.disabled = !total;
  els.seek.setAttribute('aria-valuetext', `${timeLabel(current)} of ${timeLabel(total)}`);
}
function seekBy(seconds) {
  if (!duration()) return;
  els.video.currentTime = Math.min(duration(), Math.max(0, els.video.currentTime + seconds));
}
function toggleMute() {
  els.video.muted = !els.video.muted;
  updateMuteButton();
}
function updateMuteButton() {
  const muted = els.video.muted;
  els.mute.dataset.state = muted ? 'muted' : 'unmuted';
  els.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  els.mute.title = `${muted ? 'Unmute' : 'Mute'} (M)`;
}
function toggleFullscreen() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else shell.requestFullscreen().catch(error => message(`Full screen is not available: ${error.message}`));
}
function updateFullscreenButton() {
  const on = document.fullscreenElement === shell;
  els.fullscreen.dataset.state = on ? 'on' : 'off';
  els.fullscreen.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  els.fullscreen.title = `${on ? 'Exit full screen' : 'Full screen'} (F)`;
}

const paceItems = [...els['pace-menu'].querySelectorAll('[data-pace]')];
function setPace(value) {
  pace = value;
  for (const item of paceItems) item.setAttribute('aria-checked', String(item.dataset.pace === value));
  els['pace-text'].textContent = `Pace: ${PACE_SHORT[value]}`;
  els['pace-button'].setAttribute('aria-label', `Reading pace: ${PACE_LABELS[value]}`);
  applyPace();
}
function openPaceMenu() {
  els['pace-menu'].hidden = false;
  els['pace-button'].setAttribute('aria-expanded', 'true');
  (paceItems.find(item => item.getAttribute('aria-checked') === 'true') ?? paceItems[0]).focus();
  noteActivity();
}
function closePaceMenu({ focusButton = false } = {}) {
  if (els['pace-menu'].hidden) return;
  els['pace-menu'].hidden = true;
  els['pace-button'].setAttribute('aria-expanded', 'false');
  if (focusButton) els['pace-button'].focus();
  noteActivity();
}
els['pace-button'].addEventListener('click', () => {
  if (els['pace-menu'].hidden) openPaceMenu(); else closePaceMenu();
});
for (const item of paceItems) item.addEventListener('click', () => {
  setPace(item.dataset.pace);
  closePaceMenu({ focusButton: true });
  message(`Reading pace: ${PACE_LABELS[pace]}.`);
});
els['pace-menu'].addEventListener('keydown', event => {
  event.stopPropagation();  // keep player shortcuts out of the menu
  const index = paceItems.indexOf(document.activeElement);
  const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: paceItems.length - 1 }[event.key];
  if (move !== undefined) {
    event.preventDefault();
    paceItems[(move + paceItems.length) % paceItems.length].focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closePaceMenu({ focusButton: true });
  } else if (event.key === 'Tab') closePaceMenu();
});
document.addEventListener('pointerdown', event => {
  if (!els['pace-menu'].hidden && !els['pace-button'].parentElement.contains(event.target)) closePaceMenu();
});

const TRANSCRIPT_VISIBLE_KEY = 'captionflow.transcriptVisible';
function setTranscriptVisible(visible) {
  els['transcript-panel'].hidden = !visible;
  els['watch-layout'].classList.toggle('transcript-hidden', !visible);
  els['transcript-toggle'].setAttribute('aria-pressed', String(visible));
  els['transcript-toggle'].title = visible ? 'Hide transcript' : 'Show transcript';
  try { browserStorage()?.setItem(TRANSCRIPT_VISIBLE_KEY, String(visible)); } catch {}
  if (visible) followActiveLine();
}
els['transcript-toggle'].addEventListener('click', () => {
  setTranscriptVisible(els['transcript-panel'].hidden);
  noteActivity();
});

// Shown in the settings mount until the caption settings panel registers.
function createPlaceholderPanel() {
  return {
    open(container) {
      const card = document.createElement('div');
      card.className = 'caption-settings-placeholder';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Caption settings');
      const text = document.createElement('p');
      text.textContent = 'Caption settings are coming soon.';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      close.addEventListener('click', () => captionSettings.cancelAndClose());
      card.append(text, close);
      container.append(card);
    },
    close() {},
  };
}
function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}
const captionSettings = connectCaptionSettingsPort({
  captionWrap: els['caption-wrap'],
  mount: els['caption-settings-root'],
  fetch: (...args) => fetch(...args),
  storage: browserStorage(),
  placeholder: createPlaceholderPanel(),
  onClose() {
    els.cc.setAttribute('aria-expanded', 'false');
    els.cc.focus();
    const resume = wasPlayingBeforePanel;
    wasPlayingBeforePanel = false;
    if (resume) els.video.play().catch(error => message(`Unable to resume playback: ${error.message}`));
    noteActivity();
  },
  onSaved({ fontScaleSaved, error }) {
    if (error) message(`Could not save caption settings: ${error.message}`);
    else message(fontScaleSaved ? 'Caption settings saved. Text size is saved to the local toolkit profile.' : 'Caption settings saved in this browser.');
  },
});
function openCaptionSettings() {
  if (captionSettings.isOpen()) return;
  closePaceMenu();
  wasPlayingBeforePanel = !els.video.paused;
  if (wasPlayingBeforePanel) els.video.pause();
  captionSettings.openPanel();
  els.cc.setAttribute('aria-expanded', 'true');
  const mount = els['caption-settings-root'];
  const first = mount.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (first) first.focus();
  else { mount.tabIndex = -1; mount.focus(); }
  checkControls();
}

const shortcutActions = {
  togglePlay,
  replay: () => { if (!els.replay.disabled) replay(); },
  next: () => { if (!els.next.disabled) next(); },
  openCaptions: openCaptionSettings,
  closeCaptions: () => captionSettings.cancelAndClose(),
  fullscreen: toggleFullscreen,
  mute: toggleMute,
  seekBack: () => seekBy(-SEEK_STEP_SECONDS),
  seekForward: () => seekBy(SEEK_STEP_SECONDS),
};
shell.addEventListener('keydown', event => {
  noteActivity();
  if (!els['pace-menu'].hidden) return;
  const action = shortcutFor(event, { panelOpen: captionSettings.isOpen() });
  if (!action) return;
  event.preventDefault();
  shortcutActions[action]();
});
for (const type of ['pointermove', 'pointerdown', 'focusin']) shell.addEventListener(type, noteActivity);
shell.addEventListener('focusout', () => setTimeout(checkControls, 0));
// A tap on a touch screen while the bar is hidden only shows the bar.
els.video.addEventListener('pointerdown', event => {
  tapRevealedControls = event.pointerType !== 'mouse' && !shell.classList.contains('controls-visible');
});
els.video.addEventListener('click', () => {
  if (tapRevealedControls) { tapRevealedControls = false; return; }
  togglePlay();
});
els.play.addEventListener('click', togglePlay);
els.cc.addEventListener('click', openCaptionSettings);
els.mute.addEventListener('click', toggleMute);
els.fullscreen.addEventListener('click', toggleFullscreen);
els.fullscreen.hidden = !document.fullscreenEnabled;
els.seek.addEventListener('input', () => { els.video.currentTime = Number(els.seek.value); });
els.video.addEventListener('play', () => { els['player-hint'].hidden = true; updatePlayButton(); noteActivity(); });
els.video.addEventListener('pause', () => { updatePlayButton(); checkControls(); });
els.video.addEventListener('volumechange', updateMuteButton);
document.addEventListener('fullscreenchange', () => { updateFullscreenButton(); noteActivity(); });
// Captions sit above the bar: the caption box offset follows the bar's real height.
if ('ResizeObserver' in window) {
  new ResizeObserver(() => shell.style.setProperty('--bar-height', `${els['player-bar'].offsetHeight}px`)).observe(els['player-bar']);
}
updatePlayButton();
updateMuteButton();
updateTime();
setTranscriptVisible((() => { try { return browserStorage()?.getItem(TRANSCRIPT_VISIBLE_KEY) !== 'false'; } catch { return true; } })());

els.video.addEventListener('timeupdate', sync);
els.video.addEventListener('seeking', sync);
els.video.addEventListener('seeked', () => { lastManualPausedId = null; sync(); });
els.video.addEventListener('ratechange', sync);
els.video.addEventListener('loadedmetadata', sync);
els.video.addEventListener('durationchange', updateTime);
els.replay.disabled = true;
els.next.disabled = true;
window.addEventListener('beforeunload', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });

try {
  const [providersResponse, prefsResponse] = await Promise.all([fetch('/api/providers'), fetch('/api/preferences')]);
  const providers = await providersResponse.json();
  const prefs = await prefsResponse.json();
  if (!providersResponse.ok || !prefsResponse.ok) throw new Error(providers.error || prefs.error || 'Setup failed');
  providerAvailability = providers.providers;
  textAIAvailable = Boolean(providers.textAI);
  updateTextActions();
  for (const option of els.provider.options) option.disabled = !providerAvailability[option.value];
  els.provider.value = providerAvailability[providers.defaultProvider] ? providers.defaultProvider : 'fixture';
  captionSettings.loadSavedStyle({ fontScale: prefs.fontScale });
  updateProviderUI();
  if (els.provider.value === 'fixture') await loadDemoCues();
  else { els.mode.value = 'original'; message('Select a local video and generate timed captions.'); }
  applyPace();
} catch (error) { message(`Setup failed: ${error.message}`); }