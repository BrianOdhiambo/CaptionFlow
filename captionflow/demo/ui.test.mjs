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
  assert.equal($('#pace-button').getAttribute('aria-controls'), 'pace-menu');
  assert.equal($('#pace-button').getAttribute('aria-haspopup'), 'menu');
  const options = [...document.querySelectorAll('#pace-menu [role=menuitemradio]')].map(item => item.dataset.pace);
  assert.deepEqual(options, ['normal', 'slow', '0.5', '0.25', 'manual']);
});

test('the transcript toggle sits in the bar and controls the transcript panel', () => {
  const toggle = $('#transcript-toggle');
  assert.ok(toggle.closest('.bar-right'));
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.getAttribute('aria-controls'), 'transcript-panel');
  assert.equal(accessibleName(toggle), 'Transcript');
  assert.ok($('#transcript-panel').classList.contains('transcript-panel'));
});

test('the transcript options include a Summarise item next to the key points section', () => {
  const button = $('#summarise-transcript');
  assert.ok($('#transcript-options').contains(button));
  assert.equal(button.disabled, true);
  assert.match(button.textContent, /Summarise transcript/);
  assert.ok($('#watch-layout').contains($('#summary-section')), 'key points render in the watch area');
  assert.equal($('#transcript-panel').contains($('#summary-section')), false, 'key points stay visible when the transcript is hidden');
  assert.ok($('#summary-section').contains($('#summarize')));
});

test('the transcript options live in a hidden disclosure in the panel header', () => {
  const button = $('#transcript-options-button');
  const options = $('#transcript-options');
  assert.ok(button.closest('.transcript-header'), 'options button is in the transcript header');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-controls'), 'transcript-options');
  assert.equal(accessibleName(button), 'Transcript options');
  assert.equal(options.hidden, true);
  for (const id of ['follow', 'show-times', 'transcript-size', 'download-transcript']) {
    assert.ok(options.querySelector(`#${id}`), `#${id} is inside #transcript-options`);
  }
});

test('transcript search is one labelled row with named previous/next match buttons', () => {
  const input = $('#transcript-search');
  assert.ok(document.querySelector('label[for=transcript-search]'), 'search input keeps its label');
  const row = input.closest('.search-row');
  assert.ok(row, 'search input is in .search-row');
  assert.equal(accessibleName($('#search-prev')), 'Previous match');
  assert.equal(accessibleName($('#search-next')), 'Next match');
  assert.ok(row.contains($('#search-prev')) && row.contains($('#search-next')));
});

test('the time readout sits in the left button group, after Next', () => {
  const left = $('#player-bar .bar-left');
  assert.equal($('#time').parentElement, left);
  assert.equal($('#time').previousElementSibling, $('#next'));
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
