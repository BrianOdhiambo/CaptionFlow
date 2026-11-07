import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CaptionPreviewComponent, CAPTION_PREVIEW_SAMPLE } from './caption-preview.component';
import { CAPTION_APPEARANCE_DEFAULTS } from '../../utils/caption-appearance-defaults';
import { CaptionAppearance } from '../../models/caption-appearance.model';

describe('CaptionPreviewComponent', () => {
  it('shows representative caption text in the same overlay as the video', () => {
    const fixture = TestBed.createComponent(CaptionPreviewComponent);
    fixture.componentRef.setInput('appearance', CAPTION_APPEARANCE_DEFAULTS);
    fixture.detectChanges();
    const band = fixture.nativeElement.querySelector('.caption-band') as HTMLElement;
    expect(band.textContent?.trim()).toBe(CAPTION_PREVIEW_SAMPLE);
    expect(band.style.getPropertyValue('--caption-text-color')).toBe('#ffffff');
  });

  it('updates immediately when the appearance changes', () => {
    const fixture = TestBed.createComponent(CaptionPreviewComponent);
    fixture.componentRef.setInput('appearance', CAPTION_APPEARANCE_DEFAULTS);
    fixture.detectChanges();
    const updated: CaptionAppearance = {
      ...CAPTION_APPEARANCE_DEFAULTS,
      fontColor: '#00ffff',
      contrastMode: 'custom',
      captionPosition: 'center',
    };
    fixture.componentRef.setInput('appearance', updated);
    fixture.detectChanges();
    const band = fixture.nativeElement.querySelector('.caption-band') as HTMLElement;
    expect(band.style.getPropertyValue('--caption-text-color')).toBe('#00ffff');
    expect(fixture.nativeElement.querySelector('.caption-position-center')).not.toBeNull();
  });

  it('is hidden from assistive technology because the settings describe it', () => {
    const fixture = TestBed.createComponent(CaptionPreviewComponent);
    fixture.componentRef.setInput('appearance', CAPTION_APPEARANCE_DEFAULTS);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
