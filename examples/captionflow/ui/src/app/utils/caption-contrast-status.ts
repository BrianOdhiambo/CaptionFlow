import { CaptionAppearance } from '../models/caption-appearance.model';
import { CaptionContrastStatus } from '../models/caption-contrast-status.model';
import { resolveCaptionColors } from './caption-appearance-colors';
import { estimateCaptionContrast } from './contrast-ratio';

export function captionContrastStatus(appearance: CaptionAppearance): CaptionContrastStatus {
  const estimate = estimateCaptionContrast(resolveCaptionColors(appearance));
  if (!estimate.meetsTarget) {
    return { category: 'fail', estimate };
  }
  return { category: estimate.backdropDependent ? 'pass-estimated' : 'pass', estimate };
}
