import { describe, expect, it } from 'vitest';
import {
  CAPTION_APPEARANCE_DEFAULTS,
  CAPTION_APPEARANCE_LIMITS,
} from './caption-appearance-defaults';
import {
  applyCaptionAppearancePatch,
  validateCaptionAppearance,
} from './caption-appearance-validation';
import { CaptionAppearance } from '../models/caption-appearance.model';

const FIELD_COUNT = Object.keys(CAPTION_APPEARANCE_DEFAULTS).length;

describe('caption appearance validation', () => {
  it('reports a missing value and replaces it with its default', () => {
    const result = validateCaptionAppearance({});
    expect(result.issues.filter((i) => i.reason === 'missing').length).toBe(FIELD_COUNT);
    expect(result.appearance).toEqual(CAPTION_APPEARANCE_DEFAULTS);
  });

  it('treats a non-object input as malformed and falls back to defaults', () => {
    for (const input of [undefined, null, 'x', 42, [1, 2]]) {
      const result = validateCaptionAppearance(input);
      expect(result.issues).toEqual([{ field: 'appearance', reason: 'malformed' }]);
      expect(result.appearance).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    }
  });

  it('accepts valid custom values and normalises colours to lowercase', () => {
    const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
      fontFamily: 'monospace',
      fontSize: 2,
      fontWeight: 700,
      fontColor: '#FFFF00',
      backgroundColor: '#112233',
      backgroundOpacity: 0.5,
      contrastMode: 'inverted',
      textOutline: 'shadow',
      captionPosition: 'top',
      lineHeight: 1.5,
      letterSpacing: 0.1,
      backgroundPaddingHorizontal: 1.5,
      backgroundPaddingVertical: 0.25,
      backgroundRadius: 1.5,
    });
    expect(result.issues).toEqual([]);
    expect(result.appearance.fontColor).toBe('#ffff00');
    expect(result.appearance.captionPosition).toBe('top');
  });

  it('rejects invalid colours', () => {
    for (const bad of ['red', '#fff', '#ggg888', 'rgb(0,0,0)', 'url(x)', '#ffffff;', 12, null]) {
      const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { fontColor: bad });
      expect(result.issues, String(bad)).toEqual([{ field: 'fontColor', reason: 'invalid' }]);
      expect(result.appearance.fontColor).toBe('#ffffff');
    }
  });

  it('rejects font families outside the allowlist, including CSS injection', () => {
    for (const bad of ['Comic Sans', 'serif; background: url(x)', 'Arial', '', 'inherit']) {
      const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
        fontFamily: bad as CaptionAppearance['fontFamily'],
      });
      expect(result.issues, bad).toEqual([{ field: 'fontFamily', reason: 'invalid' }]);
      expect(result.appearance.fontFamily).toBe('app-default');
    }
  });

  it('rejects out-of-range and non-numeric numbers', () => {
    const cases: Array<[keyof CaptionAppearance, unknown]> = [
      ['fontSize', 3],
      ['fontSize', 0.5],
      ['fontSize', NaN],
      ['fontSize', Infinity],
      ['fontSize', '1.5'],
      ['backgroundOpacity', 0],
      ['backgroundOpacity', 1.01],
      ['lineHeight', 2.5],
      ['letterSpacing', 1],
      ['backgroundPaddingHorizontal', -1],
      ['backgroundPaddingVertical', 2.5],
      ['backgroundRadius', 5],
    ];
    for (const [field, value] of cases) {
      const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { [field]: value });
      expect(result.issues, `${field}=${String(value)}`).toEqual([{ field, reason: 'invalid' }]);
      expect(result.appearance[field], field).toBe(CAPTION_APPEARANCE_DEFAULTS[field]);
    }
  });

  it('accepts the bounds themselves', () => {
    const fields = [
      'fontSize',
      'backgroundOpacity',
      'lineHeight',
      'letterSpacing',
      'backgroundPaddingHorizontal',
      'backgroundPaddingVertical',
      'backgroundRadius',
    ] as const;
    for (const field of fields) {
      const range = CAPTION_APPEARANCE_LIMITS[field];
      expect(
        applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { [field]: range.min }).issues,
        `${field} min`,
      ).toEqual([]);
      expect(
        applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { [field]: range.max }).issues,
        `${field} max`,
      ).toEqual([]);
    }
  });

  it('requires font weight to be one of the allowed steps', () => {
    expect(
      applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { fontWeight: 600 }).issues,
    ).toEqual([]);
    expect(
      applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { fontWeight: 450 }).issues,
    ).toEqual([{ field: 'fontWeight', reason: 'invalid' }]);
  });

  it('rejects an invalid position, contrast mode and outline', () => {
    const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
      captionPosition: 'left' as CaptionAppearance['captionPosition'],
      contrastMode: 'rainbow' as CaptionAppearance['contrastMode'],
      textOutline: 'glow' as CaptionAppearance['textOutline'],
    });
    expect(result.issues.map((i) => i.field).sort()).toEqual([
      'captionPosition',
      'contrastMode',
      'textOutline',
    ]);
    expect(result.appearance.captionPosition).toBe('bottom');
  });

  it('reports unknown fields and never copies them into the result', () => {
    const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
      style: 'color:red',
      __proto__x: 1,
      fontSize: 1.5,
    });
    expect(result.issues.map((i) => i.reason)).toEqual(['unknown', 'unknown']);
    expect('style' in result.appearance).toBe(false);
    expect(result.appearance.fontSize).toBe(1.5);
  });

  it('switches to custom when a colour changes without a contrast mode', () => {
    const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
      backgroundColor: '#123456',
    });
    expect(result.appearance.contrastMode).toBe('custom');
  });

  it('keeps an explicit contrast mode when colours change', () => {
    const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
      backgroundColor: '#123456',
      contrastMode: 'normal',
    });
    expect(result.appearance.contrastMode).toBe('normal');
  });

  it('returns frozen results and never mutates the input', () => {
    const input = { fontSize: 2 };
    const result = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, input);
    expect(Object.isFrozen(result.appearance)).toBe(true);
    expect(input).toEqual({ fontSize: 2 });
  });

  it('validates horizontal and vertical padding independently', () => {
    expect(FIELD_COUNT).toBe(14);
    expect(
      applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, { backgroundPaddingHorizontal: 2.5 })
        .issues[0]?.reason,
    ).toBe('invalid');
    const vertical = applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, {
      backgroundPaddingVertical: 0,
    });
    expect(vertical.issues).toEqual([]);
    expect(vertical.appearance.backgroundPaddingHorizontal).toBe(1);
    expect(vertical.appearance.backgroundPaddingVertical).toBe(0);
  });
});
