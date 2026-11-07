import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CaptionOverlayComponent } from './caption-overlay.component';
import { CAPTION_APPEARANCE_DEFAULTS } from '../../utils/caption-appearance-defaults';
import { CaptionAppearance } from '../../models/caption-appearance.model';

function render(text: string, appearance?: CaptionAppearance) {
  const fixture = TestBed.createComponent(CaptionOverlayComponent);
  fixture.componentRef.setInput('text', text);
  if (appearance) {
    fixture.componentRef.setInput('appearance', appearance);
  }
  fixture.detectChanges();
  return fixture;
}

function band(fixture: ReturnType<typeof render>): HTMLElement {
  return fixture.nativeElement.querySelector('.caption-band') as HTMLElement;
}

describe('CaptionOverlayComponent', () => {
  it('renders nothing when there is no caption text', () => {
    const fixture = render('');
    expect(fixture.nativeElement.querySelector('.caption-band')).toBeNull();
  });

  it('renders the default look as CSS variables', () => {
    const fixture = render('Hello');
    expect(band(fixture).textContent?.trim()).toBe('Hello');
    expect(band(fixture).style.getPropertyValue('--caption-font-size')).toBe('1.25rem');
    expect(band(fixture).style.getPropertyValue('--caption-box-opacity')).toBe('0.75');
    expect(band(fixture).classList).toContain('caption-font-app-default');
    expect(band(fixture).classList).toContain('caption-outline-none');
  });

  it('applies a custom appearance, including position, font and outline', () => {
    const fixture = render('Hello', {
      ...CAPTION_APPEARANCE_DEFAULTS,
      fontFamily: 'monospace',
      textOutline: 'outline',
      captionPosition: 'top',
      fontColor: '#ffff00',
      contrastMode: 'custom',
    });
    const layer = fixture.nativeElement.querySelector('.caption-layer') as HTMLElement;
    expect(layer.classList).toContain('caption-position-top');
    expect(band(fixture).classList).toContain('caption-font-monospace');
    expect(band(fixture).classList).toContain('caption-outline-outline');
    expect(band(fixture).style.getPropertyValue('--caption-text-color')).toBe('#ffff00');
  });

  it('is not a live region, so captions are not announced by the page', () => {
    const fixture = render('Hello');
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
  });
});
