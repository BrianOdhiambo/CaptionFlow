import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = name => readFile(new URL(name, import.meta.url), 'utf8');

test('all new text-AI control IDs exist and the player bar remains intact', async () => {
  const [html, app] = await Promise.all([load('./index.html'), load('./app.js')]);
  for (const id of ['target-language', 'translate', 'translation-status', 'text-ai-consent',
    'summarize', 'summary-status', 'summary-points', 'transcript', 'transcript-search',
    'video-shell', 'pace-button', 'pace-menu', 'caption-settings-root', 'cc']) {
    assert.match(html, new RegExp(`id="${id}"`), `HTML missing #${id}`);
  }
  assert.match(app, /sentenceReplayRange\(payload\?\.transcript\?\.segments/);
  assert.match(app, /connectCaptionSettingsPort/);
  assert.match(app, /\/api\/translate/);
  assert.match(app, /\/api\/summarize/);
  assert.match(html, /data-pace="0\.25"/);
  assert.match(html, /data-pace="0\.5"/);
  assert.match(html, /class="watch-layout"/);
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