import type {
  OrganizationDto,
  AccessibleOrganizationDto,
  OrganizationCompanyDto,
  CompanyDto,
  AvailableOrganizationModuleDto,
  OrganizationMemberDto,
  RoleDto,
  OperationalDefaultsDto,
  ExchangeRateSetDto,
  InventoryDashboardDto,
  InventoryFlowPageDto,
  InventoryOperationDetailDto,
  PurchasingDashboardDto,
  SalesDashboardDto,
  PortalMonitoringDto,
  BillingOverviewDto,
  BillingPlanDto,
  ManualPaymentRequestDto,
  AuthenticatedDeviceSessionDto,
  CurrentUserDto,
  UserPreferencesDto,
} from "@kontave/client-contracts";

export const organizationFixture = {
  id: "id-sample",
  name: "name-sample",
  slug: "slug-sample",
  role: "owner",
  permissions: ["permissions-sample"],
  logoUrl: "logoUrl-sample",
  version: 1,
} satisfies OrganizationDto;

export const accessibleOrganizationFixture = {
  organizationId: "organizationId-sample",
  name: "name-sample",
  avatarUrl: "avatarUrl-sample",
  relationship: "personal",
  permissions: ["sales.read", "sales.read.dashboard"],
  accessPath: {
    kind: "kind-sample",
    actorUserId: "actorUserId-sample",
    actingOrganizationId: "actingOrganizationId-sample",
    targetOrganizationId: "targetOrganizationId-sample",
    delegationId: "delegationId-sample",
    scopes: ["scopes-sample"],
  },
} satisfies AccessibleOrganizationDto;

export const companyFixture = {
  operatingProfile: "standard",
  id: "id-sample",
  organizationId: "organizationId-sample",
  name: "name-sample",
  rif: "rif-sample",
  logoUrl: "logoUrl-sample",
} satisfies OrganizationCompanyDto;

export const operationalCompanyFixture = {
  operatingProfile: "standard",
  id: "id-sample",
  organizationId: "organizationId-sample",
  legacyCompanyId: "legacyCompanyId-sample",
  legalName: "legalName-sample",
  tradeName: "tradeName-sample",
  taxId: "taxId-sample",
  country: "country-sample",
  status: "status-sample",
} satisfies CompanyDto;

export const organizationModuleFixture = {
  id: "id-sample",
  code: "payroll",
  name: "name-sample",
} satisfies AvailableOrganizationModuleDto;

export const memberFixture = {
  id: "id-sample",
  kind: "membership",
  organizationId: "organizationId-sample",
  userId: "userId-sample",
  email: "email-sample",
  displayName: "displayName-sample",
  avatarUrl: "avatarUrl-sample",
  roleId: "roleId-sample",
  roleName: "roleName-sample",
  status: "active",
  version: 1,
  joinedAt: "joinedAt-sample",
  invitedAt: "invitedAt-sample",
  expiresAt: "expiresAt-sample",
} satisfies OrganizationMemberDto;

export const roleFixture = {
  id: "id-sample",
  organizationId: "organizationId-sample",
  code: "code-sample",
  name: "name-sample",
  description: "description-sample",
  kind: "system",
  permissions: ["permissions-sample"],
  status: "active",
  version: 1,
} satisfies RoleDto;

export const operationalDefaultsFixture = {
  effectiveDate: "2026-08-17",
  presentationCurrency: "VES",
  exchangeRate: {
    status: "resolved",
    value: {
      baseCurrency: "VES",
      quoteCurrency: "VES",
      value: "900719925474099312345.0010",
      effectiveDate: "2026-08-17",
      capturedAt: "capturedAt-sample",
      source: {
        kind: "official",
        authority: "authority-sample",
        reference: "reference-sample",
      },
    },
  },
  version: 1,
  updatedAt: "2026-08-17",
} satisfies OperationalDefaultsDto;

