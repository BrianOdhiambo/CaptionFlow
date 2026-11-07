import { InjectionToken } from '@angular/core';
import type { CaptionAppearance } from '../models/caption-appearance.model';
import type { CaptionAppearanceResult } from '../models/caption-appearance-result.model';
import { LocalCaptionAppearanceStore } from './local-caption-appearance-store';

export interface CaptionAppearanceStore {
  load(): CaptionAppearanceResult;
  save(appearance: CaptionAppearance): boolean;
  clear(): boolean;
}

export const CAPTION_APPEARANCE_STORE = new InjectionToken<CaptionAppearanceStore>(
  'CAPTION_APPEARANCE_STORE',
  {
    providedIn: 'root',
    factory: () => new LocalCaptionAppearanceStore(),
  },
);
