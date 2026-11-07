export interface SelectOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}
