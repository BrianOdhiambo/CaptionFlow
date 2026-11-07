export type CaptionAppearanceIssueReason =
  'invalid' | 'unknown' | 'missing' | 'malformed' | 'unavailable';

export interface CaptionAppearanceIssue {
  readonly field: string;
  readonly reason: CaptionAppearanceIssueReason;
}
