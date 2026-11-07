import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { CaptionAppearance } from '../models/caption-appearance.model';
import { CAPTION_APPEARANCE_DEFAULTS } from '../utils/caption-appearance-defaults';
import { resolveCaptionColors } from '../utils/caption-appearance-colors';
import { findCaptionAppearancePreset } from '../utils/caption-appearance-presets';
import { CAPTION_APPEARANCE_STORE } from './caption-appearance-store';
import {
  BROWSER_LOCAL_STORAGE,
  CAPTION_APPEARANCE_STORAGE_KEY,
  LocalCaptionAppearanceStore,
} from './local-caption-appearance-store';
import { CaptionAppearanceService } from './caption-appearance.service';

class FakeStorage {
  readonly items = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('QuotaExceededError');
    }
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function createService(resolver: () => Storage | null): CaptionAppearanceService {
  const injector = Injector.create({
    providers: [
      { provide: BROWSER_LOCAL_STORAGE, useValue: resolver },
      { provide: CAPTION_APPEARANCE_STORE, useFactory: () => new LocalCaptionAppearanceStore() },
    ],
  });
  return runInInjectionContext(injector, () => new CaptionAppearanceService());
}

describe('CaptionAppearanceService persistence', () => {
  it('starts from defaults when nothing is saved', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    expect(service.loadIssues).toEqual([]);
  });

  it('updates the signal immediately and persists the change', () => {
    const storage = new FakeStorage();
    const service = createService(() => storage as unknown as Storage);
    const issues = service.updateAppearance({ fontSize: 2, captionPosition: 'top' });
    expect(issues).toEqual([]);
    expect(service.appearance().fontSize).toBe(2);
    expect(service.appearance().captionPosition).toBe('top');
    const saved = JSON.parse(storage.items.get(CAPTION_APPEARANCE_STORAGE_KEY) ?? 'null');
    expect(saved.fontSize).toBe(2);
  });

  it('restores saved preferences after a reload', () => {
    const storage = new FakeStorage();
    createService(() => storage as unknown as Storage).updateAppearance({
      fontColor: '#00ffff',
      backgroundOpacity: 0.9,
    });
    const reloaded = createService(() => storage as unknown as Storage);
    expect(reloaded.appearance().fontColor).toBe('#00ffff');
    expect(reloaded.appearance().backgroundOpacity).toBe(0.9);
    expect(reloaded.appearance().contrastMode).toBe('custom');
  });

  it('rejects an invalid update field by field and leaves state intact', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    const issues = service.updateAppearance({ fontSize: 99, fontColor: '#00ff00' });
    expect(issues).toEqual([{ field: 'fontSize', reason: 'invalid' }]);
    expect(service.appearance().fontSize).toBe(CAPTION_APPEARANCE_DEFAULTS.fontSize);
    expect(service.appearance().fontColor).toBe('#00ff00');
  });

  it('falls back to defaults on malformed JSON without throwing', () => {
    const storage = new FakeStorage();
    storage.items.set(CAPTION_APPEARANCE_STORAGE_KEY, '{not json');
    const service = createService(() => storage as unknown as Storage);
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    expect(service.loadIssues).toEqual([{ field: 'storage', reason: 'malformed' }]);
  });

  it('keeps valid stored values and replaces invalid ones on load', () => {
    const storage = new FakeStorage();
    storage.items.set(
      CAPTION_APPEARANCE_STORAGE_KEY,
      JSON.stringify({
        ...CAPTION_APPEARANCE_DEFAULTS,
        fontSize: 9,
        fontFamily: 'evil',
        fontColor: '#abcdef',
      }),
    );
    const service = createService(() => storage as unknown as Storage);
    expect(service.appearance().fontSize).toBe(CAPTION_APPEARANCE_DEFAULTS.fontSize);
    expect(service.appearance().fontFamily).toBe('app-default');
    expect(service.appearance().fontColor).toBe('#abcdef');
    expect(service.loadIssues.map((i) => i.field).sort()).toEqual(['fontFamily', 'fontSize']);
  });

  it('treats a stored array, string or null as malformed', () => {
    for (const raw of ['[]', '"x"', 'null']) {
      const storage = new FakeStorage();
      storage.items.set(CAPTION_APPEARANCE_STORAGE_KEY, raw);
      const service = createService(() => storage as unknown as Storage);
      expect(service.appearance(), raw).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    }
  });

  it('does not crash when storage is unavailable; changes apply in memory only', () => {
    const service = createService(() => null);
    expect(service.loadIssues).toEqual([{ field: 'storage', reason: 'unavailable' }]);
    service.updateAppearance({ fontSize: 2 });
    expect(service.appearance().fontSize).toBe(2);
  });

  it('treats a storage resolver that throws as unavailable', () => {
    const service = createService(() => {
      throw new Error('SecurityError');
    });
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    expect(() => service.updateAppearance({ fontSize: 1.5 })).not.toThrow();
  });

  it('still updates the signal when a write fails (quota)', () => {
    const storage = new FakeStorage();
    const service = createService(() => storage as unknown as Storage);
    storage.failWrites = true;
    expect(() => service.updateAppearance({ fontSize: 2.2 })).not.toThrow();
    expect(service.appearance().fontSize).toBe(2.2);
  });

  it('applyPreset replaces the complete configuration and persists it', () => {
    const storage = new FakeStorage();
    const service = createService(() => storage as unknown as Storage);
    service.updateAppearance({ fontSize: 2.4, captionPosition: 'center' });
    expect(service.applyPreset('yellow-on-black')).toBe(true);
    expect(service.appearance()).toEqual(
      findCaptionAppearancePreset('yellow-on-black')?.appearance,
    );
    expect(service.appearance().captionPosition).toBe('bottom');
    expect(createService(() => storage as unknown as Storage).appearance().fontColor).toBe(
      '#ffff00',
    );
  });

  it('applyPreset rejects an unknown preset id', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    expect(
      service.applyPreset('neon-pink' as Parameters<CaptionAppearanceService['applyPreset']>[0]),
    ).toBe(false);
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
  });

  it('resetAppearance restores defaults and removes the saved key', () => {
    const storage = new FakeStorage();
    const service = createService(() => storage as unknown as Storage);
    service.updateAppearance({ fontSize: 2 });
    service.resetAppearance();
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    expect(storage.items.has(CAPTION_APPEARANCE_STORAGE_KEY)).toBe(false);
    expect(createService(() => storage as unknown as Storage).appearance()).toEqual(
      CAPTION_APPEARANCE_DEFAULTS,
    );
  });

  it('uses a versioned key separate from other keys', () => {
    expect(CAPTION_APPEARANCE_STORAGE_KEY).toBe('captionflow.caption-appearance.v1');
    const storage = new FakeStorage();
    storage.items.set('captionflow.reading', '{"wordsPerMinute":180}');
    createService(() => storage as unknown as Storage).updateAppearance({ fontSize: 1.5 });
    expect(storage.items.get('captionflow.reading')).toBe('{"wordsPerMinute":180}');
  });
});

