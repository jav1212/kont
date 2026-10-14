import assert from "node:assert/strict";
import test from "node:test";
import { TaxReportingFailure } from "../../src/domain";
import { createSupabaseVatRetentionExportActions } from "../../src/adapters/supabase";

test("VAT retention export validates period and forwards tenant scope to Supabase", async () => {
  let rpcName = "";
  let rpcArgs: Record<string, unknown> | undefined;
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcName = name;
      rpcArgs = args;
      return {
        data: {
          agente_rif: "J-12345678-9", periodo_yyyymm: "202609",
          rows: [{ fecha: "2026-09-10", tipo_operacion: "C", tipo_documento: "03", proveedor_rif: "J-98765432-1", proveedor_nombre: "Proveedor", numero_factura: "NC-1", numero_control: "", base_imponible: "-100.00", alicuota: "16", iva_monto: "-16", iva_retenido: "-12", monto_total_linea: "-116", monto_exento: "0", comprobante: "RET-1", documento_afectado: "F-1", expediente: "0" }],
        },
        error: null,
      };
    },
  };
  const actions = createSupabaseVatRetentionExportActions(client as never);
  const result = await actions.getVatRetentionExport.execute({ tenantId: "tenant-1", companyId: "company-1", period: "2026-09" });
  assert.equal(rpcName, "shared_inventory_iva_retention_period");
  assert.deepEqual(rpcArgs, { p_tenant_id: "tenant-1", p_company_id: "company-1", p_period: "2026-09" });
  assert.equal(result.rows[0]?.documentType, "03");
  assert.equal(result.rows[0]?.vatWithheld, -12);
  assert.equal(result.rows[0]?.affectedDocument, "F-1");
  await assert.rejects(() => actions.getVatRetentionExport.execute({ tenantId: "tenant-1", companyId: "company-1", period: "2026-13" }), TaxReportingFailure);
});

test("VAT retention export rejects inconsistent envelopes and non-finite amounts", async () => {
  const wrongPeriodClient = { async rpc() { return { data: { agente_rif: "J-1", periodo_yyyymm: "202608", rows: [] }, error: null }; } };
  await assert.rejects(() => createSupabaseVatRetentionExportActions(wrongPeriodClient as never).getVatRetentionExport.execute({ tenantId: "tenant-1", companyId: "company-1", period: "2026-09" }), TaxReportingFailure);
  const nonFiniteClient = { async rpc() { return { data: { agente_rif: "J-1", periodo_yyyymm: "202609", rows: [{ fecha: "2026-09-01", alicuota: "NaN" }] }, error: null }; } };
  await assert.rejects(() => createSupabaseVatRetentionExportActions(nonFiniteClient as never).getVatRetentionExport.execute({ tenantId: "tenant-1", companyId: "company-1", period: "2026-09" }), TaxReportingFailure);
  const missingAmountClient = { async rpc() { return { data: { agente_rif: "J-1", periodo_yyyymm: "202609", rows: [{ fecha: "2026-09-01", alicuota: "16" }] }, error: null }; } };
  await assert.rejects(() => createSupabaseVatRetentionExportActions(missingAmountClient as never).getVatRetentionExport.execute({ tenantId: "tenant-1", companyId: "company-1", period: "2026-09" }), TaxReportingFailure);
});
