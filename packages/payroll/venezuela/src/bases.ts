export type VenezuelanSalaryNature = "salary" | "non_salary_benefit" | "documented_reimbursement";
export type VenezuelanEarningRegularity = "regular" | "accidental";
export type VenezuelanPaymentNature = "earned_payment" | "integral_salary_accrual";

export interface VenezuelanEarningClassification {
  readonly salaryNature: VenezuelanSalaryNature;
  readonly regularity: VenezuelanEarningRegularity;
  readonly paymentNature: VenezuelanPaymentNature;
  readonly isIncomeTaxExempt: boolean;
}

export interface VenezuelanStatutoryBaseMembership {
  readonly normalSalary: boolean;
  readonly integralSalary: boolean;
  readonly ivss: boolean;
  readonly rpe: boolean;
  readonly faov: boolean;
  readonly islr: boolean;
}

export function classifyVenezuelanEarning(input: VenezuelanEarningClassification): VenezuelanStatutoryBaseMembership {
  const salary = input.salaryNature === "salary";
  const normal = salary && input.regularity === "regular" && input.paymentNature === "earned_payment";
  const integral = salary;
  return {
    normalSalary: normal,
    integralSalary: integral,
    ivss: normal,
    rpe: normal,
    faov: integral,
    islr: salary && input.paymentNature === "earned_payment" && !input.isIncomeTaxExempt,
  };
}
