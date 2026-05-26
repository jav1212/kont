"use client";

import { useState, useCallback, useMemo } from "react";
import { FileDown, Users, Building2, UserCog, Briefcase, Settings2 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { CompanyContextPill } from "@/src/shared/frontend/components/company-context-pill";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect, type SelectItemData } from "@/src/shared/frontend/components/base-select";
import { BaseSwitch } from "@/src/shared/frontend/components/base-switch";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { generateConvenioPdf, type ConvenioData } from "@/src/modules/documents/frontend/utils/contract-convenio-pdf";
import { notify } from "@/src/shared/frontend/notify";

// ── constants ────────────────────────────────────────────────────────────────

const NATIONALITY_ITEMS: SelectItemData[] = [
    { id: "venezolano(a)", name: "Venezolano(a)" },
    { id: "extranjero(a)", name: "Extranjero(a)" },
];

function firstOfMonth(): string {
    const today = getTodayIsoDate();
    return today.slice(0, 8) + "01";
}

// ── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({
    icon,
    title,
    description,
    children,
    trailing,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
    trailing?: React.ReactNode;
}) {
    return (
        <section className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
            <header className="px-5 pt-4 pb-3.5 border-b border-border-light flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 flex-shrink-0">
                    {icon}
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground leading-none">
                        {title}
                    </h2>
                    <p className="mt-1.5 text-[12px] font-sans text-[var(--text-tertiary)] leading-snug">
                        {description}
                    </p>
                </div>
                {trailing}
            </header>
            <div className="px-5 py-4 space-y-3.5">
                {children}
            </div>
        </section>
    );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
    const { company, companyId } = useCompany();
    const { employees, loading: loadingEmps } = useEmployee(companyId);

    const [batchMode, setBatchMode] = useState(false);

    const [companyCity, setCompanyCity]         = useState("");
    const [companyRegistro, setCompanyRegistro] = useState("");
    const [registroNro, setRegistroNro]         = useState("");
    const [registroTomo, setRegistroTomo]       = useState("");
    const [registroFecha, setRegistroFecha]     = useState("");
    const [companyAddress, setCompanyAddress]   = useState("");

    const [repName, setRepName]           = useState("");
    const [repCedula, setRepCedula]       = useState("");
    const [repCargo, setRepCargo]         = useState("Director");
    const [repNationality, setRepNationality] = useState<Set<string | number>>(new Set(["venezolano(a)"]));

    const [selectedEmpKeys, setSelectedEmpKeys] = useState<Set<string | number>>(new Set());
    const [empNationality, setEmpNationality]   = useState<Set<string | number>>(new Set(["venezolano(a)"]));

    const [beneficioNombre, setBeneficioNombre] = useState("Beneficio socio económico complementario");
    const [montoUsd, setMontoUsd]               = useState("");
    const [fechaInicio, setFechaInicio]         = useState(firstOfMonth);
    const [ciudadFirma, setCiudadFirma]         = useState("");
    const [fechaDocumento, setFechaDocumento]   = useState(getTodayIsoDate);

    const [showLogo, setShowLogo]               = useState(true);
    const [lawyerName, setLawyerName]           = useState("");
    const [lawyerInpre, setLawyerInpre]         = useState("");

    const [generating, setGenerating] = useState(false);
    const [errors, setErrors] = useState<Record<string, boolean>>({});

    const employeeItems: SelectItemData[] = useMemo(
        () => employees
            .filter((e) => e.estado === "activo")
            .map((e) => ({ id: e.cedula, name: e.nombre, subtitle: e.cedula })),
        [employees],
    );

    const validate = useCallback((): boolean => {
        const errs: Record<string, boolean> = {};
        if (!repName.trim()) errs.repName = true;
        if (!repCedula.trim()) errs.repCedula = true;
        if (selectedEmpKeys.size === 0) errs.employee = true;
        if (!montoUsd || parseFloat(montoUsd) <= 0) errs.montoUsd = true;
        if (!fechaInicio) errs.fechaInicio = true;
        if (!fechaDocumento) errs.fechaDocumento = true;
        if (!ciudadFirma.trim() && !companyCity.trim()) errs.ciudadFirma = true;
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [repName, repCedula, selectedEmpKeys, montoUsd, fechaInicio, fechaDocumento, ciudadFirma, companyCity]);

    const handleGenerate = useCallback(async () => {
        if (!validate()) {
            notify.error("Completa los campos requeridos");
            return;
        }

        setGenerating(true);
        try {
            const repNat = [...repNationality][0] as string ?? "venezolano(a)";
            const empNat = [...empNationality][0] as string ?? "venezolano(a)";
            const city = ciudadFirma.trim() || companyCity.trim();

            const selectedEmps = employees.filter((e) => selectedEmpKeys.has(e.cedula));

            const dataList: ConvenioData[] = selectedEmps.map((emp) => ({
                companyName:    company?.name ?? "",
                companyRif:     company?.id ?? "",
                companyCity:    city,
                companyRegistro: companyRegistro.trim(),
                registroNro:    registroNro.trim() || undefined,
                registroTomo:   registroTomo.trim() || undefined,
                registroFecha:  registroFecha || undefined,
                companyAddress: companyAddress.trim() || company?.address || "",
                logoUrl:        company?.logoUrl,
                showLogo,

                repName:        repName.trim(),
                repCedula:      repCedula.trim(),
                repCargo:       repCargo.trim(),
                repNationality: repNat,

                empName:        emp.nombre,
                empCedula:      emp.cedula,
                empNationality: empNat,

                beneficioNombre: beneficioNombre.trim() || undefined,
                montoUsd:       parseFloat(montoUsd),
                fechaInicio,
                ciudadFirma:    city,
                fechaDocumento,

                lawyerName:          lawyerName.trim() || undefined,
                lawyerInpreabogado:  lawyerInpre.trim() || undefined,
            }));

            await generateConvenioPdf(dataList);
            notify.success("PDF generado correctamente");
        } catch (err) {
            console.error(err);
            notify.error("Error al generar el PDF");
        } finally {
            setGenerating(false);
        }
    }, [
        validate, repNationality, empNationality, ciudadFirma, companyCity, employees,
        selectedEmpKeys, company, companyRegistro, registroNro, registroTomo, registroFecha,
        companyAddress, showLogo, repName, repCedula, repCargo, beneficioNombre, montoUsd,
        fechaInicio, fechaDocumento, lawyerName, lawyerInpre,
    ]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Generar Convenio" subtitle={`${beneficioNombre || "Beneficio socio económico complementario"} — Art. 105 LOTTT`}>
                <CompanyContextPill />
                <BaseButton.Root
                    variant="primary"
                    leftIcon={<FileDown size={14} strokeWidth={2} />}
                    loading={generating}
                    onPress={handleGenerate}
                >
                    Generar PDF
                </BaseButton.Root>
            </PageHeader>

            <div className="px-4 sm:px-6 md:px-8 py-6">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

                    {/* ── LEFT COLUMN ─────────────────────────────────── */}
                    <div className="space-y-5">

                        <SectionCard
                            icon={<Building2 size={14} strokeWidth={2} />}
                            title="Datos de la Empresa"
                            description="Identificación mercantil que aparecerá en el encabezado del convenio."
                        >
                            <div className="grid grid-cols-2 gap-3.5">
                                <BaseInput.Field
                                    label="Empresa"
                                    value={company?.name ?? ""}
                                    isDisabled
                                />
                                <BaseInput.Field
                                    label="RIF"
                                    value={company?.id ?? ""}
                                    isDisabled
                                />
                            </div>

                            <BaseInput.Field
                                label="Domicilio (Ciudad)"
                                placeholder="Caracas"
                                value={companyCity}
                                onValueChange={setCompanyCity}
                            />

                            <BaseInput.Field
                                label="Registro Mercantil"
                                placeholder="Registro Mercantil Primero de la Circunscripción Judicial..."
                                value={companyRegistro}
                                onValueChange={setCompanyRegistro}
                            />

                            <div className="grid grid-cols-3 gap-3.5">
                                <BaseInput.Field
                                    label="Nro"
                                    placeholder="123"
                                    value={registroNro}
                                    onValueChange={setRegistroNro}
                                />
                                <BaseInput.Field
                                    label="Tomo"
                                    placeholder="45"
                                    value={registroTomo}
                                    onValueChange={setRegistroTomo}
                                />
                                <BaseInput.Field
                                    label="Fecha"
                                    type="date"
                                    value={registroFecha}
                                    onValueChange={setRegistroFecha}
                                />
                            </div>

                            <BaseInput.Field
                                label="Dirección"
                                placeholder={company?.address || "Av. Principal..."}
                                value={companyAddress}
                                onValueChange={setCompanyAddress}
                            />
                        </SectionCard>

                        <SectionCard
                            icon={<UserCog size={14} strokeWidth={2} />}
                            title="Representante Legal"
                            description="Persona que firma en nombre de la empresa."
                        >
                            <div className="grid grid-cols-2 gap-3.5">
                                <BaseInput.Field
                                    label="Nombre completo"
                                    placeholder="Nombre del representante"
                                    value={repName}
                                    onValueChange={setRepName}
                                    isRequired
                                    error={errors.repName ? "Requerido" : undefined}
                                />
                                <BaseInput.Field
                                    label="Cédula"
                                    placeholder="V-12345678"
                                    value={repCedula}
                                    onValueChange={setRepCedula}
                                    isRequired
                                    error={errors.repCedula ? "Requerido" : undefined}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3.5">
                                <BaseInput.Field
                                    label="Cargo"
                                    placeholder="Director"
                                    value={repCargo}
                                    onValueChange={setRepCargo}
                                />
                                <BaseSelect<SelectItemData>
                                    items={NATIONALITY_ITEMS}
                                    selectedKeys={repNationality}
                                    onSelectionChange={setRepNationality}
                                    label="Nacionalidad"
                                    selectionMode="single"
                                />
                            </div>
                        </SectionCard>
                    </div>

                    {/* ── RIGHT COLUMN ────────────────────────────────── */}
                    <div className="space-y-5">

                        <SectionCard
                            icon={<Users size={14} strokeWidth={2} />}
                            title="Trabajador"
                            description="Selecciona al empleado que recibirá el beneficio."
                            trailing={
                                <BaseSwitch.Field
                                    isSelected={batchMode}
                                    onValueChange={setBatchMode}
                                    label={batchMode ? "Múltiple" : "Individual"}
                                />
                            }
                        >
                            <BaseSelect<SelectItemData>
                                items={employeeItems}
                                selectedKeys={selectedEmpKeys}
                                onSelectionChange={setSelectedEmpKeys}
                                label={batchMode ? "Empleados" : "Empleado"}
                                placeholder={loadingEmps ? "Cargando..." : "Seleccionar empleado"}
                                selectionMode={batchMode ? "multiple" : "single"}
                                isDisabled={loadingEmps}
                            />
                            {errors.employee && selectedEmpKeys.size === 0 && (
                                <p className="text-[11px] font-mono text-error">Selecciona al menos un empleado</p>
                            )}

                            <BaseSelect<SelectItemData>
                                items={NATIONALITY_ITEMS}
                                selectedKeys={empNationality}
                                onSelectionChange={setEmpNationality}
                                label="Nacionalidad del trabajador"
                                selectionMode="single"
                            />

                            {batchMode && selectedEmpKeys.size > 0 && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500/5 border border-primary-500/15">
                                    <Users size={13} strokeWidth={2} className="text-primary-500 flex-shrink-0" />
                                    <span className="font-mono text-[11px] uppercase tracking-[0.10em] text-foreground">
                                        {selectedEmpKeys.size} empleado{selectedEmpKeys.size > 1 ? "s" : ""} seleccionado{selectedEmpKeys.size > 1 ? "s" : ""}
                                    </span>
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            icon={<Briefcase size={14} strokeWidth={2} />}
                            title="Términos del Convenio"
                            description="Condiciones económicas y fechas del acuerdo."
                        >
                            <BaseInput.Field
                                label="Tipo de beneficio"
                                placeholder="Beneficio socio económico complementario"
                                value={beneficioNombre}
                                onValueChange={setBeneficioNombre}
                                helperText="Ej: Beneficio social de alimentación, Bono de productividad"
                            />

                            <BaseInput.Field
                                label="Monto mensual"
                                placeholder="500,00"
                                prefix="USD"
                                value={montoUsd}
                                onValueChange={setMontoUsd}
                                type="number"
                                isRequired
                                error={errors.montoUsd ? "Requerido" : undefined}
                                inputClassName="text-right"
                            />

                            <div className="grid grid-cols-2 gap-3.5">
                                <BaseInput.Field
                                    label="Fecha de inicio"
                                    type="date"
                                    value={fechaInicio}
                                    onValueChange={setFechaInicio}
                                    isRequired
                                    error={errors.fechaInicio ? "Requerido" : undefined}
                                />
                                <BaseInput.Field
                                    label="Fecha del documento"
                                    type="date"
                                    value={fechaDocumento}
                                    onValueChange={setFechaDocumento}
                                    isRequired
                                    error={errors.fechaDocumento ? "Requerido" : undefined}
                                />
                            </div>

                            <BaseInput.Field
                                label="Ciudad de firma"
                                placeholder={companyCity || "Caracas"}
                                value={ciudadFirma}
                                onValueChange={setCiudadFirma}
                                helperText="Si se deja vacío se usa el domicilio"
                            />
                        </SectionCard>

                        <SectionCard
                            icon={<Settings2 size={14} strokeWidth={2} />}
                            title="Opciones"
                            description="Personalización del documento generado."
                        >
                            <BaseSwitch.Field
                                isSelected={showLogo}
                                onValueChange={setShowLogo}
                                label="Incluir logo"
                            />

                            <div className="grid grid-cols-2 gap-3.5">
                                <BaseInput.Field
                                    label="Nombre del abogado"
                                    placeholder="Opcional"
                                    value={lawyerName}
                                    onValueChange={setLawyerName}
                                />
                                <BaseInput.Field
                                    label="INPREABOGADO N°"
                                    placeholder="Opcional"
                                    value={lawyerInpre}
                                    onValueChange={setLawyerInpre}
                                />
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>
        </div>
    );
}
