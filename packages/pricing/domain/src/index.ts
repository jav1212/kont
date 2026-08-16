import type { CompanyId } from "@kontave/companies-domain";
import { compareDecimal,exactDecimal,type CurrencyCode,type ExactDecimal } from "@kontave/monetary-domain";
import type { ProductId } from "@kontave/products-domain";

export type SalePricingPolicy=
  |{readonly mode:"fixed";readonly amount:ExactDecimal;readonly currency:CurrencyCode}
  |{readonly mode:"markup";readonly percentage:ExactDecimal;readonly currency:CurrencyCode};
export interface ProductSalePricingState{readonly companyId:CompanyId;readonly productId:ProductId;readonly policy:SalePricingPolicy|null;readonly version:number;readonly updatedAt:string}
export type PricingFailureCode="PRICING_INVALID"|"PRICING_NOT_FOUND"|"PRICING_PRODUCT_NOT_FOUND"|"PRICING_VERSION_CONFLICT"|"PRICING_ACCESS_DENIED"|"PRICING_REPOSITORY_UNAVAILABLE";
export class PricingFailure extends Error{constructor(readonly code:PricingFailureCode,message:string,options?:ErrorOptions){super(message,options);this.name="PricingFailure";}}
export class ProductSalePricing{
  readonly companyId:CompanyId;readonly productId:ProductId;readonly policy:SalePricingPolicy|null;readonly version:number;readonly updatedAt:string;
  constructor(state:ProductSalePricingState){if(!Number.isSafeInteger(state.version)||state.version<1)throw new PricingFailure("PRICING_INVALID","Pricing version is invalid.");this.companyId=state.companyId;this.productId=state.productId;this.policy=state.policy===null?null:validatePolicy(state.policy);this.version=state.version;this.updatedAt=state.updatedAt;}
}
export function fixedSalePricing(amount:string,currency:CurrencyCode):SalePricingPolicy{const value=exactDecimal(amount);if(compareDecimal(value,exactDecimal("0"))<=0)throw new PricingFailure("PRICING_INVALID","Fixed sale price must be greater than zero.");return{mode:"fixed",amount:value,currency};}
export function markupSalePricing(percentage:string,currency:CurrencyCode):SalePricingPolicy{const value=exactDecimal(percentage);if(compareDecimal(value,exactDecimal("0"))<0)throw new PricingFailure("PRICING_INVALID","Markup percentage cannot be negative.");return{mode:"markup",percentage:value,currency};}
function validatePolicy(policy:SalePricingPolicy):SalePricingPolicy{return policy.mode==="fixed"?fixedSalePricing(policy.amount,policy.currency):markupSalePricing(policy.percentage,policy.currency);}
