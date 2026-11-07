import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionBoxAndText, captionContrast, contrastRatio, parseHexColor } from '../src/caption-contrast.mjs';

const BASE = { color: '#ffffff', background: '#000000', backgroundOpacity: 0.87, contrast: 'normal' };

test('parses six-digit hex colours only', () => {
  assert.deepEqual(parseHexColor('#ffffff'), [255, 255, 255]);
  assert.equal(parseHexColor('#fff'), null);
  assert.equal(parseHexColor('red'), null);
  assert.equal(parseHexColor('url(x)'), null);
});

test('white on black is 21 to 1', () => {
  assert.ok(Math.abs(contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 1e-9);
});

test('the default translucent style is an estimate, not a guarantee', () => {
  const result = captionContrast(BASE);
  assert.equal(result.translucent, true);
  assert.ok(result.worstCaseRatio < result.boxContrastRatio);
  assert.equal(result.meetsTarget, true);
});

test('an opaque box is exact and not translucent', () => {
  const result = captionContrast({ ...BASE, backgroundOpacity: 1 });
  assert.equal(result.translucent, false);
  assert.equal(result.worstCaseRatio, result.boxContrastRatio);
});

test('a low-contrast pair fails the target', () => {
  const result = captionContrast({ ...BASE, background: '#777777', backgroundOpacity: 1 });
  assert.equal(result.meetsTarget, false);
});

test('high contrast draws white on opaque black whatever the colours', () => {
  assert.deepEqual(captionBoxAndText({ ...BASE, color: '#ffff00', background: '#0000ff', contrast: 'high' }), {
    text: '#ffffff',
    box: '#000000',
    opacity: 1,
  });
});

test('inverted swaps the text and box colours and keeps the box solid', () => {
  assert.deepEqual(captionBoxAndText({ ...BASE, color: '#ffff00', background: '#0000ff', contrast: 'inverted' }), {
    text: '#0000ff',
    box: '#ffff00',
    opacity: 1,
  });
});

test('invalid colours give no result instead of a false pass', () => {
  assert.equal(captionContrast({ ...BASE, color: 'red' }), null);
});
