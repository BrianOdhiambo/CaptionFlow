import { CaptionAppearance } from '../models/caption-appearance.model';

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export const CAPTION_APPEARANCE_LIMITS = Object.freeze({
  fontSize: Object.freeze({ min: 1, max: 2.5 }) satisfies NumericRange,
  backgroundOpacity: Object.freeze({ min: 0.25, max: 1 }) satisfies NumericRange,
  lineHeight: Object.freeze({ min: 1, max: 2 }) satisfies NumericRange,
  letterSpacing: Object.freeze({ min: -0.05, max: 0.2 }) satisfies NumericRange,
  backgroundPaddingHorizontal: Object.freeze({ min: 0, max: 2 }) satisfies NumericRange,
  backgroundPaddingVertical: Object.freeze({ min: 0, max: 2 }) satisfies NumericRange,
  backgroundRadius: Object.freeze({ min: 0, max: 2 }) satisfies NumericRange,
});

export const CAPTION_APPEARANCE_DEFAULTS: CaptionAppearance = Object.freeze({
  fontFamily: 'app-default',
  fontSize: 1.25,
  fontWeight: 500,
  fontColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.75,
  contrastMode: 'normal',
  textOutline: 'none',
  captionPosition: 'bottom',
  lineHeight: 1.25,
  letterSpacing: 0,
  backgroundPaddingHorizontal: 1,
  backgroundPaddingVertical: 0.5,
  backgroundRadius: 0.375,
});

export const CAPTION_CONTRAST_TARGET_RATIO = 4.5;
