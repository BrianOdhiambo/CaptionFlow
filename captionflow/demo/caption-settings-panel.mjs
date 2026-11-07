import {
  applyAndClose,
  cancelAndClose,
  getCaptionStyle,
  registerCaptionSettingsPanel,
  resetCaptionStyle,
  setCaptionStyle,
} from '/caption-settings-port.mjs';
import { CONTRAST_CLASSES, DEFAULT_CAPTION_STYLE, captionStyleToCss } from '/player-controls.mjs';
import { CONTRAST_TARGET_RATIO, captionContrast } from '/caption-contrast.mjs';

const FONT_FAMILIES = Object.freeze([
  { value: 'inherit', label: 'App default' },
  { value: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif', label: 'Sans-serif' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { value: 'ui-monospace, Menlo, Consolas, monospace', label: 'Monospace' },
]);

const CONTRAST_MODES = Object.freeze([
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High contrast (white on black)' },
  { value: 'inverted', label: 'Inverted (swap text and box)' },
]);

const PRESETS = Object.freeze([
  { label: 'White on dark', color: '#ffffff', background: '#1a1a1a' },
  { label: 'Yellow on black', color: '#ffff00', background: '#000000' },
  { label: 'Black on white', color: '#000000', background: '#ffffff' },
  { label: 'Cyan on black', color: '#00ffff', background: '#000000' },
]);

const SAMPLE_CAPTION = 'A sample caption, so you can see the colours and size before you apply.';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const percent = value => `${Math.round(value * 100)}%`;
const hexOrDefault = (value, fallback) => (HEX_COLOR.test(value) ? value : fallback);

function selectWith(options) {
  const select = document.createElement('select');
  select.className = 'cs-input';
  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  return select;
}

function rangeInput(min, max, step) {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'cs-range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

function colorInput() {
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'cs-color';
  return input;
}

function fieldWithLabel(id, text, control) {
  const wrap = document.createElement('div');
  wrap.className = 'cs-field';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'cs-label';
  label.textContent = text;
  control.id = id;
  wrap.append(label, control);
  return { wrap, label };
}

function buildPanel() {
  const view = {};
  const form = document.createElement('form');
  form.className = 'caption-settings-panel';
  form.noValidate = true;
  form.setAttribute('aria-labelledby', 'cs-title');

  const title = document.createElement('h2');
  title.id = 'cs-title';
  title.className = 'cs-title';
  title.textContent = 'Caption settings';

  view.preview = document.createElement('div');
  view.preview.className = 'caption-preview';
  view.preview.setAttribute('aria-hidden', 'true');
  const sample = document.createElement('div');
  sample.textContent = SAMPLE_CAPTION;
  view.preview.append(sample);

  view.notice = document.createElement('p');
  view.notice.className = 'cs-notice';
  view.notice.setAttribute('role', 'status');

  const presetGroup = document.createElement('fieldset');
  presetGroup.className = 'cs-presets';
  const presetLegend = document.createElement('legend');
  presetLegend.className = 'cs-label';
  presetLegend.textContent = 'Presets';
  presetGroup.append(presetLegend);
  view.presetButtons = PRESETS.map(preset => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cs-button';
    button.textContent = preset.label;
    button.addEventListener('click', () => {
      setCaptionStyle({ color: preset.color, background: preset.background, backgroundOpacity: 1, contrast: 'normal' });
      refresh();
    });
    presetGroup.append(button);
    return { button, preset };
  });

  view.size = rangeInput(0.8, 2.5, 0.1);
  const size = fieldWithLabel('cs-size', 'Text size', view.size);
  view.sizeLabel = size.label;
  view.size.addEventListener('input', () => { setCaptionStyle({ fontScale: Number(view.size.value) }); refresh(); });

  view.family = selectWith(FONT_FAMILIES);
  view.family.addEventListener('change', () => { setCaptionStyle({ fontFamily: view.family.value }); refresh(); });

  view.color = colorInput();
  view.color.addEventListener('input', () => { setCaptionStyle({ color: view.color.value }); refresh(); });

  view.background = colorInput();
  view.background.addEventListener('input', () => { setCaptionStyle({ background: view.background.value }); refresh(); });

  view.opacity = rangeInput(0.25, 1, 0.05);
  const opacity = fieldWithLabel('cs-opacity', 'Background opacity', view.opacity);
  view.opacityLabel = opacity.label;
  view.opacity.addEventListener('input', () => { setCaptionStyle({ backgroundOpacity: Number(view.opacity.value) }); refresh(); });

  view.contrast = selectWith(CONTRAST_MODES);
  view.contrast.addEventListener('change', () => { setCaptionStyle({ contrast: view.contrast.value }); refresh(); });

  const grid = document.createElement('div');
  grid.className = 'cs-grid';
  grid.append(
    size.wrap,
    fieldWithLabel('cs-font', 'Font', view.family).wrap,
    fieldWithLabel('cs-color-text', 'Text colour', view.color).wrap,
    fieldWithLabel('cs-color-box', 'Background colour', view.background).wrap,
    opacity.wrap,
    fieldWithLabel('cs-contrast', 'Contrast mode', view.contrast).wrap,
  );

  const actions = document.createElement('div');
  actions.className = 'cs-actions';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'cs-button';
  reset.textContent = 'Reset to defaults';
  reset.addEventListener('click', () => { resetCaptionStyle(); refresh(); });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'cs-button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => cancelAndClose());
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'cs-button cs-primary';
  apply.textContent = 'Apply and save';
  actions.append(reset, cancel, apply);
  form.addEventListener('submit', event => { event.preventDefault(); applyAndClose(); });

  form.append(title, view.preview, view.notice, presetGroup, grid, actions);
  return { form, view };
}

let view = null;

function noticeText(style) {
  const result = captionContrast(style);
  if (!result) return 'Use a six-digit colour such as #ffffff to check contrast.';
  const ratio = result.worstCaseRatio.toFixed(2);
  if (!result.meetsTarget) {
    return `Low contrast: ${ratio} to 1, below the ${CONTRAST_TARGET_RATIO} to 1 guideline. Your colours are kept. Choose a stronger pair, or use High contrast.`;
  }
  if (result.translucent) {
    return `Meets ${CONTRAST_TARGET_RATIO} to 1 in the worst case. The box is see-through, so the real contrast depends on the video. This is an estimate, not a guarantee.`;
  }
  return `Meets the ${CONTRAST_TARGET_RATIO} to 1 guideline for captions.`;
}

function refresh() {
  if (!view) return;
  const style = getCaptionStyle();
  view.size.value = String(style.fontScale);
  view.sizeLabel.textContent = `Text size: ${percent(style.fontScale)}`;
  view.family.value = FONT_FAMILIES.some(item => item.value === style.fontFamily) ? style.fontFamily : 'inherit';
  view.color.value = hexOrDefault(style.color, DEFAULT_CAPTION_STYLE.color);
  view.background.value = hexOrDefault(style.background, DEFAULT_CAPTION_STYLE.background);
  view.opacity.value = String(style.backgroundOpacity);
  view.opacityLabel.textContent = `Background opacity: ${percent(style.backgroundOpacity)}`;
  view.contrast.value = style.contrast;

  const { vars, contrastClass } = captionStyleToCss(style);
  for (const [name, value] of Object.entries(vars)) view.preview.style.setProperty(name, value);
  view.preview.classList.remove(...CONTRAST_CLASSES);
  view.preview.classList.add(contrastClass);

  view.notice.textContent = noticeText(style);
  for (const { button, preset } of view.presetButtons) {
    const pressed = style.color === preset.color && style.background === preset.background
      && style.backgroundOpacity === 1 && style.contrast === 'normal';
    button.setAttribute('aria-pressed', String(pressed));
  }
}

registerCaptionSettingsPanel({
  open(container) {
    const built = buildPanel();
    view = built.view;
    container.replaceChildren(built.form);
    refresh();
  },
  close() {
    view = null;
  },
});