export const exchangeRateSetFixture = {
  requestedDate: "2026-08-17",
  effectiveDate: "2026-08-17",
  resolution: "exact_date",
  observedAt: "observedAt-sample",
  rates: [
    {
      baseCurrency: "VES",
      quoteCurrency: "VES",
      value: "900719925474099312345.0010",
      effectiveDate: "2026-08-17",
      capturedAt: "capturedAt-sample",
      source: {
        kind: "official",
        authority: "authority-sample",
        reference: "reference-sample",
      },
    },
  ],
} satisfies ExchangeRateSetDto;

export const inventoryDashboardFixture = {
  period: {
    from: "2026-08-17",
    to: "2026-08-17",
    granularity: "day",
  },
  summary: {
    inboundValue: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    outboundValue: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    movementCount: 1,
    inventoryValue: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    quantities: [
      {
        unit: "unit-sample",
        inbound: "900719925474099312345.0010",
        outbound: "900719925474099312345.0010",
      },
    ],
    valuationDate: "2026-08-17",
  },
  charts: [
    {
      date: "2026-08-17",
      inboundValue: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      outboundValue: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      movementCount: 1,
      quantities: [
        {
          unit: "unit-sample",
          inbound: "900719925474099312345.0010",
          outbound: "900719925474099312345.0010",
        },
      ],
    },
  ],
  recentSales: [
    {
      id: "id-sample",
      recordType: "invoice",
      number: "number-sample",
      counterparty: "counterparty-sample",
      date: "2026-08-17",
      status: "status-sample",
      total: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      transactionCurrency: "VES",
      sourceTotal: "900719925474099312345.0010",
    },
  ],
  recentPurchases: [
    {
      id: "id-sample",
      recordType: "invoice",
      number: "number-sample",
      counterparty: "counterparty-sample",
      date: "2026-08-17",
      status: "status-sample",
      total: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      transactionCurrency: "VES",
      sourceTotal: "900719925474099312345.0010",
    },
  ],
  recentInboundMovements: [
    {
      id: "id-sample",
      productId: "productId-sample",
      productName: "productName-sample",
      productSku: "productSku-sample",
      effectiveDate: "2026-08-17",
      movementType: "movementType-sample",
      direction: "inbound",
      quantity: {
        value: "900719925474099312345.0010",
        unit: "each",
      },
      totalCost: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      reference: "reference-sample",
    },
  ],
  recentOutboundMovements: [
    {
      id: "id-sample",
      productId: "productId-sample",
      productName: "productName-sample",
      productSku: "productSku-sample",
      effectiveDate: "2026-08-17",
      movementType: "movementType-sample",
      direction: "inbound",
      quantity: {
        value: "900719925474099312345.0010",
        unit: "each",
      },
      totalCost: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      reference: "reference-sample",
    },
  ],
  generatedAt: "generatedAt-sample",
} satisfies InventoryDashboardDto;

export const inventoryFlowPageFixture = {
  items: [
    {
      id: "id-sample",
      operationId: "operationId-sample",
      effectiveDate: "2026-08-17",
      direction: "inbound",
      reason: "opening_balance",
      status: "draft",
      product: {
        id: "id-sample",
        sku: "sku-sample",
        name: "name-sample",
      },
      quantity: {
        value: "900719925474099312345.0010",
        unit: "each",
      },
      unitCost: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      totalCost: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      source: {
        kind: "purchasing",
        documentId: "documentId-sample",
      },
      reference: "reference-sample",
      notes: "notes-sample",
      postedAt: "postedAt-sample",
    },
  ],
  nextCursor: "nextCursor-sample",
  total: 1,
  summary: {
    movementCount: 1,
    totalValue: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    quantities: [
      {
        unit: "each",
        value: "900719925474099312345.0010",
      },
    ],
  },
} satisfies InventoryFlowPageDto;

