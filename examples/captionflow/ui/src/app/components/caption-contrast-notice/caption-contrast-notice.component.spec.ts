import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CaptionContrastNoticeComponent } from './caption-contrast-notice.component';
import { CAPTION_APPEARANCE_DEFAULTS } from '../../utils/caption-appearance-defaults';
import { CaptionAppearance } from '../../models/caption-appearance.model';

function render(appearance: CaptionAppearance) {
  const fixture = TestBed.createComponent(CaptionContrastNoticeComponent);
  fixture.componentRef.setInput('appearance', appearance);
  fixture.detectChanges();
  return fixture;
}

describe('CaptionContrastNoticeComponent', () => {
  it('warns clearly when colours fall below the guideline', () => {
    const fixture = render({
      ...CAPTION_APPEARANCE_DEFAULTS,
      backgroundColor: '#777777',
      backgroundOpacity: 1,
      contrastMode: 'custom',
    });
    const live = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(live.textContent).toContain('Low contrast');
    expect(live.textContent).toContain('Your colours are kept');
  });

  it('explains that translucent contrast is an estimate, not a guarantee', () => {
    const fixture = render(CAPTION_APPEARANCE_DEFAULTS);
    const live = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(live.textContent).toContain('estimate, not a guarantee');
  });

  it('reports the estimated ratio outside the live region', () => {
    const fixture = render({ ...CAPTION_APPEARANCE_DEFAULTS, backgroundOpacity: 1 });
    const live = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(live.textContent).not.toContain('21.0');
    expect(fixture.nativeElement.textContent).toContain('21.0 to 1');
  });
});
