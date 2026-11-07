import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CaptionAppearance } from '../../models/caption-appearance.model';
import { CAPTION_APPEARANCE_DEFAULTS } from '../../utils/caption-appearance-defaults';
import {
  captionBandClasses,
  captionLayerClasses,
  captionStyleVariables,
} from '../../utils/caption-appearance-styles';

@Component({
  selector: 'app-caption-overlay',
  templateUrl: './caption-overlay.component.html',
  styleUrl: './caption-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pe-none' },
})
export class CaptionOverlayComponent {
  readonly text = input('');
  readonly appearance = input<CaptionAppearance>(CAPTION_APPEARANCE_DEFAULTS);
  protected readonly layerClasses = computed(() => captionLayerClasses(this.appearance()));
  protected readonly bandClasses = computed(() => captionBandClasses(this.appearance()));
  protected readonly variables = computed(() => captionStyleVariables(this.appearance()));
}
