import {
  CAPTION_CONTRAST_MODES,
  CAPTION_FONT_FAMILIES,
  CAPTION_FONT_WEIGHTS,
  CAPTION_POSITIONS,
  CAPTION_TEXT_OUTLINES,
  CaptionAppearance,
  CaptionAppearanceField,
} from '../models/caption-appearance.model';
import { CaptionAppearanceIssue } from '../models/caption-appearance-issue.model';
import { CaptionAppearanceResult } from '../models/caption-appearance-result.model';
import {
  CAPTION_APPEARANCE_DEFAULTS,
  CAPTION_APPEARANCE_LIMITS,
  NumericRange,
} from './caption-appearance-defaults';

type FieldParser<K extends CaptionAppearanceField> = (
  value: unknown,
) => CaptionAppearance[K] | undefined;

type FieldParsers = { readonly [K in CaptionAppearanceField]-?: FieldParser<K> };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const CAPTION_APPEARANCE_FIELDS: readonly CaptionAppearanceField[] = Object.freeze(
  Object.keys(CAPTION_APPEARANCE_DEFAULTS) as CaptionAppearanceField[],
);

function oneOf<T extends string | number>(
  options: readonly T[],
): (value: unknown) => T | undefined {
  return (value) => options.find((option) => option === value);
}

function boundedNumber(range: NumericRange): (value: unknown) => number | undefined {
  return (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max
      ? value
      : undefined;
}

function hexColor(value: unknown): string | undefined {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : undefined;
}

const FIELD_PARSERS: FieldParsers = {
  fontFamily: oneOf(CAPTION_FONT_FAMILIES),
  fontSize: boundedNumber(CAPTION_APPEARANCE_LIMITS.fontSize),
  fontWeight: oneOf(CAPTION_FONT_WEIGHTS),
  fontColor: hexColor,
  backgroundColor: hexColor,
  backgroundOpacity: boundedNumber(CAPTION_APPEARANCE_LIMITS.backgroundOpacity),
  contrastMode: oneOf(CAPTION_CONTRAST_MODES),
  textOutline: oneOf(CAPTION_TEXT_OUTLINES),
  captionPosition: oneOf(CAPTION_POSITIONS),
  lineHeight: boundedNumber(CAPTION_APPEARANCE_LIMITS.lineHeight),
  letterSpacing: boundedNumber(CAPTION_APPEARANCE_LIMITS.letterSpacing),
  backgroundPaddingHorizontal: boundedNumber(CAPTION_APPEARANCE_LIMITS.backgroundPaddingHorizontal),
  backgroundPaddingVertical: boundedNumber(CAPTION_APPEARANCE_LIMITS.backgroundPaddingVertical),
  backgroundRadius: boundedNumber(CAPTION_APPEARANCE_LIMITS.backgroundRadius),
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCaptionAppearanceField(key: string): key is CaptionAppearanceField {
  return (CAPTION_APPEARANCE_FIELDS as readonly string[]).includes(key);
}

export function applyCaptionAppearancePatch(
  current: CaptionAppearance,
  patch: unknown,
  reportMissing = false,
): CaptionAppearanceResult {
  if (!isRecord(patch)) {
    const malformed: readonly CaptionAppearanceIssue[] = Object.freeze([
      { field: 'appearance', reason: 'malformed' },
    ]);
    return { appearance: current, issues: malformed };
  }

  const issues: CaptionAppearanceIssue[] = [];
  const next: Record<string, unknown> = { ...current };
  let colourChanged = false;
  let contrastModeProvided = false;

  for (const key of Object.keys(patch)) {
    if (!isCaptionAppearanceField(key)) {
      issues.push({ field: key, reason: 'unknown' });
    }
  }

  for (const field of CAPTION_APPEARANCE_FIELDS) {
    if (!(field in patch)) {
      if (reportMissing) {
        issues.push({ field, reason: 'missing' });
      }
      continue;
    }

    const parsed = FIELD_PARSERS[field](patch[field]);
    if (parsed === undefined) {
      issues.push({ field, reason: 'invalid' });
      continue;
    }

    next[field] = parsed;
    if (field === 'fontColor' || field === 'backgroundColor') {
      colourChanged = true;
    }
    if (field === 'contrastMode') {
      contrastModeProvided = true;
    }
  }

  if (colourChanged && !contrastModeProvided) {
    next['contrastMode'] = 'custom';
  }

  return {
    appearance: Object.freeze(next as unknown as CaptionAppearance),
    issues: Object.freeze(issues),
  };
}

export function validateCaptionAppearance(input: unknown): CaptionAppearanceResult {
  return applyCaptionAppearancePatch(CAPTION_APPEARANCE_DEFAULTS, input, true);
}
