import { CaptionAppearance } from './caption-appearance.model';
import { CaptionAppearanceIssue } from './caption-appearance-issue.model';

export interface CaptionAppearanceResult {
  readonly appearance: CaptionAppearance;
  readonly issues: readonly CaptionAppearanceIssue[];
}
