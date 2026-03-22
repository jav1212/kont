import type { Producto, TipoProducto, UnidadMedida, MetodoValuacion, IvaTipo } from "@/src/modules/inventory/backend/domain/producto";
import type { Departamento } from "@/src/modules/inventory/backend/domain/departamento";
import type { Proveedor } from "@/src/modules/inventory/backend/domain/proveedor";

// ── shared helpers ─────────────────────────────────────────────────────────────

function csvCell(value: string | number | boolean | null | undefined): string {
    const s = String(value ?? "");
    return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(content: string, filename: string) {
    const bom  = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function normalizeRaw(raw: string): string[] {
    return raw
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
}

function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
            result.push(current); current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function cleanCols(cols: string[]): string[] {
    return cols.map((c) => c.trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim());
}

function parseHeader(line: string): string[] {
    return splitCsvLine(line).map((h) =>
        h.toLowerCase().replace(/\s/g, "").replace(/^"|"$/g, "").replace(/""/g, "")
    );
}

// ── Departamentos ──────────────────────────────────────────────────────────────

const DEPT_HEADERS = ["nombre", "descripcion", "activo"] as const;

export function departamentosToCsv(departamentos: Departamento[]): string {
    const header = DEPT_HEADERS.map(csvCell).join(",");
    const rows   = departamentos.map((d) =>
        [csvCell(d.nombre), csvCell(d.descripcion ?? ""), csvCell(d.activo)].join(",")
    );
    return [header, ...rows].join("\r\n");
}

export interface DepartamentoCsvResult {
    departamentos: Omit<Departamento, "id" | "empresaId" | "createdAt">[];
    errors:        string[];
}

export function parseDepartamentosCsv(raw: string): DepartamentoCsvResult {
    const lines = normalizeRaw(raw);
    const errors: string[] = [];
    const departamentos: DepartamentoCsvResult["departamentos"] = [];

    if (lines.length < 2) return { departamentos: [], errors: ["El CSV está vacío o no tiene datos."] };

    const header = parseHeader(lines[0]).join(",");
    if (header !== DEPT_HEADERS.join(",")) {
        return { departamentos: [], errors: [`Encabezado inválido. Se esperaba: ${DEPT_HEADERS.join(",")}`] };
    }

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [nombre, descripcion, activoRaw] = clean;

        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const activo = activoRaw?.toLowerCase() !== "false";

        departamentos.push({ nombre: nombre.toUpperCase(), descripcion: descripcion ?? "", activo });
    }

    return { departamentos, errors };
}

// ── Proveedores ────────────────────────────────────────────────────────────────

const PROV_HEADERS = ["rif", "nombre", "contacto", "telefono", "email", "direccion", "notas", "activo"] as const;

export function proveedoresToCsv(proveedores: Proveedor[]): string {
    const header = PROV_HEADERS.map(csvCell).join(",");
    const rows   = proveedores.map((p) =>
        [
            csvCell(p.rif),
            csvCell(p.nombre),
            csvCell(p.contacto),
            csvCell(p.telefono),
            csvCell(p.email),
            csvCell(p.direccion),
            csvCell(p.notas),
            csvCell(p.activo),
        ].join(",")
    );
    return [header, ...rows].join("\r\n");
}

export interface ProveedorCsvResult {
    proveedores: Omit<Proveedor, "id" | "empresaId" | "createdAt" | "updatedAt">[];
    errors:      string[];
}

export function parseProveedoresCsv(raw: string): ProveedorCsvResult {
    const lines = normalizeRaw(raw);
    const errors: string[] = [];
    const proveedores: ProveedorCsvResult["proveedores"] = [];

    if (lines.length < 2) return { proveedores: [], errors: ["El CSV está vacío o no tiene datos."] };

    const header = parseHeader(lines[0]).join(",");
    if (header !== PROV_HEADERS.join(",")) {
        return { proveedores: [], errors: [`Encabezado inválido. Se esperaba: ${PROV_HEADERS.join(",")}`] };
    }

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [rif, nombre, contacto, telefono, email, direccion, notas, activoRaw] = clean;

        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const activo = activoRaw?.toLowerCase() !== "false";

        proveedores.push({
            rif:       rif ?? "",
            nombre,
            contacto:  contacto ?? "",
            telefono:  telefono ?? "",
            email:     email ?? "",
            direccion: direccion ?? "",
            notas:     notas ?? "",
            activo,
        });
    }

    return { proveedores, errors };
}

// ── Productos ──────────────────────────────────────────────────────────────────

const PROD_HEADERS = [
    "codigo", "nombre", "descripcion", "tipo", "unidad_medida",
    "metodo_valuacion",
    "iva_tipo", "activo", "departamento_nombre",
] as const;

