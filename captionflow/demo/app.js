import { selectActiveCue, nextCue, replayCue } from '/player-sync.mjs';
import { HIDE_CONTROLS_AFTER_MS, shouldHideControls, shortcutFor, cueLabel, clampSpeed, stepSpeed, speedLabel, paceSummary } from '/player-controls.mjs';
import { connectCaptionSettingsPort } from '/caption-settings-port.mjs';
import '/caption-settings-panel.mjs';
import { wordTimings, activeWordIndex as spokenWordIndex } from '/caption-words.mjs';

const byId = id => document.getElementById(id);
const ids = ['video', 'video-file', 'video-link', 'load-link', 'link-form', 'empty-state', 'change-video', 'video-shell',
  'player-bar', 'player-hint', 'play', 'time', 'seek', 'replay', 'next', 'pace-button', 'pace-text', 'pace-menu',
  'speed-slider', 'speed-value', 'speed-down', 'speed-up', 'pause-each-caption', 'cc', 'mute', 'fullscreen',
  'caption', 'caption-wrap', 'caption-settings-root', 'message'];
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
  currentCueId = cue?.id ?? null;
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
  sync();
  els.replay.disabled = false;
  els.next.disabled = false;
}

function resetToEmpty() {
  videoSelectionVersion++;
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
  setHasVideo(false);
  message('');
}

function captionProvider() {
  if (providerAvailability[selectedProvider]) return selectedProvider;
  return ['local', 'hosted'].find(name => providerAvailability[name]) ?? null;
}

async function loadVideo(file) {
  const version = ++videoSelectionVersion;
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
  setHasVideo(true);
  const provider = captionProvider();
  if (!provider) {
    message('Captions are not available on this server. The video will play without captions.');
    return;
  }
  message('Creating captions. This can take a minute for a longer video.');
  try {
    const params = new URLSearchParams({ provider, language: 'auto', mode: 'original', consent: provider === 'hosted' ? 'yes' : 'no' });
    const response = await fetch(`/api/transcribe?${params}`, {
      method: 'POST', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `status ${response.status}`);
    if (version !== videoSelectionVersion) return;
    setCaptions(data);
    message(`Captions ready: ${cues.length} lines. Press play.`);
  } catch (error) {
    if (version === videoSelectionVersion) message(`Could not create captions: ${error.message}`);
  }
}

async function loadLink(event) {
  event.preventDefault();
  const url = els['video-link'].value.trim();
  if (!url) { message('Paste a link to a video first.'); return; }
  message('Downloading the video from the link.');
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
  speedUp: () => setSpeed(stepSpeed(speed, 1)),
  speedDown: () => setSpeed(stepSpeed(speed, -1)),
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
els.replay.disabled = true;
els.next.disabled = true;
try {
  const [providersResponse, prefsResponse] = await Promise.all([fetch('/api/providers'), fetch('/api/preferences')]);
  const providers = await providersResponse.json();
  const prefs = await prefsResponse.json();
  if (!providersResponse.ok || !prefsResponse.ok) throw new Error(providers.error || prefs.error || 'Setup failed');
  providerAvailability = { local: Boolean(providers.providers?.local), hosted: Boolean(providers.providers?.hosted) };
  selectedProvider = providers.defaultProvider === 'local' ? 'local' : 'hosted';
  captionSettings.loadSavedStyle({ fontScale: prefs.fontScale });
  applyPace();
  message('');
} catch (error) { message(`Setup failed: ${error.message}`); }
