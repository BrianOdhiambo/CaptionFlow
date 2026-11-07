import { Injectable, inject, signal } from '@angular/core';
import { CaptionAppearance } from '../models/caption-appearance.model';
import { CaptionAppearanceIssue } from '../models/caption-appearance-issue.model';
import { CaptionAppearancePresetId } from '../models/caption-appearance-preset.model';
import { CAPTION_APPEARANCE_DEFAULTS } from '../utils/caption-appearance-defaults';
import { findCaptionAppearancePreset } from '../utils/caption-appearance-presets';
import { applyCaptionAppearancePatch } from '../utils/caption-appearance-validation';
import { CAPTION_APPEARANCE_STORE } from './caption-appearance-store';

@Injectable({ providedIn: 'root' })
export class CaptionAppearanceService {
  private readonly store = inject(CAPTION_APPEARANCE_STORE);
  private readonly loaded = this.store.load();
  private readonly state = signal<CaptionAppearance>(this.loaded.appearance);

  readonly appearance = this.state.asReadonly();
  readonly loadIssues: readonly CaptionAppearanceIssue[] = this.loaded.issues;

  updateAppearance(patch: Partial<CaptionAppearance>): readonly CaptionAppearanceIssue[] {
    const result = applyCaptionAppearancePatch(this.state(), patch);
    this.commit(result.appearance);
    return result.issues;
  }

  applyPreset(id: CaptionAppearancePresetId): boolean {
    const preset = findCaptionAppearancePreset(id);
    if (!preset) {
      return false;
    }
    this.commit(preset.appearance);
    return true;
  }

  resetAppearance(): void {
    this.state.set(CAPTION_APPEARANCE_DEFAULTS);
    this.store.clear();
  }

  private commit(appearance: CaptionAppearance): void {
    this.state.set(appearance);
    this.store.save(appearance);
  }
}
