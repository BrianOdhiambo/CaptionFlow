/** The contract between the CaptionFlow player and a caption settings panel
 * (see docs/captionflow/PLAYER_CONTROLS_SPEC.md). The panel renders into the
 * player's mount and calls the exported functions; the player owns applying
 * styles to the captions and all saving. The panel never calls the server.
 *
 * Served to the browser at /caption-settings-port.mjs. Every importer gets the
 * same module instance, so the player and the panel share one port.
 */
import { CAPTION_STYLE_KEYS, CONTRAST_CLASSES, DEFAULT_CAPTION_STYLE, captionStyleToCss, normalizeCaptionStyle } from './player-controls.mjs';

export const STORAGE_KEY = 'captionflow.captionStyle';

function assertPanel(panel) {
  if (!panel || typeof panel.open !== 'function' || typeof panel.close !== 'function') {
    throw new TypeError('A caption settings panel needs open(container, style) and close() functions');
  }
}

/** Player-side factory. DOM, network and storage are injected so tests can fake them.
 * deps: { captionWrap, mount, fetch, storage, placeholder, onOpen(), onClose(reason), onSaved(result) }
 * onClose reason is 'apply' or 'cancel'; onSaved gets { fontScaleSaved, error } after an Apply.
 */
export function createCaptionSettingsPort({ captionWrap, mount, fetch: fetchImpl, storage, placeholder, onOpen, onClose, onSaved }) {
  let style = { ...DEFAULT_CAPTION_STYLE };
  let savedFontScale = style.fontScale;
  let styleAtOpen = null;
  let panel = null;
  let activePanel = null;

  function render() {
    const { vars, contrastClass } = captionStyleToCss(style);
    for (const [name, value] of Object.entries(vars)) captionWrap.style.setProperty(name, value);
    captionWrap.classList.remove(...CONTRAST_CLASSES);
    captionWrap.classList.add(contrastClass);
  }

  function close(reason) {
    if (!activePanel) return;
    const closing = activePanel;
    activePanel = null;
    styleAtOpen = null;
    closing.close();
    mount.replaceChildren();
    mount.hidden = true;
    onClose?.(reason);
  }

  async function save() {
    const result = { fontScaleSaved: false, error: null };
    const { fontScale, ...rest } = style;
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(rest)); }
    catch (error) { result.error = error; }
    if (fontScale === savedFontScale) return result;
    try {
      const response = await fetchImpl('/api/font-scale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: fontScale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Saving text size failed with status ${response.status}`);
      savedFontScale = data.fontScale;
      style = normalizeCaptionStyle({ fontScale: data.fontScale }, style);
      render();
      result.fontScaleSaved = true;
    } catch (error) { result.error = error; }
    return result;
  }

  return {
    registerCaptionSettingsPanel(next) { assertPanel(next); panel = next; },

    setCaptionStyle(partialStyle) {
      const unknown = Object.keys(partialStyle ?? {}).filter(key => !CAPTION_STYLE_KEYS.includes(key));
      if (unknown.length) throw new TypeError(`Unknown caption style key: ${unknown.join(', ')}. Add it to the contract table first.`);
      style = normalizeCaptionStyle(partialStyle, style);
      render();
    },

    resetCaptionStyle() { style = { ...DEFAULT_CAPTION_STYLE }; render(); },

    /** Apply: keep the current style, close, then save. Resolves with { fontScaleSaved, error }. */
    async applyAndClose() {
      if (!activePanel) return { fontScaleSaved: false, error: null };
      close('apply');
      const result = await save();
      onSaved?.(result);
      return result;
    },

    /** X or Esc: put back the style from when the panel opened. Nothing is saved. */
    async cancelAndClose() {
      if (!activePanel) return;
      style = styleAtOpen;
      render();
      close('cancel');
    },

    getCaptionStyle() { return { ...style }; },

    setCaptionsVisible(visible) { captionWrap.classList.toggle('captions-hidden', !visible); },

    // Player-only below.
    openPanel() {
      if (activePanel) return;
      styleAtOpen = { ...style };
      activePanel = panel ?? placeholder;
      mount.hidden = false;
      activePanel.open(mount, { ...style });
      onOpen?.();
    },

    isOpen() { return activePanel !== null; },

    /** Startup: font scale from the toolkit profile, the other keys from localStorage. */
    loadSavedStyle({ fontScale } = {}) {
      let stored = {};
      try { stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') ?? {}; }
      catch { stored = {}; }
      const { fontScale: _ignored, ...rest } = stored;
      style = normalizeCaptionStyle({ ...rest, fontScale }, DEFAULT_CAPTION_STYLE);
      savedFontScale = style.fontScale;
      render();
    },
  };
}

// The shared instance. A panel may register before the player connects.
let port = null;
let pendingPanel = null;

function connected() {
  if (!port) throw new Error('The CaptionFlow player has not connected the caption settings port yet');
  return port;
}

/** Player-only: create the shared port. Returns it so the player can open the panel. */
export function connectCaptionSettingsPort(deps) {
  port = createCaptionSettingsPort(deps);
  if (pendingPanel) port.registerCaptionSettingsPanel(pendingPanel);
  return port;
}

// The panel calls this once at startup. panel.open(container, currentStyle); panel.close().
export function registerCaptionSettingsPanel(panel) {
  assertPanel(panel);
  pendingPanel = panel;
  port?.registerCaptionSettingsPanel(panel);
}
// The panel calls this on every change. Captions update live; nothing is saved.
export function setCaptionStyle(partialStyle) { connected().setCaptionStyle(partialStyle); }
// "Reset to Default". Live, not saved.
export function resetCaptionStyle() { connected().resetCaptionStyle(); }
// Apply: keep and save. Esc is handled by the player and behaves like cancelAndClose().
export function applyAndClose() { return connected().applyAndClose(); }
// X: revert to the style at open.
export function cancelAndClose() { return connected().cancelAndClose(); }
// Player-only, used by the CC button and by tests.
export function getCaptionStyle() { return port ? port.getCaptionStyle() : { ...DEFAULT_CAPTION_STYLE }; }
export function setCaptionsVisible(visible) { connected().setCaptionsVisible(visible); }
