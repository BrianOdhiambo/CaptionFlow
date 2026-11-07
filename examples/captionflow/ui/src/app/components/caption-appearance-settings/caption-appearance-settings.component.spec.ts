import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaptionAppearanceSettingsComponent } from './caption-appearance-settings.component';
import { CaptionAppearanceService } from '../../services/caption-appearance.service';
import { CAPTION_APPEARANCE_STORAGE_KEY } from '../../services/local-caption-appearance-store';
import { CAPTION_APPEARANCE_DEFAULTS } from '../../utils/caption-appearance-defaults';

function render() {
  const fixture = TestBed.createComponent(CaptionAppearanceSettingsComponent);
  fixture.detectChanges();
  const service = TestBed.inject(CaptionAppearanceService);
  return { fixture, element: fixture.nativeElement as HTMLElement, service };
}

function control<T extends HTMLElement>(element: HTMLElement, selector: string): T {
  const found = element.querySelector(selector);
  if (!found) {
    throw new Error(`Missing control ${selector}`);
  }
  return found as T;
}

function changeInput(input: HTMLInputElement, value: string, eventName: 'input' | 'change'): void {
  input.value = value;
  input.dispatchEvent(new Event(eventName));
}

function presetButton(element: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(element.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  if (!button) {
    throw new Error(`Missing preset ${label}`);
  }
  return button as HTMLButtonElement;
}

describe('CaptionAppearanceSettingsComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('labels every control', () => {
    const { element } = render();
    const controls = element.querySelectorAll('select, input:not([type="hidden"])');
    for (const item of Array.from(controls)) {
      const id = item.id;
      expect(element.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
  });

  it('shows the four presets, with aria-pressed false until one matches', () => {
    const { element } = render();
    const labels = Array.from(element.querySelectorAll('button[aria-pressed]')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['White on dark', 'Yellow on black', 'Black on white', 'Cyan on black']);
    for (const button of Array.from(element.querySelectorAll('button[aria-pressed]'))) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('applies a preset to the shared state and marks it pressed', () => {
    const { element, service, fixture } = render();
    presetButton(element, 'Yellow on black').click();
    fixture.detectChanges();
    expect(service.appearance().fontColor).toBe('#ffff00');
    expect(presetButton(element, 'Yellow on black').getAttribute('aria-pressed')).toBe('true');
    expect(presetButton(element, 'White on dark').getAttribute('aria-pressed')).toBe('false');
  });

  it('updates numeric sliders and shows the value', () => {
    const { element, service, fixture } = render();
    changeInput(control<HTMLInputElement>(element, '#caption-font-size'), '2', 'input');
    fixture.detectChanges();
    expect(service.appearance().fontSize).toBe(2);
    expect(element.querySelector('label[for="caption-font-size"]')?.textContent).toContain('2 rem');
  });

  it('updates selects for position and contrast mode', () => {
    const { element, service } = render();
    changeInput(control<HTMLInputElement>(element, '#caption-position'), 'top', 'change');
    changeInput(control<HTMLInputElement>(element, '#caption-contrast-mode'), 'inverted', 'change');
    expect(service.appearance().captionPosition).toBe('top');
    expect(service.appearance().contrastMode).toBe('inverted');
  });

  it('updates colours and keeps the viewer choice visible in custom mode', () => {
    const { element, service } = render();
    changeInput(control<HTMLInputElement>(element, '#caption-font-color'), '#00ff00', 'input');
    expect(service.appearance().fontColor).toBe('#00ff00');
    expect(service.appearance().contrastMode).toBe('custom');
  });

  it('shows a low-contrast warning without changing the viewer colours', () => {
    const { element, service, fixture } = render();
    changeInput(control<HTMLInputElement>(element, '#caption-background-color'), '#777777', 'input');
    changeInput(control<HTMLInputElement>(element, '#caption-background-opacity'), '1', 'input');
    fixture.detectChanges();
    const live = element.querySelector('[role="status"]') as HTMLElement;
    expect(live.textContent).toContain('Low contrast');
    expect(service.appearance().backgroundColor).toBe('#777777');
  });

  it('resets to the defaults and clears the saved settings', () => {
    const { element, service, fixture } = render();
    changeInput(control<HTMLInputElement>(element, '#caption-font-size'), '2', 'input');
    const reset = Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Reset'));
    reset?.click();
    fixture.detectChanges();
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
    expect(localStorage.getItem(CAPTION_APPEARANCE_STORAGE_KEY)).toBeNull();
  });

  it('restores saved settings when the panel is created again', () => {
    const first = render();
    changeInput(control<HTMLInputElement>(first.element, '#caption-font-size'), '1.6', 'input');
    TestBed.resetTestingModule();
    const second = render();
    expect(second.service.appearance().fontSize).toBe(1.6);
  });

  it('falls back to defaults when stored settings are invalid', () => {
    localStorage.setItem(CAPTION_APPEARANCE_STORAGE_KEY, '{"fontSize": 99, "fontColor": "red"');
    const { service } = render();
    expect(service.appearance()).toEqual(CAPTION_APPEARANCE_DEFAULTS);
  });

  it('keeps the reading settings out of the appearance store', () => {
    localStorage.setItem('captionflow.reading', '{"wordsPerMinute":180}');
    const { element, fixture } = render();
    changeInput(control<HTMLInputElement>(element, '#caption-font-size'), '1.5', 'input');
    fixture.detectChanges();
    expect(localStorage.getItem('captionflow.reading')).toBe('{"wordsPerMinute":180}');
  });
});
