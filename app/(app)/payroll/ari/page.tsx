"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { Receipt, Download, Save, Calendar, Info, AlertTriangle } from "lucide-react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { useAri, computeAri } from "@/src/modules/payroll/frontend/hooks/use-ari";
import type { AriDeclaration } from "@/src/modules/payroll/frontend/hooks/use-ari";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { notify } from "@/src/shared/frontend/notify";
import { generateAriPdf } from "@/src/modules/payroll/frontend/utils/ari-pdf";

import {
    formatCurrency,
    formatNumber,
    makeDocumentId,
    LABEL_CLS,
    SectionHeader,
    CalculatorPanelHeader,
    OnlyActiveToggle,
    EmployeeSelect,
    EmployeeInfoCard,
    FooterStat,
    ConstanciaShell,
    CalcRow,
    CalculatorLoading,
    CalculatorEmptyState,
    formatDateUpper,
} from "@/src/modules/payroll/frontend/components/calculator";

const DEFAULT_UT = "43"; // Valor U.T. vigente (Gaceta Oficial 43.140, 02/06/2025)
const QUARTER_OPTIONS = [
    { value: 1, label: "T1 · Ene-Mar" },
    { value: 2, label: "T2 · Abr-Jun" },
    { value: 3, label: "T3 · Jul-Sep" },
    { value: 4, label: "T4 · Oct-Dic" },
] as const;

