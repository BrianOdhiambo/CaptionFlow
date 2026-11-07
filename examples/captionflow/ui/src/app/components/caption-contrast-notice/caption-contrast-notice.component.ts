import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CaptionAppearance } from '../../models/caption-appearance.model';
import { CaptionContrastCategory } from '../../models/caption-contrast-status.model';
import { CAPTION_CONTRAST_TARGET_RATIO } from '../../utils/caption-appearance-defaults';
import { captionContrastStatus } from '../../utils/caption-contrast-status';

const CATEGORY_MESSAGES: Readonly<Record<CaptionContrastCategory, string>> = Object.freeze({
  pass: 'Contrast meets the 4.5 to 1 guideline for captions.',
  'pass-estimated':
    'Contrast meets the 4.5 to 1 guideline in the worst case. The caption box is see-through, so the real contrast depends on the video behind it. This is an estimate, not a guarantee.',
  fail: 'Low contrast. These colours are below the 4.5 to 1 guideline, so captions may be hard to read. Your colours are kept. Choose a stronger pair, or use High contrast.',
});

@Component({
  selector: 'app-caption-contrast-notice',
  templateUrl: './caption-contrast-notice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionContrastNoticeComponent {
  readonly appearance = input.required<CaptionAppearance>();
  protected readonly status = computed(() => captionContrastStatus(this.appearance()));
  protected readonly announcement = computed(() => CATEGORY_MESSAGES[this.status().category]);
  protected readonly ratioText = computed(() => {
    const ratio = this.status().estimate.worstCaseContrastRatio;
    return `${ratio.toFixed(1)} to 1 (target ${CAPTION_CONTRAST_TARGET_RATIO} to 1)`;
  });
  protected readonly isWarning = computed(() => this.status().category === 'fail');
}