export const inventoryOperationFixture = {
  id: "id-sample",
  companyId: "companyId-sample",
  reason: "opening_balance",
  effectiveDate: "2026-08-17",
  status: "draft",
  version: 1,
  source: {
    kind: "purchasing",
    documentId: "documentId-sample",
  },
  reference: "reference-sample",
  notes: "notes-sample",
  postedAt: "postedAt-sample",
  reversalOf: "reversalOf-sample",
  reversedBy: "reversedBy-sample",
  lines: [
    {
      id: "id-sample",
      productId: "productId-sample",
      productName: "productName-sample",
      productSku: "productSku-sample",
      direction: "inbound",
      quantity: {
        value: "900719925474099312345.0010",
        unit: "each",
      },
      unitCost: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      movementId: "movementId-sample",
    },
  ],
  capabilities: {
    canPost: true,
    canReverse: true,
    canEditMetadata: true,
  },
} satisfies InventoryOperationDetailDto;

export const purchasingDashboardFixture = {
  period: {
    from: "2026-08-17",
    to: "2026-08-17",
    granularity: "day",
  },
  summary: {
    confirmedPurchaseTotal: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    vatCreditTotal: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    vatWithheldTotal: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    confirmedDocumentCount: 1,
    draftDocumentCount: 1,
  },
  daily: [
    {
      date: "2026-08-17",
      confirmedPurchaseTotal: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      vatCreditTotal: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      confirmedDocumentCount: 1,
      draftDocumentCount: 1,
    },
  ],
  topSuppliers: [
    {
      supplier: {
        id: "id-sample",
        legalName: "legalName-sample",
        taxIdentifier: "taxIdentifier-sample",
      },
      confirmedPurchaseTotal: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      confirmedDocumentCount: 1,
    },
  ],
  recentDocuments: [
    {
      id: "id-sample",
      documentType: "invoice",
      invoiceNumber: "invoiceNumber-sample",
      controlNumber: "controlNumber-sample",
      supplier: {
        id: "id-sample",
        legalName: "legalName-sample",
        taxIdentifier: "taxIdentifier-sample",
      },
      fiscalDate: "2026-08-17",
      status: "draft",
      functionalAmounts: {
        subtotal: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
        vat: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
        vatWithheld: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
        total: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
      },
      transactionCurrency: "VES",
      transactionAmounts: {
        subtotal: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
        vat: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
        total: {
          amount: "900719925474099312345.0010",
          currency: "VES",
        },
      },
    },
  ],
  generatedAt: "generatedAt-sample",
} satisfies PurchasingDashboardDto;

export const salesDashboardFixture = {
  period: {
    from: "2026-08-17",
    to: "2026-08-17",
    granularity: "day",
  },
  summary: {
    confirmedInvoicedAmount: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    taxableBaseAmount: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    vatDebitAmount: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
    confirmedInvoiceCount: 1,
    draftInvoiceCount: 1,
    averageTicketAmount: {
      amount: "900719925474099312345.0010",
      currency: "VES",
    },
  },
  charts: [
    {
      date: "2026-08-17",
      confirmedInvoicedAmount: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      taxableBaseAmount: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      vatDebitAmount: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      confirmedInvoiceCount: 1,
    },
  ],
  recentConfirmedInvoices: [
    {
      id: "id-sample",
      sourceKind: "legacy_sales_invoice",
      documentType: "invoice",
      invoiceNumber: "invoiceNumber-sample",
      customerName: "customerName-sample",
      date: "2026-08-17",
      status: "confirmed",
      salesChannel: "administrative",
      subtotal: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      taxableBase: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      vatAmount: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      total: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      transactionCurrency: "VES",
      sourceSubtotal: "900719925474099312345.0010",
      sourceVatAmount: "900719925474099312345.0010",
      sourceTotal: "900719925474099312345.0010",
    },
  ],
  recentDraftInvoices: [
    {
      id: "id-sample",
      sourceKind: "legacy_sales_invoice",
      documentType: "invoice",
      invoiceNumber: "invoiceNumber-sample",
      customerName: "customerName-sample",
      date: "2026-08-17",
      status: "confirmed",
      salesChannel: "administrative",
      subtotal: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      taxableBase: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      vatAmount: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      total: {
        amount: "900719925474099312345.0010",
        currency: "VES",
      },
      transactionCurrency: "VES",
      sourceSubtotal: "900719925474099312345.0010",
      sourceVatAmount: "900719925474099312345.0010",
      sourceTotal: "900719925474099312345.0010",
    },
  ],
  generatedAt: "generatedAt-sample",
} satisfies SalesDashboardDto;

