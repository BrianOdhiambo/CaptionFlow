import { describe, expect, it } from 'vitest';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import { CAPTION_APPEARANCE_PRESETS } from './caption-appearance-presets';
import { isSameAppearance, matchingPresetId } from './caption-appearance-equality';

describe('caption appearance equality', () => {
  it('finds the preset whose complete configuration matches', () => {
    for (const preset of CAPTION_APPEARANCE_PRESETS) {
      expect(matchingPresetId(preset.appearance)).toBe(preset.id);
    }
  });

  it('reports no preset for the defaults or after one field changes', () => {
    expect(matchingPresetId(CAPTION_APPEARANCE_DEFAULTS)).toBeNull();
    const yellow = CAPTION_APPEARANCE_PRESETS.find((preset) => preset.id === 'yellow-on-black');
    expect(matchingPresetId({ ...yellow!.appearance, fontSize: 2 })).toBeNull();
  });

  it('compares every field', () => {
    expect(isSameAppearance(CAPTION_APPEARANCE_DEFAULTS, { ...CAPTION_APPEARANCE_DEFAULTS })).toBe(
      true,
    );
    expect(
      isSameAppearance(CAPTION_APPEARANCE_DEFAULTS, {
        ...CAPTION_APPEARANCE_DEFAULTS,
        letterSpacing: 0.1,
      }),
    ).toBe(false);
  });
});
