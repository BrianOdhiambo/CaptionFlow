import { selectActiveCue, nextCue, replayCue } from '/player-sync.mjs';
import { HIDE_CONTROLS_AFTER_MS, shouldHideControls, shortcutFor, cueLabel, clampSpeed, stepSpeed, speedLabel, paceSummary } from '/player-controls.mjs';
import { connectCaptionSettingsPort } from '/caption-settings-port.mjs';
import '/caption-settings-panel.mjs';
import { viewCaptionsForMode } from '/caption-view.mjs';
import { wordTimings, activeWordIndex as spokenWordIndex } from '/caption-words.mjs';

const byId = id => document.getElementById(id);
const ids = ['video', 'video-file', 'video-link', 'load-link', 'link-form', 'empty-state', 'change-video', 'video-shell',
  'watch-layout', 'transcript-panel', 'transcript', 'transcript-toggle', 'transcript-options-button', 'transcript-options',
  'follow', 'show-times', 'transcript-size', 'download-transcript', 'transcript-search', 'search-prev', 'search-next', 'search-status',
  'target-language', 'translation-status',
  'player-bar', 'player-hint', 'play', 'time', 'seek', 'replay', 'next', 'pace-wrap', 'pace-button', 'pace-text', 'pace-menu',
  'speed-slider', 'speed-value', 'speed-down', 'speed-up', 'pause-each-caption', 'cc', 'caption-settings-button', 'language-wrap', 'language-button', 'language-menu', 'mute', 'fullscreen',
  'caption', 'caption-wrap', 'caption-settings-root', 'message', 'progress-overlay', 'progress-title', 'progress-detail'];
const els = Object.fromEntries(ids.map(id => [id, byId(id)]));
let cues = [];
let payload = null;
let currentCueId = null;
let lastManualPausedId = null;
let skipManualPauseForCueId = null;
let videoSelectionVersion = 0;
let objectUrl = null;
let selectedProvider = null;
let providerAvailability = { local: false, hosted: false };
let speed = 1;
let source = 'generated';
let textAIAvailable = false;
let isTranslating = false;
let matchIds = [];
let matchIndex = -1;
let pauseEachCaption = false;
const timeLabel = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const message = text => { els.message.textContent = text; };


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


let wordCueId = null;
let wordTimes = [];
let wordSpans = [];
let activeWordIndex = -1;

function renderCaptionWords(cue) {
  if (cue.id === wordCueId) return;
  wordCueId = cue.id;
  activeWordIndex = -1;
  wordTimes = wordTimings(cue.displayText, cue.start, cue.end);
  els.caption.replaceChildren();
  wordSpans = wordTimes.map(({ word }, index) => {
    if (index > 0) els.caption.append(' ');
    const span = document.createElement('span');
    span.className = 'caption-word';
    span.textContent = word;
    els.caption.append(span);
    return span;
  });
}

function updateActiveWord(seconds) {
  const index = spokenWordIndex(wordTimes, seconds);
  if (index === activeWordIndex) return;
  if (activeWordIndex >= 0) wordSpans[activeWordIndex]?.classList.remove('word-active');
  if (index >= 0) wordSpans[index].classList.add('word-active');
  activeWordIndex = index;
}

function followSpokenWords() {
  if (wordCueId !== null && !els.video.paused) updateActiveWord(els.video.currentTime || 0);
  requestAnimationFrame(followSpokenWords);
}
requestAnimationFrame(followSpokenWords);


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