describe('CaptionAppearanceService contrast mode transitions', () => {
  it('normal shows default colours while keeping the viewer colours in state', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    service.updateAppearance({
      fontColor: '#00ffff',
      backgroundColor: '#222222',
      contrastMode: 'custom',
    });
    service.updateAppearance({ contrastMode: 'normal' });
    expect(service.appearance().fontColor).toBe('#00ffff');
    expect(service.appearance().backgroundColor).toBe('#222222');
    expect(resolveCaptionColors(service.appearance())).toEqual({
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: 0.75,
    });
  });

  it('switching back to custom restores the viewer colours and opacity', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    service.updateAppearance({
      fontColor: '#00ffff',
      backgroundColor: '#222222',
      backgroundOpacity: 0.5,
      contrastMode: 'custom',
    });
    for (const mode of ['high', 'inverted', 'normal'] as const) {
      service.updateAppearance({ contrastMode: mode });
    }
    service.updateAppearance({ contrastMode: 'custom' });
    expect(resolveCaptionColors(service.appearance())).toEqual({
      textColor: '#00ffff',
      boxColor: '#222222',
      boxOpacity: 0.5,
    });
  });

  it('high uses opaque black without overwriting the viewer opacity', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    service.updateAppearance({ backgroundOpacity: 0.5 });
    service.updateAppearance({ contrastMode: 'high' });
    expect(service.appearance().backgroundOpacity).toBe(0.5);
    expect(resolveCaptionColors(service.appearance())).toEqual({
      textColor: '#ffffff',
      boxColor: '#000000',
      boxOpacity: 1,
    });
  });

  it('inverted swaps the viewer colours and keeps them stored', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    service.updateAppearance({
      fontColor: '#ffff00',
      backgroundColor: '#000080',
      contrastMode: 'custom',
    });
    service.updateAppearance({ contrastMode: 'inverted' });
    expect(service.appearance().fontColor).toBe('#ffff00');
    expect(resolveCaptionColors(service.appearance())).toEqual({
      textColor: '#000080',
      boxColor: '#ffff00',
      boxOpacity: 0.75,
    });
  });

  it('switches to custom when a colour changes in normal mode, so the change is visible', () => {
    const service = createService(() => new FakeStorage() as unknown as Storage);
    service.updateAppearance({ fontColor: '#00ff00' });
    expect(service.appearance().contrastMode).toBe('custom');
    expect(resolveCaptionColors(service.appearance()).textColor).toBe('#00ff00');
  });

  it('keeps split padding across reloads', () => {
    const storage = new FakeStorage();
    createService(() => storage as unknown as Storage).updateAppearance({
      backgroundPaddingHorizontal: 1.5,
      backgroundPaddingVertical: 0.25,
    });
    const reloaded: CaptionAppearance = createService(
      () => storage as unknown as Storage,
    ).appearance();
    expect(reloaded.backgroundPaddingHorizontal).toBe(1.5);
    expect(reloaded.backgroundPaddingVertical).toBe(0.25);
  });

  it('reports a stored value in the old single-padding shape as unknown and ignores it', () => {
    const storage = new FakeStorage();
    storage.items.set(
      CAPTION_APPEARANCE_STORAGE_KEY,
      JSON.stringify({ ...CAPTION_APPEARANCE_DEFAULTS, backgroundPadding: 2 }),
    );
    const service = createService(() => storage as unknown as Storage);
    expect(service.loadIssues).toEqual([{ field: 'backgroundPadding', reason: 'unknown' }]);
    expect(service.appearance().backgroundPaddingHorizontal).toBe(1);
  });
});
