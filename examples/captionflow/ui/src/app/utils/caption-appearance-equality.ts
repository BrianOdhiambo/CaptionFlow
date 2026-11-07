import { CaptionAppearance, CaptionAppearanceField } from '../models/caption-appearance.model';
import { CaptionAppearancePresetId } from '../models/caption-appearance-preset.model';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import { CAPTION_APPEARANCE_PRESETS } from './caption-appearance-presets';

const APPEARANCE_FIELDS = Object.freeze(
  Object.keys(CAPTION_APPEARANCE_DEFAULTS) as CaptionAppearanceField[],
);

export function isSameAppearance(first: CaptionAppearance, second: CaptionAppearance): boolean {
  return APPEARANCE_FIELDS.every((field) => first[field] === second[field]);
}

export function matchingPresetId(appearance: CaptionAppearance): CaptionAppearancePresetId | null {
  const match = CAPTION_APPEARANCE_PRESETS.find((preset) =>
    isSameAppearance(preset.appearance, appearance),
  );
  return match ? match.id : null;
}
