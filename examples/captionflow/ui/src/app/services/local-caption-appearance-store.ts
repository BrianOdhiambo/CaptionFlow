import { InjectionToken, inject } from '@angular/core';
import type { CaptionAppearance } from '../models/caption-appearance.model';
import type { CaptionAppearanceIssue } from '../models/caption-appearance-issue.model';
import type { CaptionAppearanceResult } from '../models/caption-appearance-result.model';
import { CAPTION_APPEARANCE_DEFAULTS } from '../utils/caption-appearance-defaults';
import { validateCaptionAppearance } from '../utils/caption-appearance-validation';
import type { CaptionAppearanceStore } from './caption-appearance-store';

export const CAPTION_APPEARANCE_STORAGE_KEY = 'captionflow.caption-appearance.v1';

export type StorageResolver = () => Storage | null;

export function readBrowserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const BROWSER_LOCAL_STORAGE = new InjectionToken<StorageResolver>('BROWSER_LOCAL_STORAGE', {
  providedIn: 'root',
  factory: () => readBrowserLocalStorage,
});

function defaultsWithIssue(issue: CaptionAppearanceIssue): CaptionAppearanceResult {
  return { appearance: CAPTION_APPEARANCE_DEFAULTS, issues: Object.freeze([issue]) };
}

export class LocalCaptionAppearanceStore implements CaptionAppearanceStore {
  private readonly resolveStorage = inject(BROWSER_LOCAL_STORAGE);

  load(): CaptionAppearanceResult {
    const storage = this.storageOrNull();
    if (!storage) {
      return defaultsWithIssue({ field: 'storage', reason: 'unavailable' });
    }

    let raw: string | null;
    try {
      raw = storage.getItem(CAPTION_APPEARANCE_STORAGE_KEY);
    } catch {
      return defaultsWithIssue({ field: 'storage', reason: 'unavailable' });
    }
    if (raw === null) {
      return { appearance: CAPTION_APPEARANCE_DEFAULTS, issues: Object.freeze([]) };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultsWithIssue({ field: 'storage', reason: 'malformed' });
    }
    return validateCaptionAppearance(parsed);
  }

  save(appearance: CaptionAppearance): boolean {
    const storage = this.storageOrNull();
    if (!storage) {
      return false;
    }
    try {
      storage.setItem(CAPTION_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
      return true;
    } catch {
      return false;
    }
  }

  clear(): boolean {
    const storage = this.storageOrNull();
    if (!storage) {
      return false;
    }
    try {
      storage.removeItem(CAPTION_APPEARANCE_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  private storageOrNull(): Storage | null {
    try {
      return this.resolveStorage();
    } catch {
      return null;
    }
  }
}