export const portalMonitoringFixture = {
  status: "operational",
  observedAt: "observedAt-sample",
  summary: {
    operational: 1,
    degraded: 1,
    down: 1,
    unknown: 1,
    total: 1,
  },
  portals: [
    {
      id: "id-sample",
      slug: "slug-sample",
      name: "name-sample",
      category: "fiscal",
      logoUrl: "logoUrl-sample",
      status: "operational",
      responseTimeMs: 1,
      checkedAt: "checkedAt-sample",
    },
  ],
} satisfies PortalMonitoringDto;

export const billingOverviewFixture = {
  account: {
    id: "id-sample",
    organizationId: "organizationId-sample",
    legalName: "legalName-sample",
    taxId: "taxId-sample",
    billingEmail: "billingEmail-sample",
    countryCode: "countryCode-sample",
    currency: "USD",
  },
  subscriptions: [
    {
      id: "id-sample",
      productCode: "productCode-sample",
      planId: "planId-sample",
      planName: "planName-sample",
      status: "status-sample",
      billingCycle: "billingCycle-sample",
      currentPeriodStart: "currentPeriodStart-sample",
      currentPeriodEnd: "currentPeriodEnd-sample",
    },
  ],
  entitlements: {
    maxCompanies: 1,
    maxMembers: 1,
    maxDevices: 1,
    enabledModules: ["enabledModules-sample"],
  },
  usage: {
    companies: {
      used: 1,
      maximum: 1,
      remaining: 1,
    },
    members: {
      used: 1,
      maximum: 1,
      remaining: 1,
    },
    devices: {
      used: 1,
      maximum: 1,
      remaining: 1,
    },
  },
} satisfies BillingOverviewDto;

export const billingPlanFixture = {
  commercialCode: "kiosk",
  includedModules: ["inventory", "purchases", "sales"],
  id: "id-sample",
  name: "name-sample",
  maxCompanies: 1,
  maxEmployeesPerCompany: 1,
  monthlyPrice: {
    minorAmount: "900719925474099312345.0010",
    currency: "USD",
  },
  quarterlyPrice: {
    minorAmount: "900719925474099312345.0010",
    currency: "USD",
  },
  annualPrice: {
    minorAmount: "900719925474099312345.0010",
    currency: "USD",
  },
  productCode: "productCode-sample",
  contactOnly: true,
} satisfies BillingPlanDto;

export const paymentRequestFixture = {
  id: "id-sample",
  planId: "planId-sample",
  billingCycle: "monthly",
  amount: {
    minorAmount: "900719925474099312345.0010",
    currency: "USD",
  },
  discount: {
    minorAmount: "900719925474099312345.0010",
    currency: "USD",
  },
  paymentMethod: "transfer",
  hasReceipt: true,
  status: "pending",
  notes: "notes-sample",
  submittedAt: "submittedAt-sample",
  reviewedAt: "reviewedAt-sample",
} satisfies ManualPaymentRequestDto;

export const sessionFixture = {
  id: "id-sample",
  client: "web",
  deviceName: "deviceName-sample",
  operatingSystem: "operatingSystem-sample",
  createdAt: "createdAt-sample",
  lastSeenAt: "lastSeenAt-sample",
  current: true,
} satisfies AuthenticatedDeviceSessionDto;

export const currentUserFixture = {
  userId: "userId-sample",
  email: "email-sample",
  displayName: "displayName-sample",
  avatarUrl: "avatarUrl-sample",
  version: 1,
} satisfies CurrentUserDto;

export const preferencesFixture = {
  appearance: {
    colorScheme: "light",
    density: "comfortable",
  },
  regional: {
    locale: "locale-sample",
    timeZone: "timeZone-sample",
  },
  version: 1,
  updatedAt: "2026-08-17",
} satisfies UserPreferencesDto;
