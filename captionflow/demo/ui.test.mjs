import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createCaptionFlowDemoServer } from './server.mjs';
import { SPEED_PRESETS, MIN_SPEED, MAX_SPEED, SPEED_STEP } from '../src/player-controls.mjs';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const { document } = new JSDOM(html).window;
const $ = selector => document.querySelector(selector);

function accessibleName(element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  return (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
}

test('the empty state offers an upload button and a link field before any video is loaded', () => {
  assert.ok($('#video-shell').classList.contains('no-video'));
  assert.equal($('#empty-state').hidden, false);
  assert.equal($('label[for=video-file]').textContent.trim(), 'Upload video');
  assert.equal($('#video-file').type, 'file');
  assert.equal($('#video-link').type, 'url');
  assert.ok(document.querySelector('label[for=video-link]'), 'link field keeps its label');
  assert.equal(accessibleName($('#load-link')), 'Load link');
});

test('the page is only the video section: no transcript, AI, caption JSON or provider controls', () => {
  for (const id of ['transcript-panel', 'transcript', 'transcript-search', 'summarize', 'translate', 'target-language',
    'text-ai-consent', 'download-json', 'download-transcript', 'caption-file', 'provider', 'language', 'mode',
    'hosted-consent', 'transcript-toggle', 'time-status', 'demo-warning']) {
    assert.equal(document.getElementById(id), null, `#${id} removed`);
  }
});

test('the control bar and caption settings mount live inside #video-shell', () => {
  const shell = $('#video-shell');
  assert.equal($('#player-bar').parentElement, shell);
  assert.equal($('#caption-settings-root').parentElement, shell);
  assert.ok($('#caption-settings-root').classList.contains('caption-settings-root'));
});

test('the video has no native controls', () => {
  assert.equal($('#video').hasAttribute('controls'), false);
});

test('every control in the video section has an accessible name', () => {
  for (const button of document.querySelectorAll('#video-shell button, #empty-state .btn')) {
    assert.ok(accessibleName(button), `${button.id || button.className} has a name`);
  }
});

test('the change-video button lets the viewer return to the upload options', () => {
  assert.equal(accessibleName($('#change-video')), 'Change video');
});

test('the CC and pace buttons expose their popups', () => {
  assert.equal($('#cc').getAttribute('aria-controls'), 'caption-settings-root');
  assert.equal($('#cc').getAttribute('aria-expanded'), 'false');
  assert.equal($('#pace-button').getAttribute('aria-controls'), 'pace-menu');
  assert.equal($('#pace-button').getAttribute('aria-expanded'), 'false');
  assert.equal($('#pace-button').hasAttribute('aria-haspopup'), false, 'the pace panel is a disclosure, not a menu');
});

test('the pace panel offers speed presets, a custom slider and a separate pause toggle', () => {
  const panel = $('#pace-menu');
  assert.equal(panel.parentElement, $('#video-shell'));
  assert.equal(panel.hidden, true);
  const presets = [...panel.querySelectorAll('input[type=radio][name=speed]')].map(radio => Number(radio.value));
  assert.deepEqual(presets, [...SPEED_PRESETS]);
  assert.equal(panel.querySelector('input[name=speed]:checked').value, '1');
  const slider = $('#speed-slider');
  assert.equal(slider.type, 'range');
  assert.deepEqual([Number(slider.min), Number(slider.max), Number(slider.step)], [MIN_SPEED, MAX_SPEED, SPEED_STEP]);
  assert.equal($('#pause-each-caption').type, 'checkbox');
  assert.equal($('#pause-each-caption').checked, false);
});

test('the replay button names a single caption, not a sentence', () => {
  assert.equal(accessibleName($('#replay')), 'Replay this caption');
});

test('the server serves the new browser modules', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'captionflow-ui-'));
  const server = await createCaptionFlowDemoServer({ storageDir, userId: 'ui-test' });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/player-controls.mjs', '/caption-settings-port.mjs', '/caption-settings-panel.mjs', '/caption-contrast.mjs', '/caption-words.mjs']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /javascript/);
      await response.text();
    }
  } finally {
    server.close();
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('the link route refuses private addresses before downloading anything', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'captionflow-link-'));
  const server = await createCaptionFlowDemoServer({ storageDir, userId: 'link-test' });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/api/fetch-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1/clip.mp4' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not allowed/);
  } finally {
    server.close();
    await rm(storageDir, { recursive: true, force: true });
  }
});
