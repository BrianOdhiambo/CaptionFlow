import { CaptionAppearance } from '../models/caption-appearance.model';
import {
  CaptionAppearancePreset,
  CaptionAppearancePresetId,
} from '../models/caption-appearance-preset.model';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';

function buildPresetAppearance(fontColor: string, backgroundColor: string): CaptionAppearance {
  return Object.freeze({
    ...CAPTION_APPEARANCE_DEFAULTS,
    fontColor,
    backgroundColor,
    backgroundOpacity: 1,
    contrastMode: 'custom',
  });
}

export const CAPTION_APPEARANCE_PRESETS: readonly CaptionAppearancePreset[] = Object.freeze([
  Object.freeze({
    id: 'white-on-dark',
    label: 'White on dark',
    appearance: buildPresetAppearance('#ffffff', '#1a1a1a'),
  }),
  Object.freeze({
    id: 'yellow-on-black',
    label: 'Yellow on black',
    appearance: buildPresetAppearance('#ffff00', '#000000'),
  }),
  Object.freeze({
    id: 'black-on-white',
    label: 'Black on white',
    appearance: buildPresetAppearance('#000000', '#ffffff'),
  }),
  Object.freeze({
    id: 'cyan-on-black',
    label: 'Cyan on black',
    appearance: buildPresetAppearance('#00ffff', '#000000'),
  }),
]);

export function findCaptionAppearancePreset(
  id: CaptionAppearancePresetId,
): CaptionAppearancePreset | undefined {
  return CAPTION_APPEARANCE_PRESETS.find((preset) => preset.id === id);
}