function toNum(s: string): number {
    const v = parseFloat((s || "0").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
}

function toInt(s: string): number {
    return Math.max(0, parseInt(s || "0", 10) || 0);
}

const formatUT = (n: number): string => `${formatNumber(n)} U.T.`;

function getZeroReasonMessageLegacy(result: ReturnType<typeof computeAri>): string | null {
    switch (result.motivoPorcentajeCero) {
        case "no_sujeto_umbral":
            return "RemuneraciÃ³n trimestral <= 250 U.T. â€” el trabajador no estÃ¡ sujeto a retenciÃ³n en este trimestre.";
        case "sin_enriquecimiento_gravable":
            return "Los desgravÃ¡menes consumen la base gravable y el enriquecimiento neto queda en 0 U.T. o menos.";
        case "rebajas_agotan_impuesto":
            return "Las rebajas del trimestre agotan el impuesto determinado, por lo que no corresponde retenciÃ³n.";
        default:
            return null;
    }
}

function getZeroReasonMessage(result: ReturnType<typeof computeAri>): string | null {
    switch (result.motivoPorcentajeCero) {
        case "no_sujeto_umbral":
            return "Remuneracion trimestral <= 250 U.T. - el trabajador no esta sujeto a retencion en este trimestre.";
        case "sin_enriquecimiento_gravable":
            return "Los desgravamenes consumen la base gravable y el enriquecimiento neto queda en 0 U.T. o menos.";
        case "rebajas_agotan_impuesto":
            return "Las rebajas del trimestre agotan el impuesto determinado, por lo que no corresponde retencion.";
        default:
            return null;
    }
}

export default function AriPage() {
    const { companyId, company } = useCompany();
    const { employees, loading } = useEmployee(companyId);
    const { declarations, save, loading: ariLoading } = useAri(companyId);

    const [selectedCedula, setSelectedCedula] = useState("");
    const [soloActivos, setSoloActivos] = useState(true);
    const [anio, setAnio] = useState<number>(() => Number(getTodayIsoDate().slice(0, 4)));
    const [trimestre, setTrimestre] = useState<1 | 2 | 3 | 4>(1);

    const [valorUT, setValorUT] = useState(DEFAULT_UT);
    const [remuneracion, setRemuneracion] = useState("");
    const [usarUnico, setUsarUnico] = useState(true);
    const [desgEducacion, setDesgEducacion] = useState("");
    const [desgSeguros, setDesgSeguros] = useState("");
    const [desgMedicos, setDesgMedicos] = useState("");
    const [desgIntereses, setDesgIntereses] = useState("");
    const [cargas, setCargas] = useState("0");
    const [impuestos, setImpuestos] = useState("");

    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);

    const selectedEmp = useMemo(
        () => employees.find((e) => e.cedula === selectedCedula),
        [employees, selectedCedula],
    );

    const existing = useMemo(
        () => declarations.find((d) =>
            d.employeeCedula === selectedCedula
            && d.anioGravable === anio
            && d.trimestreGravable === trimestre),
        [declarations, selectedCedula, anio, trimestre],
    );

    const [loadKey, setLoadKey] = useState("");
    const currentKey = `${selectedCedula}|${anio}|${trimestre}|${declarations.length}`;
    if (loadKey !== currentKey) {
        setLoadKey(currentKey);
        if (existing) {
            setValorUT(String(existing.valorUT));
            setRemuneracion(String(existing.remuneracionTrimestral));
            setUsarUnico(existing.usarDesgravamenUnico);
            setDesgEducacion(existing.desgEducacion ? String(existing.desgEducacion) : "");
            setDesgSeguros(existing.desgSeguros ? String(existing.desgSeguros) : "");
            setDesgMedicos(existing.desgMedicos ? String(existing.desgMedicos) : "");
            setDesgIntereses(existing.desgIntereses ? String(existing.desgIntereses) : "");
            setCargas(String(existing.cargasFamiliares));
            setImpuestos(existing.impuestosRetenidosDeMas ? String(existing.impuestosRetenidosDeMas) : "");
        } else if (selectedCedula) {
            setRemuneracion("");
            setUsarUnico(true);
            setDesgEducacion("");
            setDesgSeguros("");
            setDesgMedicos("");
            setDesgIntereses("");
            setCargas("0");
            setImpuestos("");
        }
    }

    const input = useMemo(() => ({
        anioGravable: anio,
        trimestreGravable: trimestre,
        valorUT: toNum(valorUT),
        remuneracionTrimestral: toNum(remuneracion),
        usarDesgravamenUnico: usarUnico,
        desgEducacion: usarUnico ? 0 : toNum(desgEducacion),
        desgSeguros: usarUnico ? 0 : toNum(desgSeguros),
        desgMedicos: usarUnico ? 0 : toNum(desgMedicos),
        desgIntereses: usarUnico ? 0 : toNum(desgIntereses),
        cargasFamiliares: toInt(cargas),
        impuestosRetenidosDeMas: toNum(impuestos),
    }), [anio, trimestre, valorUT, remuneracion, usarUnico, desgEducacion, desgSeguros, desgMedicos, desgIntereses, cargas, impuestos]);

    const result = useMemo(() => computeAri(input), [input]);
    const deduccionUT = result.desgravamenesUT > 0 ? result.desgravamenesUT : result.desgravamenUnicoUT;
    const zeroReasonMessage = getZeroReasonMessage(result) ?? getZeroReasonMessageLegacy(result);

    const handleSave = async () => {
        if (!selectedEmp) { notify.error("Selecciona un empleado"); return; }
        if (input.valorUT <= 0) { notify.error("El valor de la U.T. debe ser mayor a 0"); return; }
        if (input.remuneracionTrimestral <= 0) {
            notify.error("La remuneración trimestral estimada debe ser mayor a 0");
            return;
        }

        setSaving(true);
        const payload: Omit<AriDeclaration, "companyId"> = {
            id: existing?.id,
            employeeId: selectedEmp.cedula,
            employeeCedula: selectedEmp.cedula,
            porcentajeRetencion: result.porcentaje,
            ...input,
        };
        const ok = await save(payload);
        setSaving(false);
        if (ok) notify.success(`Declaración AR-I guardada · retención ${formatNumber(result.porcentaje)} %`);
    };

    const handlePdf = async () => {
        if (!selectedEmp || !company) return;
        try {
            setExporting(true);
            await generateAriPdf({
                companyName: company.name,
                companyId: company.rif,
                employee: { nombre: selectedEmp.nombre, cedula: selectedEmp.cedula, cargo: selectedEmp.cargo },
                anioGravable: anio,
                trimestreGravable: trimestre,
                valorUT: input.valorUT,
                remuneracionTrimestral: input.remuneracionTrimestral,
                usarDesgravamenUnico: usarUnico,
                totalDesgravamenesBs: result.totalDesgravamenesBs,
                cargasFamiliares: input.cargasFamiliares,
                impuestosRetenidosDeMas: input.impuestosRetenidosDeMas,
                remuneracionUT: result.remuneracionUT,
                desgravamenesUT: result.desgravamenesUT,
                desgravamenUnicoUT: result.desgravamenUnicoUT,
                enriquecimientoNetoUT: result.enriquecimientoNetoUT,
                alicuota: result.alicuota,
                impuestoUT: result.impuestoUT,
                rebajasUT: result.rebajasUT,
                impuestoARetenerUT: result.impuestoARetenerUT,
                porcentaje: result.porcentaje,
                sujetoARetencion: result.sujetoARetencion,
                motivoPorcentajeCero: result.motivoPorcentajeCero,
                logoUrl: company.logoUrl,
                showLogoInPdf: company.showLogoInPdf,
            });
        } catch (err) {
            console.error(err);
            notify.error("Error al generar el PDF: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setExporting(false);
        }
    };

    const empName = (cedula: string) => employees.find((e) => e.cedula === cedula)?.nombre ?? cedula;

    return (
        <div className="min-h-full bg-surface-2 flex flex-col overflow-hidden">
            <PageHeader
                title="AR-I · Retención ISLR"
                subtitle="Determinación trimestral del porcentaje de retención sobre sueldos y salarios"
                beta
            />

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                <aside className="w-full lg:w-96 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border-light bg-surface-1 overflow-y-auto">
                    <CalculatorPanelHeader title="Formulario AR-I" icon={Receipt} />

                    <div className="flex-1 divide-y divide-border-light">
                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Trabajador" />
                            {!loading && employees.length > 0 && (
                                <EmployeeSelect
                                    employees={employees}
                                    selectedCedula={selectedCedula}
                                    onChange={setSelectedCedula}
                                    onlyActive={soloActivos}
                                    placeholder="Selecciona un empleado"
                                />
                            )}
                            {selectedEmp && <EmployeeInfoCard employee={selectedEmp} />}
                            <OnlyActiveToggle checked={soloActivos} onChange={setSoloActivos} />
                        </div>

                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Parámetros" />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field
                                    label="Año gravable"
                                    type="number"
                                    step={1}
                                    min={2000}
                                    value={String(anio)}
                                    onValueChange={(v) => setAnio(toInt(v) || anio)}
                                    startContent={<Calendar size={14} className="text-[var(--text-tertiary)]" />}
                                />
                                <label className="block">
                                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                        Trimestre
                                    </span>
                                    <select
                                        value={String(trimestre)}
                                        onChange={(e) => setTrimestre(Number(e.target.value) as 1 | 2 | 3 | 4)}
                                        className="mt-1.5 w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none font-mono text-[13px] text-foreground hover:border-border-medium focus:border-primary-500 transition-colors appearance-none cursor-pointer"
                                    >
                                        {QUARTER_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <BaseInput.Field
                                label="Valor U.T. (Bs.)"
                                type="number"
                                step={0.01}
                                min={0}
                                value={valorUT}
                                onValueChange={setValorUT}
                                prefix="Bs."
                                inputClassName="text-right"
                            />
                            <BaseInput.Field
                                label="Remuneración trimestral estimada (casilla A)"
                                type="number"
                                step={0.01}
                                min={0}
                                value={remuneracion}
                                onValueChange={setRemuneracion}
                                placeholder="0.00"
                                prefix="Bs."
                                inputClassName="text-right"
                            />
                        </div>

                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Desgravámenes" />
                            <OnlyActiveToggle
                                label="Desgravamen único (193,5 U.T.)"
                                checked={usarUnico}
                                onChange={setUsarUnico}
                            />
                            {!usarUnico && (
                                <div className="space-y-3">
                                    <BaseInput.Field label="Educación" type="number" step={0.01} min={0}
                                        value={desgEducacion} onValueChange={setDesgEducacion} prefix="Bs." inputClassName="text-right" />
                                    <BaseInput.Field label="Primas HCM" type="number" step={0.01} min={0}
                                        value={desgSeguros} onValueChange={setDesgSeguros} prefix="Bs." inputClassName="text-right" />
                                    <BaseInput.Field label="Servicios médicos" type="number" step={0.01} min={0}
                                        value={desgMedicos} onValueChange={setDesgMedicos} prefix="Bs." inputClassName="text-right" />
                                    <BaseInput.Field label="Intereses vivienda / alquiler" type="number" step={0.01} min={0}
                                        value={desgIntereses} onValueChange={setDesgIntereses} prefix="Bs." inputClassName="text-right" />
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-4 space-y-4">
                            <SectionHeader label="Rebajas" />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field label="Cargas familiares" type="number" step={1} min={0}
                                    value={cargas} onValueChange={setCargas} inputClassName="text-right" />
                                <BaseInput.Field label="Retenido de más (años ant.)" type="number" step={0.01} min={0}
                                    value={impuestos} onValueChange={setImpuestos} prefix="Bs." inputClassName="text-right" />
                            </div>
                            <p className={LABEL_CLS + " !normal-case !tracking-normal text-[var(--text-tertiary)]"}>
                                Rebaja personal fija: 2,5 U.T. + 2,5 U.T. por cada carga.
                            </p>
                        </div>
                    </div>

                    <div className="p-5 border-t border-border-light space-y-3 mt-auto bg-surface-2/[0.03]">
                        {selectedEmp && (
                            <div className="space-y-2 mb-1 bg-surface-2/40 rounded-xl p-4 border border-border-light/50">
                                <FooterStat label="Enriq. neto (F)" value={formatUT(result.enriquecimientoNetoUT)} />
                                <FooterStat label="Impuesto a retener (I)" value={formatUT(result.impuestoARetenerUT)} />
                                <div className="flex justify-between items-baseline pt-2 border-t border-border-light/30">
                                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">
                                        % Retención (J)
                                    </span>
                                    <span className="font-mono text-[18px] font-black text-primary-500 tabular-nums">
                                        {formatNumber(result.porcentaje)} %
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <BaseButton.Root
                                variant="secondary"
                                onClick={handlePdf}
                                isDisabled={!selectedEmp || exporting}
                                loading={exporting}
                                leftIcon={!exporting ? <Download size={14} /> : undefined}
                            >
                                PDF
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="primary"
                                onClick={handleSave}
                                isDisabled={!selectedEmp || saving}
                                loading={saving}
                                leftIcon={!saving ? <Save size={14} /> : undefined}
                            >
                                {existing ? "Actualizar" : "Guardar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-6 bg-surface-2">
                    {loading || ariLoading ? (
                        <CalculatorLoading label="Cargando empleados…" />
                    ) : !selectedEmp ? (
                        <CalculatorEmptyState
                            icon={Receipt}
                            title="Forma AR-I"
                            description="Selecciona un empleado y captura su remuneración trimestral estimada para determinar el porcentaje de retención de ISLR."
                        />
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-6">
                            <ConstanciaShell
                                companyName={company?.name ?? "La Empresa"}
                                companyLogoUrl={company?.logoUrl}
                                showLogo={company?.showLogoInPdf}
                                title="Determinación del % de Retención (AR-I)"
                                legalNote="Forma AR-I · ISLR sobre sueldos y salarios (Decreto 1808)"
                                headerRight={
                                    <>
                                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Período Gravable</p>
                                        <p className="font-mono text-[13px] font-bold text-foreground bg-surface-2 px-2.5 py-1 rounded inline-block border border-border-light">
                                            {anio} · T{trimestre}
                                        </p>
                                        <p className="font-mono text-[9px] text-[var(--text-tertiary)] mt-2 uppercase tracking-[0.18em]">
                                            Emitido: {formatDateUpper(getTodayIsoDate())}
                                        </p>
                                    </>
                                }
                                employeeName={selectedEmp.nombre}
                                employeeCedula={selectedEmp.cedula}
                                employeeCargo={selectedEmp.cargo}
                                yearsOfService={0}
                                kpis={[
                                    { label: "Valor U.T.", value: formatCurrency(input.valorUT) },
                                    { label: "Remuneración trimestral", value: formatCurrency(input.remuneracionTrimestral) },
                                    { label: "Desgravamen", value: usarUnico ? "Único (193,5 U.T.)" : "Detallado" },
                                    { label: "Cargas familiares", value: String(input.cargasFamiliares) },
                                ]}
                                documentId={makeDocumentId(company?.name, selectedEmp.cedula, `${anio}-T${trimestre}`)}
                                footerNote="Determinación AR-I · Porcentaje inicial"
                            >
                                <SectionHeader label="Determinación (secciones A–J)" />
                                <div className="space-y-1">
                                    <CalcRow
                                        label="A/B · Remuneración estimada"
                                        formula={`${formatCurrency(input.remuneracionTrimestral)} ÷ ${formatCurrency(input.valorUT)}`}
                                        value={formatUT(result.remuneracionUT)}
                                    />
                                    <CalcRow
                                        label={usarUnico ? "E · Desgravamen único" : "C/D · Desgravámenes"}
                                        formula={usarUnico ? "Art. 60 Ley ISLR" : `${formatCurrency(result.totalDesgravamenesBs)} ÷ ${formatCurrency(input.valorUT)}`}
                                        value={`− ${formatUT(deduccionUT)}`}
                                        dim
                                    />
                                    <CalcRow
                                        label="F · Enriquecimiento neto gravable"
                                        value={formatUT(result.enriquecimientoNetoUT)}
                                    />
                                    <CalcRow
                                        label="G · Impuesto s/ Tarifa Nº 1"
                                        formula={`Alícuota ${formatNumber(result.alicuota * 100).replace(",00", "")} %`}
                                        value={formatUT(result.impuestoUT)}
                                    />
                                    <CalcRow
                                        label="H · Rebajas (personal + cargas)"
                                        formula="2,5 U.T. + 2,5 U.T./carga"
                                        value={`− ${formatUT(result.rebajasUT)}`}
                                        dim
                                    />
                                    <CalcRow
                                        label="I · Impuesto a retener en el trimestre"
                                        value={formatUT(result.impuestoARetenerUT)}
                                    />
                                </div>

                                <div className="mt-5 p-5 rounded-2xl bg-primary-500/[0.06] border border-primary-500/20 flex items-end justify-between gap-4">
                                    <div>
                                        <p className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-2">
                                            <Receipt size={11} className="text-primary-500" />
                                            J · Porcentaje de retención
                                        </p>
                                        <p className="text-[32px] font-black tabular-nums text-primary-500 leading-none tracking-tight font-mono">
                                            {formatNumber(result.porcentaje)} %
                                        </p>
                                    </div>
                                    <p className="font-mono text-[10px] text-[var(--text-tertiary)] text-right max-w-[45%] leading-relaxed">
                                        Se aplica sobre cada pago o abono en cuenta del trimestre gravable.
                                    </p>
                                </div>

                                {zeroReasonMessage && input.remuneracionTrimestral > 0 && (
                                    <div className="mt-4 flex items-center gap-3 bg-amber-500/5 border border-amber-500/30 rounded-lg px-4 py-3">
                                        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                                        <p className="font-mono text-[11px] text-amber-700">{zeroReasonMessage}</p>
                                        <p className="hidden">
                                            Remuneración trimestral &lt; 250 U.T. — el trabajador no está sujeto a retención.
                                        </p>
                                    </div>
                                )}
                            </ConstanciaShell>

                            {declarations.length > 0 && (
                                <div className="bg-surface-1 rounded-2xl border border-border-light overflow-hidden">
                                    <div className="px-5 py-3 border-b border-border-light flex items-center gap-2">
                                        <Info size={13} className="text-[var(--text-tertiary)]" />
                                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)] font-bold">
                                            Declaraciones guardadas
                                        </p>
                                    </div>
                                    <div className="divide-y divide-border-light/60">
                                        {declarations.map((d) => (
                                            <button
                                                key={d.id ?? `${d.employeeCedula}-${d.anioGravable}-${d.trimestreGravable}`}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedCedula(d.employeeCedula);
                                                    setAnio(d.anioGravable);
                                                    setTrimestre(d.trimestreGravable);
                                                }}
                                                className="w-full px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-2/60 transition-colors text-left"
                                            >
                                                <div className="min-w-0">
                                                    <span className="text-[13px] font-medium text-foreground truncate block">{empName(d.employeeCedula)}</span>
                                                    <span className="font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums">{d.employeeCedula} · {d.anioGravable} · T{d.trimestreGravable}</span>
                                                </div>
                                                <span className="font-mono text-[13px] font-bold tabular-nums text-primary-500 shrink-0">
                                                    {formatNumber(d.porcentajeRetencion)} %
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
