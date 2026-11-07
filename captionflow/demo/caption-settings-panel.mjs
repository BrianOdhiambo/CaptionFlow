import {
  applyAndClose,
  dismissAndClose,
  getCaptionStyle,
  registerCaptionSettingsPanel,
  resetCaptionStyle,
  setCaptionStyle,
} from '/caption-settings-port.mjs';
import { CONTRAST_CLASSES, DEFAULT_CAPTION_STYLE, captionStyleToCss } from '/player-controls.mjs';
import { CONTRAST_TARGET_RATIO, captionContrast } from '/caption-contrast.mjs';

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const FONT_FAMILIES = Object.freeze([
  { value: 'inherit', label: 'App default' },
  { value: SANS, label: 'Sans-serif' },
  { value: SERIF, label: 'Serif' },
  { value: MONO, label: 'Monospace' },
]);

const FONT_SAMPLES = Object.freeze([
  { value: SANS, label: 'Sans-serif sample' },
  { value: SERIF, label: 'Serif sample' },
  { value: MONO, label: 'Monospace sample' },
]);

const TEXT_COLORS = Object.freeze([
  { value: '#ffffff', label: 'White' },
  { value: '#facc15', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#22d3ee', label: 'Cyan' },
  { value: '#d946ef', label: 'Purple' },
]);

const BOX_COLORS = Object.freeze([
  { value: '#000000', label: 'Black' },
  { value: '#0f172a', label: 'Dark navy' },
  { value: '#0057ff', label: 'Blue' },
  { value: 'transparent', label: 'Transparent' },
]);

const CONTRAST_MODES = Object.freeze([
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'inverted', label: 'Inverted' },
]);

