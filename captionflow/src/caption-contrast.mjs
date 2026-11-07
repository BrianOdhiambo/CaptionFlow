/** Contrast for caption text, as the player will draw it. Pure logic, no DOM,
 * so it is tested in Node and served to the browser at /caption-contrast.mjs.
 * A translucent box depends on the video behind it, so its ratio is an estimate:
 * the worst case over a black and a white backdrop. It is never a guarantee.
 */
export const CONTRAST_TARGET_RATIO = 4.5;

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function parseHexColor(value) {
  const match = HEX.exec(typeof value === 'string' ? value.trim() : '');
  if (!match) return null;
  return match.slice(1).map(part => Number.parseInt(part, 16));
}

function linear(channel) {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([red, green, blue]) {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function compositeOver(foreground, opacity, backdrop) {
  return foreground.map((channel, index) => opacity * channel + (1 - opacity) * backdrop[index]);
}

/** The text and box colours the player draws for a style, matching the CSS in style.css. */
export function captionBoxAndText({ color, background, backgroundOpacity, contrast }) {
  if (contrast === 'high') return { text: '#ffffff', box: '#000000', opacity: 1 };
  if (contrast === 'inverted') return { text: background, box: color, opacity: 1 };
  return { text: color, box: background, opacity: backgroundOpacity };
}

/** Returns null when a colour is not a six-digit hex value. */
export function captionContrast(style) {
  const parts = captionBoxAndText(style);
  const text = parseHexColor(parts.text);
  const box = parseHexColor(parts.box);
  if (!text || !box) return null;
  const boxContrastRatio = contrastRatio(text, box);
  const translucent = parts.opacity < 1;
  const worstCaseRatio = translucent
    ? Math.min(
        contrastRatio(text, compositeOver(box, parts.opacity, [0, 0, 0])),
        contrastRatio(text, compositeOver(box, parts.opacity, [255, 255, 255])),
      )
    : boxContrastRatio;
  return {
    boxContrastRatio,
    worstCaseRatio,
    translucent,
    meetsTarget: worstCaseRatio >= CONTRAST_TARGET_RATIO,
  };
}
