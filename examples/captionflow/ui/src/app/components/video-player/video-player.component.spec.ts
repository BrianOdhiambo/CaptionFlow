import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { VideoPlayerComponent } from './video-player.component';
import { CaptionOverlayComponent } from '../caption-overlay/caption-overlay.component';
import { VIDEO_SURFACE } from '../../playback/video-surface';
import { CAPTION_APPEARANCE_DEFAULTS } from '../../utils/caption-appearance-defaults';

describe('VideoPlayerComponent appearance propagation', () => {
  it('passes the appearance and caption text down to the overlay', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: VIDEO_SURFACE,
          useValue: { attach: () => undefined, reportTime: () => undefined },
        },
      ],
    });
    const fixture = TestBed.createComponent(VideoPlayerComponent);
    const appearance = {
      ...CAPTION_APPEARANCE_DEFAULTS,
      captionPosition: 'center' as const,
      fontFamily: 'system-serif' as const,
    };
    fixture.componentRef.setInput('source', 'blob:test');
    fixture.componentRef.setInput('caption', 'Hello there');
    fixture.componentRef.setInput('appearance', appearance);
    fixture.detectChanges();

    const overlay = fixture.debugElement.query(By.directive(CaptionOverlayComponent));
    expect(overlay.componentInstance.appearance()).toEqual(appearance);
    expect(overlay.componentInstance.text()).toBe('Hello there');
    const band = fixture.nativeElement.querySelector('.caption-band') as HTMLElement;
    expect(band.classList).toContain('caption-font-system-serif');
    expect(fixture.nativeElement.querySelector('.caption-position-center')).not.toBeNull();
  });
});
