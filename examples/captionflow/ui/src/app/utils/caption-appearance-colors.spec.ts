import { describe, expect, it } from 'vitest';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import { resolveCaptionColors } from './caption-appearance-colors';
import { CaptionAppearance } from '../models/caption-appearance.model';

const custom: CaptionAppearance = {
  ...CAPTION_APPEARANCE_DEFAULTS,
  fontColor: '#ffff00',
  backgroundColor: '#0000ff',
  backgroundOpacity: 0.5,
};

describe('caption colour resolution', () => {
  it('normal uses default colours and keeps the viewer opacity', () => {
    expect(resolveCaptionColors({ ...custom, contrastMode: 'normal' })).toEqual({
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: 0.5,
    });
  });

  it('high uses white on opaque black', () => {
    expect(resolveCaptionColors({ ...custom, contrastMode: 'high' })).toEqual({
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: 1,
    });
  });

  it('inverted swaps the stored colours', () => {
    expect(resolveCaptionColors({ ...custom, contrastMode: 'inverted' })).toEqual({
      textColor: '#0000ff',
      boxColor: '#ffff00',
      boxOpacity: 0.5,
    });
  });

  it('custom uses the stored colours', () => {
    expect(resolveCaptionColors({ ...custom, contrastMode: 'custom' })).toEqual({
      textColor: '#ffff00',
      boxColor: '#0000ff',
      boxOpacity: 0.5,
    });
  });
});
