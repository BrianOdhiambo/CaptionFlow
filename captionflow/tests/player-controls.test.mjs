import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CAPTION_STYLE, CONTRAST_CLASSES, HIDE_CONTROLS_AFTER_MS,
  normalizeCaptionStyle, captionStyleToCss, shouldHideControls, shortcutFor, cueLabel,
  SPEED_PRESETS, MIN_SPEED, MAX_SPEED, clampSpeed, stepSpeed, speedLabel, paceSummary,
} from '../src/player-controls.mjs';

test('captionStyleToCss maps every style key to its CSS variable, with defaults', () => {
  assert.deepEqual(captionStyleToCss({}), {
    vars: {
      '--caption-scale': '1',
      '--caption-font': 'inherit',
      '--caption-color': '#ffffff',
      '--caption-bg': '#000000',
      '--caption-bg-opacity': '0.87',
    },
    contrastClass: 'contrast-normal',
  });
  const css = captionStyleToCss({
    fontScale: 1.6, fontFamily: 'Atkinson Hyperlegible, sans-serif', color: '#ffff00',
    background: '#102030', backgroundOpacity: 0.5, contrast: 'high',
  });
  assert.equal(css.vars['--caption-scale'], '1.6');
  assert.equal(css.vars['--caption-font'], 'Atkinson Hyperlegible, sans-serif');
  assert.equal(css.vars['--caption-color'], '#ffff00');
  assert.equal(css.vars['--caption-bg'], '#102030');
  assert.equal(css.vars['--caption-bg-opacity'], '0.5');
  assert.equal(css.contrastClass, 'contrast-high');
  assert.equal(captionStyleToCss({ contrast: 'inverted' }).contrastClass, 'contrast-inverted');
  assert.deepEqual(CONTRAST_CLASSES, ['contrast-normal', 'contrast-high', 'contrast-inverted']);
});

test('captionStyleToCss handles a missing style and ignores invalid values', () => {
  assert.equal(captionStyleToCss().contrastClass, 'contrast-normal');
  const css = captionStyleToCss({
    fontScale: 'huge', color: 'red; display:none', backgroundOpacity: 7, contrast: 'neon', fontFamily: '',
  });
  assert.equal(css.vars['--caption-scale'], '1');
  assert.equal(css.vars['--caption-color'], '#ffffff');
  assert.equal(css.vars['--caption-bg-opacity'], '1');
  assert.equal(css.vars['--caption-font'], 'inherit');
  assert.equal(css.contrastClass, 'contrast-normal');
});

test('normalizeCaptionStyle keeps the base value for invalid keys and clamps ranges', () => {
  const base = { ...DEFAULT_CAPTION_STYLE, fontScale: 1.3 };
  assert.deepEqual(normalizeCaptionStyle({ fontScale: NaN }, base), base);
  assert.equal(normalizeCaptionStyle({ fontScale: 9 }).fontScale, 2.5);
  assert.equal(normalizeCaptionStyle({ fontScale: 0.1 }).fontScale, 0.8);
  assert.equal(normalizeCaptionStyle({ backgroundOpacity: -1 }).backgroundOpacity, 0);
  assert.equal('unknownKey' in normalizeCaptionStyle({ unknownKey: 1 }), false);
});

test('shouldHideControls hides only while playing, idle, and nothing is open or focused', () => {
  const idlePlaying = { paused: false, menuOpen: false, panelOpen: false, focusInside: false, msSinceActivity: 3000 };
  assert.equal(HIDE_CONTROLS_AFTER_MS, 3000);
  assert.equal(shouldHideControls(idlePlaying), true);
  assert.equal(shouldHideControls({ ...idlePlaying, msSinceActivity: 2999 }), false);
  assert.equal(shouldHideControls({ ...idlePlaying, paused: true }), false);
  assert.equal(shouldHideControls({ ...idlePlaying, menuOpen: true }), false);
  assert.equal(shouldHideControls({ ...idlePlaying, panelOpen: true }), false);
  assert.equal(shouldHideControls({ ...idlePlaying, focusInside: true }), false);
});

const key = (k, extra = {}) => ({ key: k, target: { tagName: 'VIDEO' }, ...extra });

test('shortcutFor maps player keys to actions', () => {
  assert.equal(shortcutFor(key(' ')), 'togglePlay');
  assert.equal(shortcutFor(key('k')), 'togglePlay');
  assert.equal(shortcutFor(key('K')), 'togglePlay');
  assert.equal(shortcutFor(key('r')), 'replay');
  assert.equal(shortcutFor(key('n')), 'next');
  assert.equal(shortcutFor(key('c')), 'openCaptions');
  assert.equal(shortcutFor(key('f')), 'fullscreen');
  assert.equal(shortcutFor(key('M')), 'mute');
  assert.equal(shortcutFor(key('ArrowLeft')), 'seekBack');
  assert.equal(shortcutFor(key('ArrowRight')), 'seekForward');
  assert.equal(shortcutFor(key('x')), null);
  assert.equal(shortcutFor(key('Escape')), null);
});

