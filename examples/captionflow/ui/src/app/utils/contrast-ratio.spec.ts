import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  estimateCaptionContrast,
  parseHexColor,
  relativeLuminance,
} from './contrast-ratio';

describe('contrast ratio', () => {
  it('accepts only six-digit hex colours', () => {
    expect(parseHexColor('#ffffff')).toEqual({ red: 255, green: 255, blue: 255 });
    expect(parseHexColor('#0a0B0c')).toEqual({ red: 10, green: 11, blue: 12 });
    expect(parseHexColor('#fff')).toBeNull();
    expect(parseHexColor('ffffff')).toBeNull();
    expect(parseHexColor('#ffffff00')).toBeNull();
  });

  it('gives luminance 0 for black and 1 for white', () => {
    expect(relativeLuminance({ red: 0, green: 0, blue: 0 })).toBe(0);
    expect(relativeLuminance({ red: 255, green: 255, blue: 255 })).toBeCloseTo(1, 9);
  });

  it('gives white on black 21:1', () => {
    const ratio = contrastRatio({ red: 255, green: 255, blue: 255 }, { red: 0, green: 0, blue: 0 });
    expect(ratio).toBeCloseTo(21, 9);
  });

  it('places #767676 on white just above 4.5:1 (known WCAG boundary)', () => {
    const ratio = contrastRatio(
      { red: 118, green: 118, blue: 118 },
      { red: 255, green: 255, blue: 255 },
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.6);
  });

  it('is symmetric', () => {
    const a = { red: 10, green: 200, blue: 30 };
    const b = { red: 240, green: 5, blue: 99 };
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it('gives an opaque box a guaranteed, backdrop-independent estimate', () => {
    const estimate = estimateCaptionContrast({
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: 1,
    });
    expect(estimate.backdropDependent).toBe(false);
    expect(estimate.worstCaseContrastRatio).toBeCloseTo(21, 9);
    expect(estimate.meetsTarget).toBe(true);
    expect(estimate.targetRatio).toBe(4.5);
  });

  it('flags a translucent box as backdrop-dependent and uses the worst case', () => {
    const estimate = estimateCaptionContrast({
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: 0.75,
    });
    expect(estimate.backdropDependent).toBe(true);
    expect(estimate.worstCaseContrastRatio).toBeLessThan(estimate.boxContrastRatio);
    expect(estimate.meetsTarget).toBe(true);
  });

  it('fails the worst-case target for a faint yellow box over a light backdrop', () => {
    const estimate = estimateCaptionContrast({
      textColor: '#ffff00',
      boxColor: '#000000',
      boxOpacity: 0.25,
    });
    expect(estimate.backdropDependent).toBe(true);
    expect(estimate.meetsTarget).toBe(false);
  });

  it('throws on invalid colour input instead of returning a false result', () => {
    expect(() =>
      estimateCaptionContrast({ textColor: 'red', boxColor: '#000000', boxOpacity: 1 }),
    ).toThrow();
  });
});
