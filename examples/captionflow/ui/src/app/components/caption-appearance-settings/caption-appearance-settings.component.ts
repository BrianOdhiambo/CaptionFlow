import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CaptionAppearancePresetId } from '../../models/caption-appearance-preset.model';
import { CaptionAppearanceService } from '../../services/caption-appearance.service';
import { CAPTION_APPEARANCE_LIMITS } from '../../utils/caption-appearance-defaults';
import { matchingPresetId } from '../../utils/caption-appearance-equality';
import {
  CONTRAST_MODE_OPTIONS,
  FONT_FAMILY_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  POSITION_OPTIONS,
  TEXT_OUTLINE_OPTIONS,
} from '../../utils/caption-appearance-options';
import { CAPTION_APPEARANCE_PRESETS } from '../../utils/caption-appearance-presets';
import { CaptionContrastNoticeComponent } from '../caption-contrast-notice/caption-contrast-notice.component';
import { CaptionPreviewComponent } from '../caption-preview/caption-preview.component';

type NumericAppearanceField =
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'backgroundOpacity'
  | 'backgroundPaddingHorizontal'
  | 'backgroundPaddingVertical'
  | 'backgroundRadius';

type TextAppearanceField =
  | 'fontFamily'
  | 'fontColor'
  | 'backgroundColor'
  | 'textOutline'
  | 'captionPosition'
  | 'contrastMode';

function readControlValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

@Component({
  selector: 'app-caption-appearance-settings',
  imports: [CaptionPreviewComponent, CaptionContrastNoticeComponent],
  templateUrl: './caption-appearance-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionAppearanceSettingsComponent {
  private readonly service = inject(CaptionAppearanceService);
  protected readonly appearance = this.service.appearance;
  protected readonly limits = CAPTION_APPEARANCE_LIMITS;
  protected readonly presets = CAPTION_APPEARANCE_PRESETS;
  protected readonly fontFamilyOptions = FONT_FAMILY_OPTIONS;
  protected readonly fontWeightOptions = FONT_WEIGHT_OPTIONS;
  protected readonly textOutlineOptions = TEXT_OUTLINE_OPTIONS;
  protected readonly positionOptions = POSITION_OPTIONS;
  protected readonly contrastModeOptions = CONTRAST_MODE_OPTIONS;
  protected readonly selectedPresetId = computed(() => matchingPresetId(this.appearance()));

  protected choosePreset(id: CaptionAppearancePresetId): void {
    this.service.applyPreset(id);
  }

  protected resetToDefaults(): void {
    this.service.resetAppearance();
  }

  protected setNumber(field: NumericAppearanceField, event: Event): void {
    this.service.updateAppearance({ [field]: Number(readControlValue(event)) });
  }

  protected setText(field: TextAppearanceField, event: Event): void {
    this.service.updateAppearance({ [field]: readControlValue(event) });
  }
}
