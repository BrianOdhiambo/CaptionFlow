import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createCaptionFlowDemoServer } from './server.mjs';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const { document } = new JSDOM(html).window;
const $ = selector => document.querySelector(selector);

function accessibleName(element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  return (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();
}

test('the control bar and caption settings mount live inside #video-shell', () => {
  const shell = $('#video-shell');
  assert.ok(shell, '#video-shell exists');
  for (const id of ['video', 'caption-wrap', 'player-bar', 'play', 'replay', 'next', 'time', 'seek', 'pace-button', 'pace-menu', 'cc', 'mute', 'fullscreen', 'player-hint']) {
    assert.ok(shell.querySelector(`#${id}`), `#${id} is inside #video-shell`);
  }
  const mount = $('#caption-settings-root');
  assert.equal(mount.parentElement, shell);
  assert.ok(mount.classList.contains('caption-settings-root'));
  assert.equal(mount.hidden, true);
  assert.equal($('#seek').type, 'range');
});

test('the video has no native controls', () => {
  assert.equal($('#video').hasAttribute('controls'), false);
});

test('every button has an accessible name and every icon is hidden from assistive tech', () => {
  const buttons = [...document.querySelectorAll('button')];
  assert.ok(buttons.length > 10);
  for (const button of buttons) assert.notEqual(accessibleName(button), '', `button ${button.id || button.outerHTML} needs a name`);
  for (const svg of document.querySelectorAll('svg')) assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.notEqual(accessibleName($('#seek')), '');
});

test('bar buttons show only icons and their short text label', () => {
  for (const button of document.querySelectorAll('#player-bar .bar-btn')) {
    const clone = button.cloneNode(true);
    clone.querySelectorAll('.bar-text').forEach(span => span.remove());
    assert.equal(clone.textContent.trim(), '', `#${button.id} has stray text`);
    assert.ok(button.querySelector('svg.icon'), `#${button.id} has an icon`);
  }
  assert.equal($('#replay').querySelector('.icon-play, .icon-pause'), null);
});

test('the CC and pace buttons expose their popups', () => {
  assert.equal($('#cc').getAttribute('aria-expanded'), 'false');
  assert.equal($('#cc').getAttribute('aria-controls'), 'caption-settings-root');
  assert.equal($('#pace-button').getAttribute('aria-expanded'), 'false');
  assert.equal($('#pace-button').getAttribute('aria-haspopup'), 'menu');
  const options = [...document.querySelectorAll('#pace-menu [role=menuitemradio]')].map(item => item.dataset.pace);
  assert.deepEqual(options, ['normal', '0.25', '0.5', '0.75', '1.25', '1.5', '1.75', '2', 'manual']);
});

test('the old controls under the video and in panel 3 are gone', () => {
  for (const id of ['pace', 'size', 'undo', 'contrast']) assert.equal(document.getElementById(id), null, `#${id} removed`);
  assert.match($('[aria-labelledby=prefs-title]').textContent, /CC/);
});

test('the server serves the new browser modules', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'captionflow-ui-'));
  const server = await createCaptionFlowDemoServer({ storageDir, userId: 'ui-test' });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/player-controls.mjs', '/caption-settings-port.mjs']) {
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