test('shortcutFor ignores modified keys and keys typed into form fields', () => {
  assert.equal(shortcutFor(key('r', { ctrlKey: true })), null);
  assert.equal(shortcutFor(key('f', { metaKey: true })), null);
  assert.equal(shortcutFor(key('k', { altKey: true })), null);
  assert.equal(shortcutFor(key('k', { target: { tagName: 'INPUT', type: 'text' } })), null);
  assert.equal(shortcutFor(key('k', { target: { tagName: 'INPUT', type: 'search' } })), null);
  assert.equal(shortcutFor(key('k', { target: { tagName: 'SELECT' } })), null);
  assert.equal(shortcutFor(key('k', { target: { tagName: 'TEXTAREA' } })), null);
  assert.equal(shortcutFor(key('k', { target: { tagName: 'DIV', isContentEditable: true } })), null);
  // The seek bar is a range input: shortcuts still work there, arrows seek 5 s.
  assert.equal(shortcutFor(key('ArrowRight', { target: { tagName: 'INPUT', type: 'range' } })), 'seekForward');
  // Space and Enter on a button activate that button natively, not play/pause.
  assert.equal(shortcutFor(key(' ', { target: { tagName: 'BUTTON' } })), null);
  assert.equal(shortcutFor(key('n', { target: { tagName: 'BUTTON' } })), 'next');
});

test('shortcutFor ignores everything except Esc while the caption panel is open', () => {
  assert.equal(shortcutFor(key('k'), { panelOpen: true }), null);
  assert.equal(shortcutFor(key('ArrowLeft'), { panelOpen: true }), null);
  assert.equal(shortcutFor(key('Escape'), { panelOpen: true }), 'closeCaptions');
  assert.equal(shortcutFor(key('Escape', { target: { tagName: 'SELECT' } }), { panelOpen: true }), 'closeCaptions');
});

test('cueLabel gives a position, never an internal id', () => {
  const cues = [{ id: 'seg-001' }, { id: 'seg-002' }, { id: 'seg-003' }, { id: 'seg-004' }, { id: 'seg-005' }];
  assert.equal(cueLabel(cues, cues[1]), 'Caption 2 of 5');
  assert.equal(cueLabel(cues, { id: 'seg-005' }), 'Caption 5 of 5');
  assert.equal(cueLabel(cues, null), '');
  assert.equal(cueLabel(cues, { id: 'missing' }), '');
  assert.doesNotMatch(cueLabel(cues, cues[0]), /seg-/);
});

test('clampSpeed rounds to 0.05 steps, clamps to 0.25-2, and falls back to normal', () => {
  assert.equal(clampSpeed(0.87), 0.85);
  assert.equal(clampSpeed(0.88), 0.9);
  assert.equal(clampSpeed('1.5'), 1.5);
  assert.equal(clampSpeed(0.1), MIN_SPEED);
  assert.equal(clampSpeed(3), MAX_SPEED);
  assert.equal(clampSpeed(NaN), 1);
  assert.equal(clampSpeed(undefined), 1);
  for (const preset of SPEED_PRESETS) assert.equal(clampSpeed(preset), preset);
});

test('stepSpeed moves one step and stops at the bounds', () => {
  assert.equal(stepSpeed(1, 1), 1.05);
  assert.equal(stepSpeed(1, -1), 0.95);
  assert.equal(stepSpeed(0.25, -1), 0.25);
  assert.equal(stepSpeed(2, 1), 2);
  assert.equal(stepSpeed(0.85, 1), 0.9);
});

test('speedLabel and paceSummary describe the pace for sighted and screen reader users', () => {
  assert.equal(speedLabel(1), 'Normal');
  assert.equal(speedLabel(0.75), '0.75×');
  assert.deepEqual(paceSummary({}), { text: 'Pace: Normal', ariaLabel: 'Reading pace: normal speed' });
  assert.deepEqual(paceSummary({ speed: 0.75, pauseEachCaption: true }), {
    text: 'Pace: 0.75× · Pause',
    ariaLabel: 'Reading pace: 0.75 times speed, pausing at each caption',
  });
});

test('shortcutFor maps Shift+> and Shift+< to speed, but not in form fields', () => {
  assert.equal(shortcutFor({ key: '>', shiftKey: true, target: { tagName: 'VIDEO' } }), 'speedUp');
  assert.equal(shortcutFor({ key: '<', shiftKey: true, target: { tagName: 'BUTTON' } }), 'speedDown');
  assert.equal(shortcutFor({ key: '>', shiftKey: true, target: { tagName: 'INPUT', type: 'search' } }), null);
});