const SAMPLE_CAPTION = 'Sample caption text';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const percent = value => `${Math.round(value * 100)}%`;
const hexOrDefault = (value, fallback) => (HEX_COLOR.test(value) ? value.toLowerCase() : fallback);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pressableButton(className, label) {
  const button = element('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function fieldLabel(id, text) {
  const label = element('label', 'cs-label', text);
  label.htmlFor = id;
  return label;
}

function swatchRow(items, onPick, customLabel) {
  const row = element('div', 'cs-swatches');
  const buttons = items.map(item => {
    const button = pressableButton('cs-swatch', item.label);
    button.style.setProperty('--swatch', item.value);
    if (item.value === 'transparent') button.classList.add('cs-swatch-transparent');
    button.addEventListener('click', () => onPick(item.value));
    row.append(button);
    return { button, value: item.value };
  });
  const custom = element('label', 'cs-swatch cs-swatch-custom');
  custom.title = customLabel;
  const picker = element('input');
  picker.type = 'color';
  picker.setAttribute('aria-label', customLabel);
  picker.addEventListener('input', () => onPick(picker.value));
  custom.append(picker);
  row.append(custom);
  return { row, buttons, picker };
}

function buildPanel() {
  const view = {};
  const form = element('form', 'caption-settings-panel');
  form.noValidate = true;
  form.setAttribute('aria-labelledby', 'cs-title');

  const header = element('div', 'cs-header');
  header.append(element('span', 'cs-logo', 'Aa'));
  const title = element('h2', 'cs-title', 'Caption Settings');
  title.id = 'cs-title';
  const close = pressableButton('cs-icon', 'Close caption settings');
  close.removeAttribute('aria-pressed');
  close.textContent = '✕';
  close.addEventListener('click', () => dismissAndClose());
  header.append(title, close);

  const fontSection = element('div', 'cs-section');
  fontSection.append(fieldLabel('cs-font', 'Font family'));
  const fontRow = element('div', 'cs-row');
  view.family = element('select', 'cs-select');
  view.family.id = 'cs-font';
  for (const item of FONT_FAMILIES) {
    const option = element('option', null, item.label);
    option.value = item.value;
    view.family.append(option);
  }
  view.family.addEventListener('change', () => { setCaptionStyle({ fontFamily: view.family.value }); refresh(); });
  fontRow.append(view.family);
  view.fontSamples = FONT_SAMPLES.map(item => {
    const button = pressableButton('cs-font-sample', item.label);
    button.textContent = 'Aa';
    button.style.fontFamily = item.value;
    button.addEventListener('click', () => { setCaptionStyle({ fontFamily: item.value }); refresh(); });
    fontRow.append(button);
    return { button, value: item.value };
  });
  fontSection.append(fontRow);

  const sizeSection = element('div', 'cs-section');
  sizeSection.append(fieldLabel('cs-size', 'Font size'));
  const sizeRow = element('div', 'cs-slider-row');
  view.size = element('input', 'cs-range');
  view.size.type = 'range';
  view.size.id = 'cs-size';
  view.size.min = '0.8';
  view.size.max = '2.5';
  view.size.step = '0.05';
  view.size.addEventListener('input', () => { setCaptionStyle({ fontScale: Number(view.size.value) }); refresh(); });
  view.sizeOutput = element('output', 'cs-output');
  view.sizeOutput.htmlFor = 'cs-size';
  sizeRow.append(view.size, view.sizeOutput);
  sizeSection.append(sizeRow);

  const textSection = element('div', 'cs-section');
  textSection.append(element('span', 'cs-label', 'Text color'));
  const text = swatchRow(TEXT_COLORS, value => { setCaptionStyle({ color: value }); refresh(); }, 'Custom text colour');
  view.textButtons = text.buttons;
  view.textPicker = text.picker;
  textSection.append(text.row);
  const highlightLabel = element('label', 'cs-check');
  view.highlight = element('input');
  view.highlight.type = 'checkbox';
  view.highlight.addEventListener('change', () => { setCaptionStyle({ highlightWords: view.highlight.checked }); refresh(); });
  highlightLabel.append(view.highlight, ' Highlight spoken words in the text color');
  textSection.append(highlightLabel);

  const boxSection = element('div', 'cs-section');
  boxSection.append(element('span', 'cs-label', 'Background color'));
  const box = swatchRow(BOX_COLORS, value => { setCaptionStyle({ background: value }); refresh(); }, 'Custom background colour');
  view.boxButtons = box.buttons;
  view.boxPicker = box.picker;
  boxSection.append(box.row);

  const opacitySection = element('div', 'cs-section');
  opacitySection.append(fieldLabel('cs-opacity', 'Background opacity'));
  const opacityRow = element('div', 'cs-slider-row');
  view.opacity = element('input', 'cs-range');
  view.opacity.type = 'range';
  view.opacity.id = 'cs-opacity';
  view.opacity.min = '0.25';
  view.opacity.max = '1';
  view.opacity.step = '0.05';
  view.opacity.addEventListener('input', () => { setCaptionStyle({ backgroundOpacity: Number(view.opacity.value) }); refresh(); });
  view.opacityOutput = element('output', 'cs-output');
  view.opacityOutput.htmlFor = 'cs-opacity';
  opacityRow.append(view.opacity, view.opacityOutput);
  opacitySection.append(opacityRow);

  const contrastSection = element('div', 'cs-section');
  contrastSection.append(element('span', 'cs-label', 'Contrast mode'));
  const contrastRow = element('div', 'cs-segmented');
  view.contrastButtons = CONTRAST_MODES.map(item => {
    const button = pressableButton('cs-segment', `${item.label} contrast`);
    button.textContent = item.label;
    button.addEventListener('click', () => { setCaptionStyle({ contrast: item.value }); refresh(); });
    contrastRow.append(button);
    return { button, value: item.value };
  });
  contrastSection.append(contrastRow);

  const preview = element('div', 'caption-preview');
  preview.setAttribute('aria-hidden', 'true');
  view.preview = preview;
  const sampleLine = element('div');
  SAMPLE_CAPTION.split(' ').forEach((word, index) => {
    if (index > 0) sampleLine.append(' ');
    const span = element('span', index === 0 ? 'caption-word word-active' : 'caption-word', word);
    sampleLine.append(span);
  });
  preview.append(sampleLine);
  view.notice = element('p', 'cs-notice');
  view.notice.setAttribute('role', 'status');

  const footer = element('div', 'cs-footer');
  const reset = element('button', 'cs-reset', '↻ Reset to Default');
  reset.type = 'button';
  reset.addEventListener('click', () => { resetCaptionStyle(); refresh(); });
  const apply = element('button', 'cs-primary', 'Apply');
  apply.type = 'submit';
  footer.append(reset, apply);
  form.addEventListener('submit', event => { event.preventDefault(); applyAndClose(); });

  form.append(header, fontSection, sizeSection, textSection, boxSection, opacitySection, contrastSection, preview, view.notice, footer);
  return { form, view };
}

let view = null;

function noticeText(style) {
  if (style.background === 'transparent') {
    return 'No box behind the text, so readability depends entirely on the video. Consider a background colour or more opacity.';
  }
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

function setPressed(buttons, value) {
  for (const { button, value: itemValue } of buttons) {
    button.setAttribute('aria-pressed', String(itemValue === value));
  }
}

function refresh() {
  if (!view) return;
  const style = getCaptionStyle();
  view.size.value = String(style.fontScale);
  view.sizeOutput.textContent = percent(style.fontScale);
  view.family.value = FONT_FAMILIES.some(item => item.value === style.fontFamily) ? style.fontFamily : 'inherit';
  setPressed(view.fontSamples, style.fontFamily);
  const textColor = hexOrDefault(style.color, DEFAULT_CAPTION_STYLE.color);
  const boxColor = style.background === 'transparent' ? 'transparent' : hexOrDefault(style.background, DEFAULT_CAPTION_STYLE.background);
  setPressed(view.textButtons, textColor);
  setPressed(view.boxButtons, boxColor);
  view.textPicker.value = textColor;
  view.highlight.checked = style.highlightWords !== false;
  view.boxPicker.value = boxColor === 'transparent' ? DEFAULT_CAPTION_STYLE.background : boxColor;
  view.opacity.value = String(style.backgroundOpacity);
  view.opacityOutput.textContent = percent(style.backgroundOpacity);
  setPressed(view.contrastButtons, style.contrast);

  const { vars, contrastClass } = captionStyleToCss(style);
  for (const [name, value] of Object.entries(vars)) view.preview.style.setProperty(name, value);
  view.preview.classList.remove(...CONTRAST_CLASSES);
  view.preview.classList.add(contrastClass);
  view.preview.classList.toggle('highlight-words', style.highlightWords !== false);

  view.notice.textContent = noticeText(style);
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
