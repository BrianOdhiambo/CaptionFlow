import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = name => readFile(new URL(name, import.meta.url), 'utf8');

test('the upload and link controls exist and the player bar remains intact', async () => {
  const [html, app] = await Promise.all([load('./index.html'), load('./app.js')]);
  for (const id of ['video-file', 'video-link', 'load-link', 'empty-state', 'video-shell', 'player-bar', 'pace-button', 'pace-menu', 'caption-settings-root', 'cc', 'replay', 'next', 'change-video']) {
    assert.match(html, new RegExp(`id="${id}"`), `HTML missing #${id}`);
  }
  assert.match(app, /connectCaptionSettingsPort/);
  assert.match(app, /\/api\/fetch-link/);
  assert.match(app, /\/api\/transcribe/);
  assert.match(html, /name="speed" value="0\.25"/);
  assert.match(html, /name="speed" value="0\.5"/);
});

test('caption settings panel uses teammate port and has apply/cancel and color controls', async () => {
  const [panel, server] = await Promise.all([load('./caption-settings-panel.mjs'), load('./server.mjs')]);
  assert.match(panel, /registerCaptionSettingsPanel/);
  assert.match(panel, /applyAndClose/);
  assert.match(panel, /dismissAndClose/);
  assert.match(panel, /Text color/);
  assert.match(panel, /Background color/);
  assert.match(server, /'\/caption-settings-panel\.mjs'/);
  assert.match(server, /'\/caption-settings-port\.mjs'/);
});