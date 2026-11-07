import { describe, expect, it } from 'vitest';
import { CAPTION_APPEARANCE_DEFAULTS } from './caption-appearance-defaults';
import {
  captionBandClasses,
  captionLayerClasses,
  captionStyleVariables,
} from './caption-appearance-styles';
import { CaptionAppearance } from '../models/caption-appearance.model';

describe('caption style variables', () => {
  it('reproduce the current overlay look for the defaults', () => {
    expect(captionStyleVariables(CAPTION_APPEARANCE_DEFAULTS)).toEqual({
      fontSize: '1.25rem',
      fontWeight: '500',
      lineHeight: '1.25',
      letterSpacing: '0em',
      paddingHorizontal: '1rem',
      paddingVertical: '0.5rem',
      radius: '0.375rem',
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: '0.75',
    });
  });

  it('map the high contrast mode to opaque white on black', () => {
    const variables = captionStyleVariables({
      ...CAPTION_APPEARANCE_DEFAULTS,
      contrastMode: 'high',
    });
    expect(variables.textColor).toBe('#ffffff');
    expect(variables.boxColor).toBe('#000000');
    expect(variables.boxOpacity).toBe('1');
  });

  it('carry the viewer colours and opacity in custom mode', () => {
    const appearance: CaptionAppearance = {
      ...CAPTION_APPEARANCE_DEFAULTS,
      fontColor: '#ffff00',
      backgroundColor: '#112233',
      backgroundOpacity: 0.5,
      contrastMode: 'custom',
    };
    const variables = captionStyleVariables(appearance);
    expect(variables.textColor).toBe('#ffff00');
    expect(variables.boxColor).toBe('#112233');
    expect(variables.boxOpacity).toBe('0.5');
  });

  it('keeps horizontal and vertical padding independent', () => {
    const variables = captionStyleVariables({
      ...CAPTION_APPEARANCE_DEFAULTS,
      backgroundPaddingHorizontal: 2,
      backgroundPaddingVertical: 0.25,
    });
    expect(variables.paddingHorizontal).toBe('2rem');
    expect(variables.paddingVertical).toBe('0.25rem');
  });
});

describe('caption classes', () => {
  it('name the font family and outline with semantic identifiers only', () => {
    const classes = captionBandClasses({
      ...CAPTION_APPEARANCE_DEFAULTS,
      fontFamily: 'system-serif',
      textOutline: 'shadow',
    });
    expect(classes.split(' ')).toEqual([
      'caption-band',
      'caption-font-system-serif',
      'caption-outline-shadow',
    ]);
  });

  it('put the position on the layer class', () => {
    expect(captionLayerClasses({ ...CAPTION_APPEARANCE_DEFAULTS, captionPosition: 'top' })).toBe(
      'caption-layer caption-position-top',
    );
    expect(captionLayerClasses(CAPTION_APPEARANCE_DEFAULTS)).toBe(
      'caption-layer caption-position-bottom',
    );
  });
});
