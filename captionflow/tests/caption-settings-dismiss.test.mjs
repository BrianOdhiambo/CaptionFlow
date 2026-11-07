import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionSettingsPort, STORAGE_KEY } from '../src/caption-settings-port.mjs';

function fakeElement() {
  const props = new Map();
  return {
    hidden: true,
    props,
    style: { setProperty: (name, value) => props.set(name, value) },
    classList: { add() {}, remove() {}, toggle() {} },
    replaceChildren() {},
  };
}

function setup() {
  const storage = new Map();
  const closes = [];
  const panel = { open() {}, close() {} };
  const port = createCaptionSettingsPort({
    captionWrap: fakeElement(),
    mount: fakeElement(),
    fetch: async () => ({ ok: true, json: async () => ({ fontScale: 1 }) }),
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    placeholder: panel,
    onClose: reason => closes.push(reason),
    onSaved() {},
  });
  port.registerCaptionSettingsPanel(panel);
  return { port, storage, closes };
}

test('X keeps the look chosen in this visit and saves nothing', () => {
  const { port, storage, closes } = setup();
  port.openPanel();
  port.setCaptionStyle({ color: '#facc15' });
  port.dismissAndClose();
  assert.equal(port.getCaptionStyle().color, '#facc15');
  assert.equal(port.isOpen(), false);
  assert.deepEqual(closes, ['dismiss']);
  assert.equal(storage.has(STORAGE_KEY), false);
});

test('Esc still reverts to the style at open', () => {
  const { port, closes } = setup();
  port.openPanel();
  port.setCaptionStyle({ color: '#22c55e' });
  port.cancelAndClose();
  assert.equal(port.getCaptionStyle().color, '#ffffff');
  assert.deepEqual(closes, ['cancel']);
});

test('X does nothing when no panel is open', () => {
  const { port, closes } = setup();
  port.dismissAndClose();
  assert.deepEqual(closes, []);
});