function applyGeneratedMode() {
  if (!['generated', 'external'].includes(source) || !payload?.transcript?.segments) return;
  const desiredLanguage = displayLanguage();
  const desiredMode = 'original';
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

const LANGUAGE_NAMES = { en: 'English', sw: 'Kiswahili' };
function displayLanguage() {
  return els['target-language'].value || payload?.sourceLanguage || 'en';
}

function updateTextActions() {
  els['target-language'].disabled = !payload?.transcript?.segments?.length || isTranslating;
  if (els['language-button']) els['language-button'].disabled = els['target-language'].disabled;
}

function clearTranscript() {
  els.transcript.replaceChildren();
  payload = null;
  els['download-transcript'].disabled = true;
  els['target-language'].value = '';
  els['translation-status'].textContent = 'Captions in another language appear here once the video has captions.';
  updateTextActions();
}

async function translateSelected() {
  const targetLanguage = els['target-language'].value;
  if (!payload?.transcript?.segments) return;
  if (targetLanguage === '' || targetLanguage === payload.sourceLanguage) {
    applyGeneratedMode();
    els['translation-status'].textContent = 'Showing the original spoken language.';
    return;
  }
  if (!textAIAvailable) {
    els['translation-status'].textContent = 'Translation is not configured on this server.';
    return;
  }
  if (payload?.captionVariants?.translations?.[targetLanguage]) {
    applyGeneratedMode();
    els['translation-status'].textContent = 'Using the translation already created for this video.';
    return;
  }
  const selectedVideoVersion = videoSelectionVersion;
  const transcript = payload.transcript;
  isTranslating = true;
  updateTextActions();
  els['translation-status'].textContent = 'Translating captions…';
  showProgress(`Translating captions to ${LANGUAGE_NAMES[targetLanguage] ?? targetLanguage}`, 'The video keeps its captions in the current language until the translation is ready.');
  showElapsed('Translating');
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
    els['translation-status'].textContent = `Translation ready. ${failed ? `${failed} lines fell back to the original. ` : ''}AI wording needs review.`;
  } catch (error) {
    els['translation-status'].textContent = `Could not translate: ${error.message}`;
  } finally {
    isTranslating = false;
    updateTextActions();
    if (selectedVideoVersion === videoSelectionVersion) hideProgress();
  }
}

function sync() {
  const time = els.video.currentTime || 0;
  const cue = selectActiveCue(cues, time);
  if (cue) {
    renderCaptionWords(cue);
    updateActiveWord(time);
  } else {
    wordCueId = null;
    els.caption.textContent = '';
  }
  if (skipManualPauseForCueId && cue?.id !== skipManualPauseForCueId) skipManualPauseForCueId = null;
  const previousCueId = currentCueId;
  currentCueId = cue?.id ?? null;
  if (currentCueId !== previousCueId) {
    for (const li of els.transcript.children) {
      const isActive = li.dataset.id === currentCueId;
      li.classList.toggle('active', isActive);
      if (isActive) li.firstElementChild.setAttribute('aria-current', 'true');
      else li.firstElementChild.removeAttribute('aria-current');
    }
    if (currentCueId && els.follow.checked) followActiveLine();
  }
  updateTime();
  if (cue && pauseEachCaption && !els.video.paused &&
      cue.id !== lastManualPausedId && cue.id !== skipManualPauseForCueId &&
      time >= cue.start + 0.06) {
    lastManualPausedId = cue.id;
    els.video.pause();
    els['player-hint'].hidden = false;
    noteActivity();
    message('Paused so you can read. Press Play or Next.');
  }
}

function setHasVideo(has) {
  els['video-shell'].classList.toggle('no-video', !has);
  els['empty-state'].hidden = has;
}

function setCaptions(data) {
  cues = validateCues(data);
  payload = data;
  currentCueId = null;
  lastManualPausedId = null;
  skipManualPauseForCueId = null;
  wordCueId = null;
  source = 'generated';
  renderTranscript();
  els['translation-status'].textContent = '';
  els['download-transcript'].disabled = false;
  updateTextActions();
  sync();
  els.replay.disabled = false;
  els.next.disabled = false;
}

function resetToEmpty() {
  videoSelectionVersion++;
  hideProgress();
  els.video.pause();
  els.video.removeAttribute('src');
  els.video.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  cues = [];
  payload = null;
  currentCueId = null;
  wordCueId = null;
  els.caption.textContent = '';
  els.replay.disabled = true;
  els.next.disabled = true;
  els['video-file'].value = '';
  clearTranscript();
  setHasVideo(false);
  message('');
}

function captionProvider() {
  if (providerAvailability[selectedProvider]) return selectedProvider;
  return ['local', 'hosted'].find(name => providerAvailability[name]) ?? null;
}

