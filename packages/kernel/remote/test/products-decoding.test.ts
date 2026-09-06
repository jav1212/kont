import assert from "node:assert/strict";
import test from "node:test";
import type {
  ProductCategoryOverviewItemDto,
  ProductDetailDto,
  ProductDto,
  ProductUnitEconomicsDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../src/decoding";
import * as decode from "../src/domains/products/decoding";

const category: ProductCategoryOverviewItemDto = {
  id: "category",
  name: "Materiales",
  description: null,
  status: "active",
  version: 1,
  productCount: 3,
  createdAt: null,
  updatedAt: "2026-09-06",
};
const product: ProductDto = {
  id: "product",
  sku: "SKU",
  barcodes: ["001"],
  name: "Tornillo",
  description: null,
  category,
  baseUnit: "each",
  status: "active",
  version: 1,
  updatedAt: "2026-09-06",
  inventory: {
    onHand: { quantity: "20", unit: "each" },
    replenishment: {
      minimumQuantity: "2",
      state: "available",
      version: 1,
      updatedAt: "2026-09-06",
    },
    valuation: { unitCost: "1.2300", totalValue: "24.6000", currency: "VES" },
  },
};
const salePricing = {
  policy: { mode: "fixed", amount: "0.999999999999999999", currency: "USD" },
  version: 1,
  updatedAt: "2026-09-06",
} as const;
const taxation = {
  profileId: "tax",
  taxCode: "IVA",
  treatment: "taxed",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  resolvedRate: "16",
  legalBasis: "Policy",
  ruleVersion: "1",
  version: 1,
} as const;
const detail: ProductDetailDto = {
  ...product,
  salePricing,
  taxation,
  productType: "merchandise",
  valuationMethod: "weighted_average",
  vat: { code: "general", rate: "16" },
  capabilities: {
    inventoryEnabled: true,
    locationTracking: false,
    lotTracking: false,
    salePricing: true,
    vatConfiguration: true,
    valuationMethodChange: false,
  },
};
const aggregate = {
  weightedAverageUnitAmount: { amount: "1.23", currency: "VES" },
  quantity: { value: "20", unit: "each" },
  observations: 2,
} as const;
const economics: ProductUnitEconomicsDto = {
  period: { from: "2026-09-01", to: "2026-09-06", granularity: "day" },
  latestAcquisition: {
    effectiveDate: "2026-09-06",
    sourceUnitAmount: { amount: "1", currency: "USD" },
    unitAmount: { amount: "1.23", currency: "VES" },
    exchangeRate: "1.23",
    quantity: { value: "20", unit: "each" },
    reference: null,
    documentId: "receipt",
  },
  points: [
    {
      bucketStart: "2026-09-01",
      acquisition: aggregate,
      realizedSale: aggregate,
    },
  ],
  coverage: {
    confirmedAcquisitions: 2,
    confirmedSales: 1,
    legacyRecordedOutboundPrices: 0,
  },
  generatedAt: "2026-09-06",
};

const cases: readonly [string, Decoder<unknown>, object][] = [
  ["product", decode.product, product],
  ["detail", decode.productDetail, detail],
  [
    "category",
    decode.category,
    {
      id: category.id,
      name: category.name,
      description: category.description,
      status: category.status,
      version: category.version,
    },
  ],
  ["category details", decode.categoryOverviewItem, category],
  [
    "categories",
    decode.categoryOverview,
    {
      items: [category],
      nextCursor: null,
      total: 1,
      summary: {
        active: 1,
        inactive: 0,
        inUse: 1,
        unused: 0,
        unassignedProducts: 0,
      },
    },
  ],
  [
    "products",
    decode.productList,
    {
      items: [product],
      nextCursor: null,
      total: 1,
      summary: {
        active: 1,
        inactive: 0,
        lowStock: 0,
        outOfStock: 0,
        inventoryValue: { amount: "24.60", currency: "VES" },
      },
    },
  ],
  [
    "movements",
    decode.productMovementPage,
    {
      items: [
        {
          id: "movement",
          effectiveDate: "2026-09-06",
          type: "entrada_compra",
          quantity: { value: "20", unit: "each" },
          unitCost: { amount: "1.23", currency: "VES" },
          totalCost: { amount: "24.60", currency: "VES" },
          balanceQuantity: "20",
          reference: null,
          notes: null,
          createdAt: "2026-09-06",
        },
      ],
      nextCursor: null,
    },
  ],
  [
    "replenishment",
    decode.replenishmentPolicy,
    {
      productId: "product",
      unit: "each",
      minimumQuantity: null,
      version: 1,
      updatedAt: "2026-09-06",
    },
  ],
  ["fixed pricing", decode.salePricing, salePricing],
  [
    "markup pricing",
    decode.salePricing,
    {
      ...salePricing,
      policy: { mode: "markup", percentage: "20", currency: "VES" },
    },
  ],
  ["taxation", decode.taxation, taxation],
  ["economics", decode.unitEconomics, economics],
];

for (const [name, decoder, fixture] of cases) {
  test(`${name} response accepts additive fields without changing exact values`, () => {
    const extended = { ...fixture, futureServerField: { enabled: true } };
    assert.equal(decoder(extended), extended);
  });

  test(`${name} response rejects incompatible root types and missing required fields`, () => {
    for (const invalid of [null, undefined, [], 1, "value", true]) {
      assert.equal(decoder(invalid), null);
    }
    for (const key of Object.keys(fixture)) {
      const candidate = { ...fixture } as Record<string, unknown>;
      delete candidate[key];
      assert.equal(decoder(candidate), null, `Missing ${key}`);
    }
  });
}

test("product details reject malformed nested contracts and discriminants", () => {
  const mutations: readonly object[] = [
    { category: { ...category, status: "deleted" } },
    { barcodes: [7] },
    { baseUnit: "unknown" },
    {
      inventory: {
        ...product.inventory,
        valuation: { unitCost: 1.23, totalValue: "24.6", currency: "VES" },
      },
    },
    {
      inventory: {
        ...product.inventory,
        onHand: { quantity: "20", unit: null },
      },
    },
    {
      inventory: {
        ...product.inventory,
        replenishment: {
          minimumQuantity: "2",
          state: "unknown",
          version: 1,
          updatedAt: "2026-09-06",
        },
      },
    },
    {
      salePricing: {
        ...salePricing,
        policy: { mode: "markup", amount: "1", currency: "VES" },
      },
    },
    { taxation: { ...taxation, effectiveTo: 4 } },
    { taxation: { ...taxation, treatment: "unknown" } },
    { productType: "service" },
    { valuationMethod: "fifo" },
    { capabilities: { ...detail.capabilities, inventoryEnabled: "yes" } },
    { vat: { code: "general", rate: 16 } },
  ];
  for (const mutation of mutations)
    assert.equal(decode.productDetail({ ...detail, ...mutation }), null);
});

test("explicit null remains valid only in nullable product fields", () => {
  assert.ok(
    decode.productDetail({
      ...detail,
      description: null,
      category: null,
      inventory: null,
      salePricing: null,
      taxation: null,
      vat: null,
    }),
  );
  assert.ok(decode.salePricing({ ...salePricing, policy: null }));
  assert.ok(
    decode.unitEconomics({
      ...economics,
      latestAcquisition: null,
      points: [
        { bucketStart: "2026-09-01", acquisition: null, realizedSale: null },
      ],
    }),
  );
  assert.equal(decode.productDetail({ ...detail, capabilities: null }), null);
});

test("economics validates nested amounts, units, counts and nullable aggregates", () => {
  for (const mutation of [
    {
      latestAcquisition: {
        ...economics.latestAcquisition,
        unitAmount: { amount: "1.23", currency: "USD" },
      },
    },
    {
      points: [
        {
          bucketStart: "2026-09-01",
          acquisition: { ...aggregate, observations: "2" },
          realizedSale: null,
        },
      ],
    },
    { points: [{ bucketStart: "2026-09-01", acquisition: null }] },
    { period: { ...economics.period, granularity: "year" } },
    { coverage: { ...economics.coverage, confirmedAcquisitions: null } },
  ])
    assert.equal(decode.unitEconomics({ ...economics, ...mutation }), null);
});

test("exact amount strings are not coerced or constrained by transport validation", () => {
  const value = {
    ...salePricing,
    policy: {
      mode: "fixed",
      amount: "0.999999999999999999",
      currency: "new-currency",
    },
  };
  assert.equal(decode.salePricing(value), value);
  assert.equal(
    decode.salePricing({ ...value, policy: { ...value.policy, amount: 1 } }),
    null,
  );
});
