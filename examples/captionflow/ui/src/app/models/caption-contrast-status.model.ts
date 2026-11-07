import { CaptionContrastEstimate } from './caption-contrast-estimate.model';

export type CaptionContrastCategory = 'pass' | 'pass-estimated' | 'fail';

export interface CaptionContrastStatus {
  readonly category: CaptionContrastCategory;
  readonly estimate: CaptionContrastEstimate;
}
