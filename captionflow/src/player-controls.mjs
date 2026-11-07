/** Pure logic for the in-player control bar: caption style to CSS, auto-hide,
 * keyboard shortcuts and caption labels. No DOM access, so it is unit tested
 * in Node and served to the browser at /player-controls.mjs.
 */
export const HIDE_CONTROLS_AFTER_MS = 3000;

export const DEFAULT_CAPTION_STYLE = Object.freeze({
  fontScale: 1,
  fontFamily: 'inherit',
  color: '#ffffff',
  background: '#000000',
  backgroundOpacity: 0.87,
  contrast: 'normal',
});

export const CAPTION_STYLE_KEYS = Object.freeze(Object.keys(DEFAULT_CAPTION_STYLE));
export const CONTRAST_MODES = Object.freeze(['normal', 'high', 'inverted']);
export const CONTRAST_CLASSES = Object.freeze(CONTRAST_MODES.map(mode => `contrast-${mode}`));

// Font scale bounds match validatePreferences in contracts.mjs.
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.5;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// A CSS value set through setProperty: reject anything that could close the declaration.
const safeCssText = value => typeof value === 'string' && value.trim() !== '' && !/[;{}<>\\]/.test(value);

/** Merge a (partial) style onto a base; invalid values keep the base value. */
export function normalizeCaptionStyle(style = {}, base = DEFAULT_CAPTION_STYLE) {
  const out = { ...DEFAULT_CAPTION_STYLE, ...base };
  const input = style ?? {};
  if (Number.isFinite(input.fontScale)) out.fontScale = clamp(input.fontScale, MIN_SCALE, MAX_SCALE);
  if (Number.isFinite(input.backgroundOpacity)) out.backgroundOpacity = clamp(input.backgroundOpacity, 0, 1);
  for (const name of ['fontFamily', 'color', 'background']) {
    if (safeCssText(input[name])) out[name] = input[name].trim();
  }
  if (CONTRAST_MODES.includes(input.contrast)) out.contrast = input.contrast;
  return out;
}

/** Style object to the CSS custom properties and contrast class on #caption-wrap. */
export function captionStyleToCss(style) {
  const s = normalizeCaptionStyle(style);
  return {
    vars: {
      '--caption-scale': String(s.fontScale),
      '--caption-font': s.fontFamily,
      '--caption-color': s.color,
      '--caption-bg': s.background,
      '--caption-bg-opacity': String(s.backgroundOpacity),
    },
    contrastClass: `contrast-${s.contrast}`,
  };
}

/** True only when playing, nothing is open, focus is outside the bar, and the viewer is idle. */
export function shouldHideControls({ paused, menuOpen, panelOpen, focusInside, msSinceActivity }) {
  return !paused && !menuOpen && !panelOpen && !focusInside && msSinceActivity >= HIDE_CONTROLS_AFTER_MS;
}

const KEY_ACTIONS = {
  ' ': 'togglePlay', k: 'togglePlay', r: 'replay', n: 'next', c: 'openCaptions',
  f: 'fullscreen', m: 'mute', arrowleft: 'seekBack', arrowright: 'seekForward',
};
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);

function isTextEntry(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && TEXT_INPUT_TYPES.has(String(target.type || 'text').toLowerCase());
}

/** Keyboard event to a player action name, or null when the key is not a shortcut here. */
export function shortcutFor(event, { panelOpen = false } = {}) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (panelOpen) return event.key === 'Escape' ? 'closeCaptions' : null;
  if (isTextEntry(event.target)) return null;
  const action = KEY_ACTIONS[String(event.key).toLowerCase()] ?? null;
  // Space on a button activates that button natively; do not also toggle play.
  if (action === 'togglePlay' && event.key === ' ' && String(event.target?.tagName || '').toUpperCase() === 'BUTTON') return null;
  return action;
}

/** "Caption 2 of 5" for the viewer; internal ids such as seg-001 are never shown. */
export function cueLabel(cues, cue) {
  if (!cue || !Array.isArray(cues)) return '';
  const index = cues.findIndex(c => c.id === cue.id);
  return index < 0 ? '' : `Caption ${index + 1} of ${cues.length}`;
}
