import { describe, expect, it } from 'vitest';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import { captionContrastStatus } from './caption-contrast-status';

describe('caption contrast status', () => {
  it('passes an opaque high-contrast pair without an estimate note', () => {
    const status = captionContrastStatus({
      ...CAPTION_APPEARANCE_DEFAULTS,
      backgroundOpacity: 1,
      contrastMode: 'high',
    });
    expect(status.category).toBe('pass');
  });

  it('marks a translucent box as an estimate that depends on the video', () => {
    expect(captionContrastStatus(CAPTION_APPEARANCE_DEFAULTS).category).toBe('pass-estimated');
  });

  it('fails a pair below 4.5 to 1 and keeps the viewer colours', () => {
    const appearance = {
      ...CAPTION_APPEARANCE_DEFAULTS,
      fontColor: '#ffffff',
      backgroundColor: '#777777',
      backgroundOpacity: 1,
      contrastMode: 'custom' as const,
    };
    const status = captionContrastStatus(appearance);
    expect(status.category).toBe('fail');
    expect(status.estimate.meetsTarget).toBe(false);
    expect(appearance.backgroundColor).toBe('#777777');
  });
});
