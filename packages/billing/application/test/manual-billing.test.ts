import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationSource, PERMISSIONS, type PermissionCode } from "@kontave/access-control-domain";
import { BillingCycle, BillingFailure, Currency, ManualPaymentMethod, ManualPaymentStatus, money, type OrganizationEntitlements } from "@kontave/billing-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import { SubmitManualPaymentRequest, type BillingAuthorizationContext, type OrganizationBillingAuthorization, type OrganizationBillingRepository } from "../src/index.js";

const organization = organizationId("organization-1");
const actor = userId("user-1");
const context: BillingAuthorizationContext = { requestId: "request-1", source: AuthorizationSource.Desktop, occurredAt: "2026-08-15T00:00:00.000Z" };

class Authorization implements OrganizationBillingAuthorization {
  requested: PermissionCode[] = [];
  async require(input: { readonly permission: PermissionCode }) { this.requested.push(input.permission); }
}
class Repository implements OrganizationBillingRepository {
  submitted: Parameters<OrganizationBillingRepository["createManualPaymentRequest"]>[0] | null = null;
  async findAccount(){return null;} async listSubscriptions(){return [];} async getEntitlements():Promise<OrganizationEntitlements>{return{maxCompanies:null,maxMembers:null,maxDevices:null,enabledModules:[]};} async getUsage(){return{companies:{used:0,maximum:null,remaining:null},members:{used:0,maximum:null,remaining:null},devices:{used:0,maximum:null,remaining:null}};} async listInvoices(){return [];} async listPaymentMethods(){return [];} async listPlans(){return [];} async listManualPaymentRequests(){return [];}
  async createManualPaymentRequest(input: Parameters<OrganizationBillingRepository["createManualPaymentRequest"]>[0]) { this.submitted=input; return{id:"request-1",organizationId:organization,planId:input.planId,billingCycle:input.billingCycle,amount:money(BigInt(100),Currency.Usd),discount:money(BigInt(0),Currency.Usd),paymentMethod:input.paymentMethod,receiptStorageKey:input.receiptStorageKey,status:ManualPaymentStatus.Pending,notes:null,submittedAt:context.occurredAt,reviewedAt:null}; }
}

test("submits only intent fields and leaves price and credit calculation to persistence",async()=>{const repository=new Repository(),authorization=new Authorization();await new SubmitManualPaymentRequest(repository,authorization).execute(actor,organization,{planId:"plan-1",billingCycle:BillingCycle.Monthly,paymentMethod:ManualPaymentMethod.Transfer,receiptStorageKey:`${organization}/upload/receipt.pdf`},context);assert.equal(authorization.requested[0],PERMISSIONS.BILLING_MANAGE);assert.deepEqual(repository.submitted,{organizationId:organization,planId:"plan-1",billingCycle:BillingCycle.Monthly,paymentMethod:ManualPaymentMethod.Transfer,receiptStorageKey:`${organization}/upload/receipt.pdf`});});

test("rejects receipt keys belonging to another organization",async()=>{await assert.rejects(()=>new SubmitManualPaymentRequest(new Repository(),new Authorization()).execute(actor,organization,{planId:"plan-1",billingCycle:BillingCycle.Monthly,paymentMethod:ManualPaymentMethod.Cash,receiptStorageKey:"another-organization/receipt.pdf"},context),(cause:unknown)=>cause instanceof BillingFailure&&cause.code==="BILLING_RECEIPT_INVALID");});

test("credit is internal and cannot be selected by a native client",async()=>{await assert.rejects(()=>new SubmitManualPaymentRequest(new Repository(),new Authorization()).execute(actor,organization,{planId:"plan-1",billingCycle:BillingCycle.Monthly,paymentMethod:ManualPaymentMethod.Credit},context),(cause:unknown)=>cause instanceof BillingFailure&&cause.code==="BILLING_PAYMENT_REQUEST_INVALID");});