let progressTimer = null;
function showProgress(title, detail = '') {
  els['progress-title'].textContent = title;
  els['progress-detail'].textContent = detail;
  els['progress-overlay'].hidden = false;
}
function showElapsed(label) {
  const started = Date.now();
  clearInterval(progressTimer);
  const tick = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    els['progress-detail'].textContent = `${label} · ${seconds}s so far`;
  };
  tick();
  progressTimer = setInterval(tick, 1000);
}
function hideProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  els['progress-overlay'].hidden = true;
}
function sendForCaptions(file, params, onUploaded, onUploading) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/transcribe?${params}`);
    request.setRequestHeader('Content-Type', file.type || 'video/mp4');
    request.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      onUploading(event.loaded / event.total);
      if (event.loaded >= event.total) onUploaded();
    };
    request.upload.onload = () => onUploaded();
    request.onload = () => {
      let data = {};
      try { data = JSON.parse(request.responseText); } catch { /* keep the empty object */ }
      if (request.status >= 200 && request.status < 300) resolve(data);
      else reject(new Error(data.error || `status ${request.status}`));
    };
    request.onerror = () => reject(new Error('the connection was lost'));
    request.send(file);
  });
}

async function loadVideo(file) {
  const version = ++videoSelectionVersion;
  setCaptionsOn(true);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  els.video.src = objectUrl;
  els.video.load();
  cues = [];
  payload = null;
  currentCueId = null;
  wordCueId = null;
  els.caption.textContent = '';
  els.replay.disabled = true;
  els.next.disabled = true;
  clearTranscript();
  setHasVideo(true);
  const provider = captionProvider();
  if (!provider) {
    message('Captions are not available on this server. The video will play without captions.');
    return;
  }
  message('Creating captions for this video.');
  showProgress('Uploading video…', '0%');
  let switched = false;
  const onUploaded = () => {
    if (switched || version !== videoSelectionVersion) return;
    switched = true;
    showProgress('Generating captions…');
    showElapsed('This can take a minute for a longer video');
    els.transcript.replaceChildren();
    els['translation-status'].textContent = 'Captions are being generated. They will appear here.';
  };
  let sawUploadProgress = false;
  const onUploading = fraction => {
    sawUploadProgress = true;
    if (!switched && version === videoSelectionVersion) els['progress-detail'].textContent = `${Math.round(fraction * 100)}%`;
  };
  setTimeout(() => { if (!sawUploadProgress) onUploaded(); }, 2000);
  try {
    const params = new URLSearchParams({ provider, language: 'auto', mode: 'original', consent: provider === 'hosted' ? 'yes' : 'no' });
    const data = await sendForCaptions(file, params, onUploaded, onUploading);
    if (version !== videoSelectionVersion) return;
    setCaptions(data);
    message(`Captions ready: ${cues.length} lines. Press play.`);
  } catch (error) {
    if (version === videoSelectionVersion) {
      message(`Could not create captions: ${error.message}`);
      els['translation-status'].textContent = 'Captions could not be created for this video.';
    }
  } finally {
    if (version === videoSelectionVersion) hideProgress();
  }
}

async function loadLink(event) {
  event.preventDefault();
  const url = els['video-link'].value.trim();
  if (!url) { message('Paste a link to a video first.'); return; }
  showProgress('Downloading the video…', 'from the link you pasted');
  try {
    const response = await fetch('/api/fetch-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `status ${response.status}`);
    }
    const blob = await response.blob();
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'linked-video.mp4');
    els['video-link'].value = '';
    await loadVideo(new File([blob], name, { type: blob.type }));
  } catch (error) {
    message(`Could not load the link: ${error.message}`);
  } finally {
    hideProgress();
  }
}

function replay() {
  const cue = replayCue(cues, els.video.currentTime);
  if (!cue) { message('There is no caption to replay here.'); return; }
  skipManualPauseForCueId = cue.id;
  lastManualPausedId = null;
  els.video.currentTime = cue.start;
  sync();
  els.video.play().then(
    () => message(`Replaying ${cueLabel(cues, cue).toLowerCase()}.`),
    error => message(`Unable to resume playback: ${error.message}`),
  );
}

function next() {
  const cue = nextCue(cues, els.video.currentTime);
  if (cue) {
    els.video.currentTime = cue.start;
    sync();
    message(`Moved to ${cueLabel(cues, cue).toLowerCase()}. Press Play to continue.`);
  } else message('You are already at the last caption.');
}
els.replay.addEventListener('click', replay);
els.next.addEventListener('click', next);
els['video-file'].addEventListener('change', () => {
  const file = els['video-file'].files?.[0];
  if (file) loadVideo(file);
});
els['link-form'].addEventListener('submit', loadLink);
els['target-language'].addEventListener('change', () => { translateSelected(); showLanguageButton(); });
const LANGUAGE_OPTIONS = [
  { value: '', label: 'Original spoken language', short: 'Original' },
  { value: 'en', label: 'English', short: 'English' },
  { value: 'sw', label: 'Kiswahili', short: 'Kiswahili' },
];
const languageItems = [...els['language-menu'].querySelectorAll('[data-language]')];
function showLanguageButton() {
  const value = els['target-language'].value;
  const option = LANGUAGE_OPTIONS.find(item => item.value === value) ?? LANGUAGE_OPTIONS[0];
  els['language-button'].textContent = option.short;
  els['language-button'].setAttribute('aria-label', `Caption language: ${option.label}`);
  els['language-button'].disabled = els['target-language'].disabled;
  for (const item of languageItems) item.setAttribute('aria-checked', String(item.dataset.language === value));
}
function openLanguageMenu() {
  if (els['language-button'].disabled) return;
  closePaceMenu();
  els['language-menu'].hidden = false;
  els['language-button'].setAttribute('aria-expanded', 'true');
  (languageItems.find(item => item.getAttribute('aria-checked') === 'true') ?? languageItems[0]).focus();
  noteActivity();
}
function closeLanguageMenu({ focusButton = false } = {}) {
  if (els['language-menu'].hidden) return;
  els['language-menu'].hidden = true;
  els['language-button'].setAttribute('aria-expanded', 'false');
  if (focusButton) els['language-button'].focus();
}
els['language-button'].addEventListener('click', () => {
  if (els['language-menu'].hidden) openLanguageMenu(); else closeLanguageMenu();
});
for (const item of languageItems) item.addEventListener('click', () => {
  els['target-language'].value = item.dataset.language;
  els['target-language'].dispatchEvent(new Event('change'));
  closeLanguageMenu({ focusButton: true });
});
els['language-menu'].addEventListener('keydown', event => {
  const index = languageItems.indexOf(document.activeElement);
  const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: languageItems.length - 1 }[event.key];
  if (move !== undefined) {
    event.preventDefault();
    languageItems[(move + languageItems.length) % languageItems.length].focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeLanguageMenu({ focusButton: true });
  } else if (event.key === 'Tab') closeLanguageMenu();
});
document.addEventListener('pointerdown', event => {
  if (!els['language-menu'].hidden && !els['language-wrap'].contains(event.target)) closeLanguageMenu();
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


els['change-video'].addEventListener('click', resetToEmpty);

function applyPace() {
  els.video.playbackRate = speed;
  lastManualPausedId = null;
  sync();
}


const shell = els['video-shell'];
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

const speedRadios = [...els['pace-menu'].querySelectorAll('input[name=speed]')];
function updatePaceButton() {
  const summary = paceSummary({ speed, pauseEachCaption });
  els['pace-text'].textContent = summary.text;
  els['pace-button'].setAttribute('aria-label', summary.ariaLabel);
}
function setSpeed(value, { announce = true } = {}) {
  speed = clampSpeed(value);
  els['speed-slider'].value = String(speed);
  els['speed-slider'].setAttribute('aria-valuetext', speed === 1 ? 'Normal speed' : `${speed} times speed`);
  els['speed-value'].textContent = `${speed}×`;
  for (const radio of speedRadios) radio.checked = Number(radio.value) === speed;
  els['speed-down'].disabled = speed === stepSpeed(speed, -1);
  els['speed-up'].disabled = speed === stepSpeed(speed, 1);
  updatePaceButton();
  applyPace();
  if (announce) message(`Speed: ${speedLabel(speed)}.`);
}
function openPaceMenu() {
  closeLanguageMenu();
  els['pace-menu'].hidden = false;
  els['pace-button'].setAttribute('aria-expanded', 'true');
  (speedRadios.find(radio => radio.checked) ?? els['speed-slider']).focus();
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
for (const radio of speedRadios) radio.addEventListener('change', () => setSpeed(radio.value));
els['speed-slider'].addEventListener('input', () => setSpeed(els['speed-slider'].value));
els['speed-down'].addEventListener('click', () => setSpeed(stepSpeed(speed, -1)));
els['speed-up'].addEventListener('click', () => setSpeed(stepSpeed(speed, 1)));
els['pause-each-caption'].addEventListener('change', () => {
  pauseEachCaption = els['pause-each-caption'].checked;
  updatePaceButton();
  applyPace();
  message(pauseEachCaption ? 'Pausing at each caption.' : 'No longer pausing at each caption.');
});
els['pace-menu'].addEventListener('keydown', event => {
  event.stopPropagation();  // keep player shortcuts (arrows seek) out of the panel
  if (event.key === 'Escape') {
    event.preventDefault();
    closePaceMenu({ focusButton: true });
  }
});
const insidePace = node => els['pace-menu'].contains(node) || els['pace-button'].contains(node);
els['pace-menu'].addEventListener('focusout', event => {
  if (event.relatedTarget && !insidePace(event.relatedTarget)) closePaceMenu();
});
document.addEventListener('pointerdown', event => {
  if (!els['pace-menu'].hidden && !insidePace(event.target)) closePaceMenu();
});


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
    els['caption-settings-button'].setAttribute('aria-expanded', 'false');
    els['caption-settings-button'].focus();
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
  els['caption-settings-button'].setAttribute('aria-expanded', 'true');
  const mount = els['caption-settings-root'];
  const first = mount.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (first) first.focus();
  else { mount.tabIndex = -1; mount.focus(); }
  checkControls();
}


const CAPTIONS_VISIBLE_KEY = 'captionflow.captionsVisible';
let captionsVisible = true;
function setCaptionsOn(visible) {
  captionsVisible = visible;
  captionSettings.setCaptionsVisible(visible);
  els.cc.setAttribute('aria-pressed', String(visible));
  els.cc.setAttribute('aria-label', visible ? 'Captions on' : 'Captions off');
  els.cc.title = visible ? 'Turn captions off (C)' : 'Turn captions on (C)';
  try { browserStorage()?.setItem(CAPTIONS_VISIBLE_KEY, String(visible)); } catch { /* keep in memory */ }
}
function toggleCaptions() {
  setCaptionsOn(!captionsVisible);
  message(captionsVisible ? 'Captions on.' : 'Captions off.');
  noteActivity();
}

const shortcutActions = {
  togglePlay,
  replay: () => { if (!els.replay.disabled) replay(); },
  next: () => { if (!els.next.disabled) next(); },
  toggleCaptions,
  openCaptions: openCaptionSettings,
  closeCaptions: () => captionSettings.cancelAndClose(),
  fullscreen: toggleFullscreen,
  mute: toggleMute,
  seekBack: () => seekBy(-SEEK_STEP_SECONDS),
  seekForward: () => seekBy(SEEK_STEP_SECONDS),
  speedUp: () => setSpeed(stepSpeed(speed, 1)),
  speedDown: () => setSpeed(stepSpeed(speed, -1)),
};
shell.addEventListener('keydown', event => {
  noteActivity();
  if (!els['pace-menu'].hidden || !els['language-menu'].hidden) return;
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
els.cc.addEventListener('click', toggleCaptions);
els['caption-settings-button'].addEventListener('click', openCaptionSettings);
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
setSpeed(1, { announce: false });

els.video.addEventListener('timeupdate', sync);
els.video.addEventListener('seeking', sync);
els.video.addEventListener('seeked', () => { lastManualPausedId = null; sync(); });
els.video.addEventListener('ratechange', sync);
els.video.addEventListener('loadedmetadata', sync);
els.video.addEventListener('durationchange', updateTime);
els.replay.disabled = true;
els.next.disabled = true;
window.addEventListener('beforeunload', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });


setHasVideo(false);
setTranscriptVisible((() => { try { return browserStorage()?.getItem(TRANSCRIPT_VISIBLE_KEY) !== 'false'; } catch { return true; } })());
clearTranscript();
els.replay.disabled = true;
els.next.disabled = true;
try {
  const [providersResponse, prefsResponse] = await Promise.all([fetch('/api/providers'), fetch('/api/preferences')]);
  const providers = await providersResponse.json();
  const prefs = await prefsResponse.json();
  if (!providersResponse.ok || !prefsResponse.ok) throw new Error(providers.error || prefs.error || 'Setup failed');
  providerAvailability = { local: Boolean(providers.providers?.local), hosted: Boolean(providers.providers?.hosted) };
  textAIAvailable = Boolean(providers.textAI);
  selectedProvider = providers.defaultProvider === 'local' ? 'local' : 'hosted';
  captionSettings.loadSavedStyle({ fontScale: prefs.fontScale });
  setCaptionsOn(browserStorage()?.getItem(CAPTIONS_VISIBLE_KEY) !== 'false');
  applyPace();
  message('');
} catch (error) { message(`Setup failed: ${error.message}`); }
