import { describe, expect, it } from 'vitest';
import * as defaultsModule from './caption-appearance-defaults';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import { validateCaptionAppearance } from './caption-appearance-validation';
import { CAPTION_FONT_FAMILIES } from '../models/caption-appearance.model';

describe('caption appearance defaults', () => {
  it('are frozen and pass validation with no issues', () => {
    expect(Object.isFrozen(CAPTION_APPEARANCE_DEFAULTS)).toBe(true);
    const result = validateCaptionAppearance(CAPTION_APPEARANCE_DEFAULTS);
    expect(result.issues).toEqual([]);
    expect(result.appearance).toEqual(CAPTION_APPEARANCE_DEFAULTS);
  });

  it('reproduce the current overlay look', () => {
    expect(CAPTION_APPEARANCE_DEFAULTS.fontColor).toBe('#ffffff');
    expect(CAPTION_APPEARANCE_DEFAULTS.backgroundColor).toBe('#000000');
    expect(CAPTION_APPEARANCE_DEFAULTS.backgroundOpacity).toBe(0.75);
    expect(CAPTION_APPEARANCE_DEFAULTS.fontSize).toBe(1.25);
    expect(CAPTION_APPEARANCE_DEFAULTS.fontWeight).toBe(500);
    expect(CAPTION_APPEARANCE_DEFAULTS.lineHeight).toBe(1.25);
    expect(CAPTION_APPEARANCE_DEFAULTS.captionPosition).toBe('bottom');
    expect(CAPTION_APPEARANCE_DEFAULTS.backgroundRadius).toBe(0.375);
    expect(CAPTION_APPEARANCE_DEFAULTS.backgroundPaddingHorizontal).toBe(1);
    expect(CAPTION_APPEARANCE_DEFAULTS.backgroundPaddingVertical).toBe(0.5);
  });

  it('use semantic font-family identifiers only, never CSS strings', () => {
    for (const family of CAPTION_FONT_FAMILIES) {
      expect(family).toMatch(/^[a-z][a-z-]*$/);
    }
    expect('CAPTION_FONT_FAMILY_STACKS' in defaultsModule).toBe(false);
    expect(JSON.stringify(CAPTION_APPEARANCE_DEFAULTS)).not.toMatch(
      /Georgia|Figtree|Menlo|sans-serif/,
    );
  });
});
