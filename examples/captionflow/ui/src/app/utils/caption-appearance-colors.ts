import { CaptionAppearance } from '../models/caption-appearance.model';
import { ResolvedCaptionColors } from '../models/resolved-caption-colors.model';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';

const HIGH_CONTRAST_TEXT = '#ffffff';
const HIGH_CONTRAST_BOX = '#000000';

export function resolveCaptionColors(appearance: CaptionAppearance): ResolvedCaptionColors {
  switch (appearance.contrastMode) {
    case 'normal':
      return {
        textColor: CAPTION_APPEARANCE_DEFAULTS.fontColor,
        boxColor: CAPTION_APPEARANCE_DEFAULTS.backgroundColor,
        boxOpacity: appearance.backgroundOpacity,
      };
    case 'high':
      return { textColor: HIGH_CONTRAST_TEXT, boxColor: HIGH_CONTRAST_BOX, boxOpacity: 1 };
    case 'inverted':
      return {
        textColor: appearance.backgroundColor,
        boxColor: appearance.fontColor,
        boxOpacity: appearance.backgroundOpacity,
      };
    case 'custom':
      return {
        textColor: appearance.fontColor,
        boxColor: appearance.backgroundColor,
        boxOpacity: appearance.backgroundOpacity,
      };
  }
}
