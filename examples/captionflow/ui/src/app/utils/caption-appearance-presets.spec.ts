import { describe, expect, it } from 'vitest';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import {
  CAPTION_APPEARANCE_PRESETS,
  findCaptionAppearancePreset,
} from './caption-appearance-presets';
import { validateCaptionAppearance } from './caption-appearance-validation';
import { resolveCaptionColors } from './caption-appearance-colors';
import { estimateCaptionContrast } from './contrast-ratio';

const FIELD_COUNT = Object.keys(CAPTION_APPEARANCE_DEFAULTS).length;

describe('caption appearance presets', () => {
  it('are exactly four, each complete, frozen and valid', () => {
    expect(CAPTION_APPEARANCE_PRESETS.length).toBe(4);
    expect(Object.isFrozen(CAPTION_APPEARANCE_PRESETS)).toBe(true);
    for (const preset of CAPTION_APPEARANCE_PRESETS) {
      expect(Object.isFrozen(preset.appearance), preset.id).toBe(true);
      expect(Object.keys(preset.appearance).length, preset.id).toBe(FIELD_COUNT);
      expect(validateCaptionAppearance(preset.appearance).issues, preset.id).toEqual([]);
    }
  });

  it('match the requested colour pairs', () => {
    const pairs = CAPTION_APPEARANCE_PRESETS.map((p) => [
      p.id,
      p.appearance.fontColor,
      p.appearance.backgroundColor,
    ]);
    expect(pairs.find((p) => p[0] === 'yellow-on-black')).toEqual([
      'yellow-on-black',
      '#ffff00',
      '#000000',
    ]);
    expect(pairs.find((p) => p[0] === 'black-on-white')).toEqual([
      'black-on-white',
      '#000000',
      '#ffffff',
    ]);
    expect(pairs.find((p) => p[0] === 'cyan-on-black')).toEqual([
      'cyan-on-black',
      '#00ffff',
      '#000000',
    ]);
    expect(pairs.find((p) => p[0] === 'white-on-dark')?.[1]).toBe('#ffffff');
  });

  it('meet the 4.5:1 target when their box is opaque', () => {
    for (const preset of CAPTION_APPEARANCE_PRESETS) {
      const estimate = estimateCaptionContrast(resolveCaptionColors(preset.appearance));
      expect(estimate.backdropDependent, preset.id).toBe(false);
      expect(estimate.meetsTarget, `${preset.id} ratio ${estimate.worstCaseContrastRatio}`).toBe(
        true,
      );
    }
  });

  it('keep the split padding defaults', () => {
    for (const preset of CAPTION_APPEARANCE_PRESETS) {
      expect(preset.appearance.backgroundPaddingHorizontal, preset.id).toBe(1);
      expect(preset.appearance.backgroundPaddingVertical, preset.id).toBe(0.5);
    }
  });

  it('findCaptionAppearancePreset returns the matching preset', () => {
    expect(findCaptionAppearancePreset('cyan-on-black')?.appearance.fontColor).toBe('#00ffff');
  });
});
