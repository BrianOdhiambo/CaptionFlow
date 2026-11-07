import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CaptionAppearance } from '../../models/caption-appearance.model';
import { CaptionOverlayComponent } from '../caption-overlay/caption-overlay.component';

export const CAPTION_PREVIEW_SAMPLE =
  'This preview shows how your captions will look on the video. Longer captions wrap onto two lines and then stop, so they never cover the picture.';

@Component({
  selector: 'app-caption-preview',
  imports: [CaptionOverlayComponent],
  templateUrl: './caption-preview.component.html',
  styleUrl: './caption-preview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionPreviewComponent {
  readonly appearance = input.required<CaptionAppearance>();
  protected readonly sampleText = CAPTION_PREVIEW_SAMPLE;
}