const TIPOS_VALIDOS: TipoProducto[]      = ["mercancia", "materia_prima", "producto_terminado"];
const UNIDADES_VALIDAS: UnidadMedida[]   = ["unidad", "kg", "g", "m", "m2", "m3", "litro", "caja", "rollo", "paquete"];
const METODOS_VALIDOS: MetodoValuacion[] = ["promedio_ponderado", "peps"];
const IVA_VALIDOS: IvaTipo[]             = ["exento", "general"];

export function productosToCsv(productos: Producto[]): string {
    const header = PROD_HEADERS.map(csvCell).join(",");
    const rows   = productos.map((p) =>
        [
            csvCell(p.codigo),
            csvCell(p.nombre),
            csvCell(p.descripcion),
            csvCell(p.tipo),
            csvCell(p.unidadMedida),
            csvCell(p.metodoValuacion),
            csvCell(p.ivaTipo),
            csvCell(p.activo),
            csvCell(p.departamentoNombre ?? ""),
        ].join(",")
    );
    return [header, ...rows].join("\r\n");
}

export interface ProductoCsvRow {
    codigo:          string;
    nombre:          string;
    descripcion:     string;
    tipo:            TipoProducto;
    unidadMedida:    UnidadMedida;
    metodoValuacion: MetodoValuacion;
    ivaTipo:         IvaTipo;
    activo:          boolean;
    departamentoId?: string;
}

export interface ProductoCsvResult {
    productos: ProductoCsvRow[];
    errors:    string[];
}

export function parseProductosCsv(raw: string, departamentos: Departamento[]): ProductoCsvResult {
    const lines = normalizeRaw(raw);
    const errors: string[] = [];
    const productos: ProductoCsvRow[] = [];

    if (lines.length < 2) return { productos: [], errors: ["El CSV está vacío o no tiene datos."] };

    const header = parseHeader(lines[0]).join(",");
    if (header !== PROD_HEADERS.join(",")) {
        return { productos: [], errors: [`Encabezado inválido. Se esperaba: ${PROD_HEADERS.join(",")}`] };
    }

    const deptMap = new Map(departamentos.map((d) => [d.nombre.toUpperCase(), d.id]));

    for (let i = 1; i < lines.length; i++) {
        const clean = cleanCols(splitCsvLine(lines[i]));
        const [
            codigo, nombre, descripcion, tipoRaw, unidadRaw,
            metodoRaw,
            ivaRaw, activoRaw, deptNombre,
        ] = clean;

        if (!nombre) { errors.push(`Línea ${i + 1}: nombre vacío.`); continue; }

        const tipo = (tipoRaw ?? "").toLowerCase() as TipoProducto;
        if (!TIPOS_VALIDOS.includes(tipo)) {
            errors.push(`Línea ${i + 1}: tipo inválido "${tipoRaw}". Usa: ${TIPOS_VALIDOS.join(", ")}.`); continue;
        }

        const unidadMedida = (unidadRaw ?? "").toLowerCase() as UnidadMedida;
        if (!UNIDADES_VALIDAS.includes(unidadMedida)) {
            errors.push(`Línea ${i + 1}: unidad_medida inválida "${unidadRaw}". Usa: ${UNIDADES_VALIDAS.join(", ")}.`); continue;
        }

        const metodoValuacion = (metodoRaw ?? "").toLowerCase() as MetodoValuacion;
        if (!METODOS_VALIDOS.includes(metodoValuacion)) {
            errors.push(`Línea ${i + 1}: metodo_valuacion inválido "${metodoRaw}". Usa: ${METODOS_VALIDOS.join(", ")}.`); continue;
        }

        const ivaTipo = (ivaRaw ?? "general").toLowerCase() as IvaTipo;
        if (!IVA_VALIDOS.includes(ivaTipo)) {
            errors.push(`Línea ${i + 1}: iva_tipo inválido "${ivaRaw}". Usa: exento o general.`); continue;
        }

        const activo = activoRaw?.toLowerCase() !== "false";

        let departamentoId: string | undefined;
        if (deptNombre?.trim()) {
            const found = deptMap.get(deptNombre.trim().toUpperCase());
            if (!found) {
                errors.push(`Línea ${i + 1}: departamento "${deptNombre}" no encontrado.`); continue;
            }
            departamentoId = found;
        }

        productos.push({
            codigo:          codigo ?? "",
            nombre,
            descripcion:     descripcion ?? "",
            tipo,
            unidadMedida,
            metodoValuacion,
            ivaTipo,
            activo,
            departamentoId,
        });
    }

    return { productos, errors };
}
