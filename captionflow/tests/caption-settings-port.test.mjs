import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionSettingsPort, STORAGE_KEY } from '../src/caption-settings-port.mjs';

function fakeElement() {
  const classes = new Set();
  const props = new Map();
  return {
    hidden: true,
    children: [],
    props,
    style: { setProperty: (name, value) => props.set(name, value) },
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (name, force) => { (force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name); },
      contains: name => classes.has(name),
    },
    replaceChildren() { this.children = []; },
  };
}

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}

function setup({ savedFontScale = 1, stored, serverFontScale } = {}) {
  const captionWrap = fakeElement();
  const mount = fakeElement();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ fontScale: serverFontScale ?? body.value }) };
  };
  const storage = fakeStorage(stored ? { [STORAGE_KEY]: JSON.stringify(stored) } : {});
  const events = [];
  const placeholder = { open: () => events.push('placeholder-open'), close: () => events.push('placeholder-close') };
  const port = createCaptionSettingsPort({
    captionWrap, mount, fetch: fetchImpl, storage, placeholder,
    onOpen: () => events.push('open'),
    onClose: reason => events.push(`close:${reason}`),
  });
  port.loadSavedStyle({ fontScale: savedFontScale });
  return { port, captionWrap, mount, calls, storage, events };
}

test('live setCaptionStyle updates CSS variables and contrast class without calling the server', () => {
  const { port, captionWrap, calls } = setup();
  port.openPanel();
  port.setCaptionStyle({ fontScale: 2, color: '#ffff00', contrast: 'high' });
  assert.equal(captionWrap.props.get('--caption-scale'), '2');
  assert.equal(captionWrap.props.get('--caption-color'), '#ffff00');
  assert.equal(captionWrap.classList.contains('contrast-high'), true);
  assert.equal(captionWrap.classList.contains('contrast-normal'), false);
  port.setCaptionStyle({ fontScale: 1.3 });
  assert.equal(port.getCaptionStyle().fontScale, 1.3);
  assert.equal(calls.length, 0);
});

test('setCaptionStyle rejects keys that are not in the contract table', () => {
  const { port } = setup();
  assert.throws(() => port.setCaptionStyle({ letterSpacing: 2 }), /letterSpacing/);
});

test('cancelAndClose restores the style from when the panel opened and saves nothing', async () => {
  const { port, captionWrap, calls, storage, events, mount } = setup({ savedFontScale: 1.3 });
  port.openPanel();
  assert.equal(mount.hidden, false);
  port.setCaptionStyle({ fontScale: 2.5, background: '#203040' });
  port.resetCaptionStyle();
  assert.equal(port.getCaptionStyle().fontScale, 1);
  await port.cancelAndClose();
  assert.equal(port.getCaptionStyle().fontScale, 1.3);
  assert.equal(port.getCaptionStyle().background, '#000000');
  assert.equal(captionWrap.props.get('--caption-scale'), '1.3');
  assert.equal(calls.length, 0);
  assert.equal(storage.data.size, 0);
  assert.equal(mount.hidden, true);
  assert.equal(port.isOpen(), false);
  assert.deepEqual(events, ['placeholder-open', 'open', 'placeholder-close', 'close:cancel']);
});

test('applyAndClose saves fontScale through the endpoint only when it changed, other keys to localStorage', async () => {
  const { port, calls, storage, events } = setup({ savedFontScale: 1 });
  port.openPanel();
  port.setCaptionStyle({ fontScale: 1.6, color: '#ffff00', contrast: 'inverted' });
  const result = await port.applyAndClose();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/font-scale');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { value: 1.6 });
  const stored = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.equal(stored.color, '#ffff00');
  assert.equal(stored.contrast, 'inverted');
  assert.equal('fontScale' in stored, false);
  assert.equal(result.fontScaleSaved, true);
  assert.equal(events.at(-1), 'close:apply');

  // A second apply with the same font scale makes no server call.
  port.openPanel();
  port.setCaptionStyle({ color: '#00ff00' });
  await port.applyAndClose();
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(storage.data.get(STORAGE_KEY)).color, '#00ff00');
});

test('applyAndClose reports a failed save to the player', async () => {
  const captionWrap = fakeElement();
  const saved = [];
  const port = createCaptionSettingsPort({
    captionWrap, mount: fakeElement(), storage: fakeStorage(), placeholder: { open() {}, close() {} },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({ error: 'disk full' }) }),
    onSaved: result => saved.push(result),
  });
  port.loadSavedStyle({ fontScale: 1 });
  port.openPanel();
  port.setCaptionStyle({ fontScale: 2 });
  const result = await port.applyAndClose();
  assert.equal(result.fontScaleSaved, false);
  assert.match(result.error.message, /disk full/);
  assert.deepEqual(saved, [result]);
});

test('applyAndClose uses the font scale the server confirms', async () => {
  const { port, captionWrap } = setup({ serverFontScale: 2 });
  port.openPanel();
  port.setCaptionStyle({ fontScale: 2.1 });
  await port.applyAndClose();
  assert.equal(port.getCaptionStyle().fontScale, 2);
  assert.equal(captionWrap.props.get('--caption-scale'), '2');
});

test('loadSavedStyle combines the profile font scale with localStorage keys', () => {
  const { port, captionWrap } = setup({ savedFontScale: 1.6, stored: { color: '#ffff00', fontScale: 2.5, bogus: 1 } });
  const style = port.getCaptionStyle();
  assert.equal(style.fontScale, 1.6, 'font scale comes from the toolkit profile, not localStorage');
  assert.equal(style.color, '#ffff00');
  assert.equal(captionWrap.props.get('--caption-color'), '#ffff00');
});

test('a registered panel replaces the placeholder and receives the current style', async () => {
  const { port, mount } = setup();
  const seen = [];
  port.registerCaptionSettingsPanel({
    open: (container, style) => seen.push(['open', container, style.fontScale]),
    close: () => seen.push(['close']),
  });
  port.openPanel();
  assert.deepEqual(seen[0], ['open', mount, 1]);
  await port.cancelAndClose();
  assert.deepEqual(seen[1], ['close']);
  assert.throws(() => port.registerCaptionSettingsPanel({ open() {} }), /close/);
});

test('setCaptionsVisible toggles one class on the caption wrapper', () => {
  const { port, captionWrap } = setup();
  assert.equal(captionWrap.classList.contains('captions-hidden'), false);
  port.setCaptionsVisible(false);
  assert.equal(captionWrap.classList.contains('captions-hidden'), true);
  port.setCaptionsVisible(true);
  assert.equal(captionWrap.classList.contains('captions-hidden'), false);
});

test('the shared port accepts a panel registered before the player connects', async () => {
  const shared = await import('../src/caption-settings-port.mjs');
  assert.throws(() => shared.setCaptionStyle({ fontScale: 2 }), /not connected/);
  assert.equal(shared.getCaptionStyle().fontScale, 1);
  const opened = [];
  shared.registerCaptionSettingsPanel({ open: (container) => opened.push(container), close() {} });
  const mount = fakeElement();
  const captionWrap = fakeElement();
  const port = shared.connectCaptionSettingsPort({ captionWrap, mount, fetch: async () => { throw new Error('no server'); }, storage: fakeStorage(), placeholder: { open() {}, close() {} } });
  port.openPanel();
  assert.deepEqual(opened, [mount]);
  shared.setCaptionStyle({ fontScale: 2 });
  assert.equal(captionWrap.props.get('--caption-scale'), '2');
  await shared.cancelAndClose();
  assert.equal(shared.getCaptionStyle().fontScale, 1);
});
