export interface CaptionContrastEstimate {
  readonly boxContrastRatio: number;
  readonly worstCaseContrastRatio: number;
  readonly backdropDependent: boolean;
  readonly meetsTarget: boolean;
  readonly targetRatio: number;
}
