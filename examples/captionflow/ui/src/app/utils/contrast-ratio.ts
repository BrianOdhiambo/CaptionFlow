import { CaptionContrastEstimate } from '../models/caption-contrast-estimate.model';
import { ResolvedCaptionColors } from '../models/resolved-caption-colors.model';
import { RgbColor } from '../models/rgb-color.model';
import { CAPTION_CONTRAST_TARGET_RATIO } from './caption-appearance-defaults';

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const WHITE: RgbColor = { red: 255, green: 255, blue: 255 };
const BLACK: RgbColor = { red: 0, green: 0, blue: 0 };

export function parseHexColor(value: string): RgbColor | null {
  const match = HEX_COLOR.exec(value);
  if (!match) {
    return null;
  }
  return {
    red: Number.parseInt(match[1], 16),
    green: Number.parseInt(match[2], 16),
    blue: Number.parseInt(match[3], 16),
  };
}

function linearChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

export function contrastRatio(first: RgbColor, second: RgbColor): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function compositeOver(foreground: RgbColor, opacity: number, backdrop: RgbColor): RgbColor {
  const blend = (top: number, bottom: number): number => opacity * top + (1 - opacity) * bottom;
  return {
    red: blend(foreground.red, backdrop.red),
    green: blend(foreground.green, backdrop.green),
    blue: blend(foreground.blue, backdrop.blue),
  };
}

function requireHexColor(value: string): RgbColor {
  const color = parseHexColor(value);
  if (!color) {
    throw new Error(`Caption colour is not a 6-digit hex value: ${value}`);
  }
  return color;
}

export function estimateCaptionContrast(colors: ResolvedCaptionColors): CaptionContrastEstimate {
  const text = requireHexColor(colors.textColor);
  const box = requireHexColor(colors.boxColor);
  const boxContrastRatio = contrastRatio(text, box);

  const backdropDependent = colors.boxOpacity < 1;
  const worstCaseContrastRatio = backdropDependent
    ? Math.min(
        contrastRatio(text, compositeOver(box, colors.boxOpacity, BLACK)),
        contrastRatio(text, compositeOver(box, colors.boxOpacity, WHITE)),
      )
    : boxContrastRatio;

  return {
    boxContrastRatio,
    worstCaseContrastRatio,
    backdropDependent,
    meetsTarget: worstCaseContrastRatio >= CAPTION_CONTRAST_TARGET_RATIO,
    targetRatio: CAPTION_CONTRAST_TARGET_RATIO,
  };
}
