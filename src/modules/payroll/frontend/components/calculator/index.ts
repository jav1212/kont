// Barrel for the payroll calculator atoms.
// Every sister calculator (vacations, social-benefits, profit-sharing,
// liquidations) imports its chrome from here so the dense left panel
// and the constancia preview card stay identical across the module.

export {
    formatCurrency,
    formatNumber,
    formatUsd,
    formatDateLong,
    formatDateUpper,
    makeDocumentId,
} from "./formatters";

export { FIELD_CLS, LABEL_CLS } from "./field-styles";

export { useCalculatorBcv } from "./use-calculator-bcv";
export type { CalculatorBcv } from "./use-calculator-bcv";

export {
    SectionHeader,
    CalculatorPanelHeader,
    OnlyActiveToggle,
} from "./chrome";
export type {
    SectionHeaderProps,
    SectionHeaderTone,
    CalculatorPanelHeaderProps,
    OnlyActiveToggleProps,
} from "./chrome";

export {
    EmployeeSelect,
    EmployeeInfoCard,
} from "./employee-picker";
export type {
    EmployeeSelectProps,
    EmployeeInfoCardProps,
} from "./employee-picker";

export { BcvRateField } from "./bcv-rate-field";
export type { BcvRateFieldProps } from "./bcv-rate-field";

export {
    CalculatorFooter,
    FooterStat,
    FooterTotal,
} from "./calculator-footer";
export type {
    CalculatorFooterProps,
    FooterStatProps,
    FooterTotalProps,
} from "./calculator-footer";

export {
    ConstanciaShell,
    ConstanciaWarning,
    LiquidoTotal,
    CalcRow,
} from "./constancia";
export type {
    ConstanciaShellProps,
    ConstanciaWarningProps,
    LiquidoTotalProps,
    CalcRowProps,
    ConstanciaKpi,
} from "./constancia";

export {
    CalculatorLoading,
    CalculatorEmptyState,
} from "./loading-state";
export type {
    CalculatorLoadingProps,
    CalculatorEmptyStateProps,
} from "./loading-state";
