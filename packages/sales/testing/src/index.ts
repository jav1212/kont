import { companyId } from "@kontave/companies-domain";
import { currency, moneyFromDecimal } from "@kontave/monetary-domain";
import { productId, UnitOfMeasure } from "@kontave/products-domain";
import {
  Customer, GoodsDispatch, SalesOrder, customerId, goodsDispatchId, goodsDispatchLineId, salesDate,
  salesOrderId, salesOrderLineId, salesQuantity,
} from "@kontave/sales-domain";

export const SALES_COMPANY_ID = companyId("sales-company-1");
export const SALES_CUSTOMER_ID = customerId("sales-customer-1");
export const SALES_PRODUCT_ID = productId("sales-product-1");
export const SALES_ORDER_ID = salesOrderId("sales-order-1");
export const SALES_ORDER_LINE_ID = salesOrderLineId("sales-order-line-1");
export const SALES_DISPATCH_ID = goodsDispatchId("sales-dispatch-1");
export const SALES_VES = currency("VES", 2);

export function customerFixture(): Customer {
  return new Customer({ id: SALES_CUSTOMER_ID, companyId: SALES_COMPANY_ID, legalName: "Customer C.A.", tradeName: null, taxIdentifier: "J-12345678-9", fiscalAddress: "Caracas", status: "active", version: 1 });
}
export function approvedSalesOrderFixture(): SalesOrder {
  return new SalesOrder({
    id: SALES_ORDER_ID, companyId: SALES_COMPANY_ID, customerId: SALES_CUSTOMER_ID, orderDate: salesDate("2026-08-14"), transactionCurrency: SALES_VES, paymentTerms: { kind: "immediate" }, status: "approved", version: 1,
    lines: [{ id: SALES_ORDER_LINE_ID, kind: "stock", productId: SALES_PRODUCT_ID, description: "Canonical sales item", orderedQuantity: salesQuantity("10", UnitOfMeasure.Each), unitPrice: moneyFromDecimal("5", SALES_VES), grossAmount: moneyFromDecimal("50", SALES_VES), adjustments: [], netAmount: moneyFromDecimal("50", SALES_VES) }],
  });
}
export function goodsDispatchFixture(quantity = "4"): GoodsDispatch {
  return new GoodsDispatch({
    id: SALES_DISPATCH_ID, companyId: SALES_COMPANY_ID, customerId: SALES_CUSTOMER_ID, orderId: SALES_ORDER_ID, dispatchDate: salesDate("2026-08-14"), status: "draft", confirmedAt: null, reversedAt: null, version: 0,
    lines: [{ id: goodsDispatchLineId("sales-dispatch-line-1"), orderLineId: SALES_ORDER_LINE_ID, productId: SALES_PRODUCT_ID, quantity: salesQuantity(quantity, UnitOfMeasure.Each), inventoryLocationReference: "main", lotReference: null }],
  });
}
