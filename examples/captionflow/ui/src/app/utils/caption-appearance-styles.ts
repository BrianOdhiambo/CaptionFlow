import { CaptionAppearance } from '../models/caption-appearance.model';
import { CaptionStyleVariables } from '../models/caption-style-variables.model';
import { resolveCaptionColors } from './caption-appearance-colors';

export function captionStyleVariables(appearance: CaptionAppearance): CaptionStyleVariables {
  const colors = resolveCaptionColors(appearance);
  return {
    fontSize: `${appearance.fontSize}rem`,
    fontWeight: String(appearance.fontWeight),
    lineHeight: String(appearance.lineHeight),
    letterSpacing: `${appearance.letterSpacing}em`,
    paddingHorizontal: `${appearance.backgroundPaddingHorizontal}rem`,
    paddingVertical: `${appearance.backgroundPaddingVertical}rem`,
    radius: `${appearance.backgroundRadius}rem`,
    textColor: colors.textColor,
    boxColor: colors.boxColor,
    boxOpacity: String(colors.boxOpacity),
  };
}

export function captionBandClasses(appearance: CaptionAppearance): string {
  return [
    'caption-band',
    `caption-font-${appearance.fontFamily}`,
    `caption-outline-${appearance.textOutline}`,
  ].join(' ');
}

export function captionLayerClasses(appearance: CaptionAppearance): string {
  return `caption-layer caption-position-${appearance.captionPosition}`;
}
