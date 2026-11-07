/** Minimal, keyboard-accessible style panel for the team's existing caption settings port.
 * Registered through the public port contract: this does not replace the player.
 */
import { registerCaptionSettingsPanel, setCaptionStyle, resetCaptionStyle,
  applyAndClose, cancelAndClose, getCaptionStyle } from '/caption-settings-port.mjs';

function control(labelText, type, value, onChange, attrs = {}) {
  const label = document.createElement('label');
  label.className = 'style-field';
  const title = document.createElement('span');
  title.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = String(value);
  Object.entries(attrs).forEach(([name, val]) => input.setAttribute(name, String(val)));
  input.addEventListener('input', () => onChange(input.value));
  label.append(title, input);
  return { label, input };
}

registerCaptionSettingsPanel({
  open(container, currentStyle) {
    const dialog = document.createElement('section');
    dialog.className = 'caption-style-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'false');
    dialog.setAttribute('aria-label', 'Caption appearance settings');
    const heading = document.createElement('h3');
    heading.textContent = 'Caption appearance';
    const hint = document.createElement('p');
    hint.textContent = 'Changes preview immediately. Apply to save or Cancel to restore.';
    const scale = control('Text size', 'range', currentStyle.fontScale, v => setCaptionStyle({ fontScale: Number(v) }), { min: .8, max: 2.5, step: .1 });
    const foreground = control('Text color', 'color', currentStyle.color, color => setCaptionStyle({ color }));
    const background = control('Background color', 'color', currentStyle.background, color => setCaptionStyle({ background: color }));
    const opacity = control('Background opacity', 'range', currentStyle.backgroundOpacity, v => setCaptionStyle({ backgroundOpacity: Number(v) }), { min: 0, max: 1, step: .05 });
    const contrastLabel = document.createElement('label');
    contrastLabel.className = 'style-field';
    contrastLabel.textContent = 'Contrast';
    const contrast = document.createElement('select');
    for (const [value, text] of [['normal','Normal'],['high','High'],['inverted','Inverted']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = text;
      contrast.append(option);
    }
    contrast.value = currentStyle.contrast;
    contrast.addEventListener('change', () => setCaptionStyle({ contrast: contrast.value }));
    contrastLabel.append(contrast);
    const actions = document.createElement('div');
    actions.className = 'style-actions';
    const makeButton = (name, action) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = name;
      button.addEventListener('click', action);
      return button;
    };
    const reset = makeButton('Reset preview', () => {
      resetCaptionStyle();
      const style = getCaptionStyle();
      scale.input.value = String(style.fontScale);
      foreground.input.value = style.color;
      background.input.value = style.background;
      opacity.input.value = String(style.backgroundOpacity);
      contrast.value = style.contrast;
    });
    const cancel = makeButton('Cancel', () => cancelAndClose());
    const apply = makeButton('Apply', () => applyAndClose());
    actions.append(reset, cancel, apply);
    dialog.append(heading, hint, scale.label, foreground.label, background.label,
      opacity.label, contrastLabel, actions);
    container.append(dialog);
  },
  close() {},
});