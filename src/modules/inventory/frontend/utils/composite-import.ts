import { normalizeMeasureUnit } from "./inventory-excel";
import type { MeasureUnit, Product } from "../../backend/domain/product";

/** A single recipe line read from the El Portal composite-products report. */
export interface CompositeImportLine {
  row: number;
  parentCode: string;
  parentName: string;
  componentCode: string;
  componentName: string;
  measureUnit: MeasureUnit;
  quantity: number;
}

/** A complete recipe ready to be sent to the composite-product API. */
export interface CompositeImportRecipe {
  parentCode: string;
  parentName: string;
  lines: CompositeImportLine[];
}

/** Result of parsing and locally validating a composite-products report. */
export interface CompositeImportResult {
  recipes: CompositeImportRecipe[];
  errors: Array<{ row: number; message: string }>;
  totalLines: number;
  pendingProducts?: Array<{ code: string; name: string }>;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') { if (quoted && line[index + 1] === '"') { cell += char; index += 1; } else quoted = !quoted; }
    else if (char === ";" && !quoted) { cells.push(cell.trim()); cell = ""; } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function parsePositiveLocaleNumber(raw: string): number | null {
  const rawValue = raw.trim();
  const comma = rawValue.lastIndexOf(","); const dot = rawValue.lastIndexOf(".");
  if ((rawValue.match(/,/g)?.length ?? 0) > 1 || (rawValue.match(/\./g)?.length ?? 0) > 1) return null;
  const normalized = comma > dot ? rawValue.replace(/\./g, "").replace(",", ".") : rawValue.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Parses El Portal's semicolon-delimited "Listado de Productos Compuestos" report.
 *
 * @param raw - UTF-8/ANSI-decoded report contents supplied by the browser File API.
 * @returns Grouped recipes and row-level structural errors.
 */
export function parseCompositeProductsCsv(raw: string): CompositeImportResult {
  const rows = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const headerIndex = rows.findIndex((line) => line.toLowerCase().includes("codigo/compuesto") && line.toLowerCase().includes("codigo/componente"));
  if (headerIndex < 0) return { recipes: [], errors: [{ row: 0, message: "No se encontró el encabezado del reporte de productos compuestos." }], totalLines: 0 };

  const recipes = new Map<string, CompositeImportRecipe>();
  const errors: Array<{ row: number; message: string }> = [];
  let totalLines = 0;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const cells = splitCsvLine(rows[index]);
    if (cells.every((cell) => !cell)) continue;
    const [parentCode, parentName, , componentCode, componentName, , rawUnit, rawQuantity] = cells;
    const row = index + 1;
    if (parentCode.toLowerCase() === "codigo/compuesto") continue;
    // Non-data footer lines are single-cell labels; malformed report rows are errors.
    if (cells.filter(Boolean).length <= 1) {
      if (/^(total(?:es)?|fin del reporte|pagina)/i.test(parentCode)) continue;
      errors.push({ row, message: "Fila incompleta en el reporte de productos compuestos." });
      continue;
    }
    if (!parentCode || !componentCode) { errors.push({ row, message: "Faltan el código del compuesto o el código del componente." }); continue; }
    const measureUnit = normalizeMeasureUnit(rawUnit);
    const quantity = parsePositiveLocaleNumber(rawQuantity ?? "");
    if (!measureUnit) { errors.push({ row, message: `Unidad no soportada "${rawUnit}".` }); continue; }
    if (quantity === null) { errors.push({ row, message: "La cantidad del componente debe ser un número positivo válido." }); continue; }
    if (parentCode === componentCode) { errors.push({ row, message: "Un producto compuesto no puede incluirse a sí mismo." }); continue; }
    const recipe = recipes.get(parentCode) ?? { parentCode, parentName, lines: [] };
    if (recipe.lines.some((line) => line.componentCode === componentCode)) {
      errors.push({ row, message: `El componente ${componentCode} está repetido en ${parentCode}.` });
      continue;
    }
    recipe.lines.push({ row, parentCode, parentName, componentCode, componentName, measureUnit, quantity });
    recipes.set(parentCode, recipe);
    totalLines += 1;
  }
  if (totalLines === 0 && errors.length === 0) errors.push({ row: 0, message: "El reporte no contiene componentes para importar." });
  return { recipes: [...recipes.values()], errors, totalLines };
}

/**
 * Validates report recipes against the catalog before any recipe is written.
 *
 * @param parsed - Parsed report data.
 * @param products - Current company catalog.
 * @returns Combined validation result with missing products and unit mismatches.
 */
export function validateCompositeImport(parsed: CompositeImportResult, products: Product[]): CompositeImportResult {
  const errors = [...parsed.errors];
  const byCode = new Map<string, Product>();
  const ambiguousCodes = new Set<string>();
  for (const product of products) {
    if (byCode.has(product.code)) ambiguousCodes.add(product.code);
    else byCode.set(product.code, product);
  }
  for (const recipe of parsed.recipes) {
    const parent = byCode.get(recipe.parentCode);
    if (ambiguousCodes.has(recipe.parentCode)) { errors.push({ row: recipe.lines[0]?.row ?? 0, message: `El código ${recipe.parentCode} es ambiguo en el catálogo.` }); continue; }
    if (!parent) { errors.push({ row: recipe.lines[0]?.row ?? 0, message: `No existe el compuesto ${recipe.parentCode} en el catálogo.` }); continue; }
    if (!parent.id || parent.companyId !== products[0]?.companyId) errors.push({ row: recipe.lines[0]?.row ?? 0, message: `El compuesto ${recipe.parentCode} no pertenece a la empresa activa.` });
    if (parent.compositionKind !== "composite") errors.push({ row: recipe.lines[0]?.row ?? 0, message: `${recipe.parentCode} no está marcado como producto compuesto.` });
    for (const line of recipe.lines) {
      const component = byCode.get(line.componentCode);
      if (ambiguousCodes.has(line.componentCode)) errors.push({ row: line.row, message: `El código ${line.componentCode} es ambiguo en el catálogo.` });
      else if (!component || !component.id || component.companyId !== parent.companyId) errors.push({ row: line.row, message: `No existe el componente ${line.componentCode} en el catálogo.` });
      else if (!component.active) errors.push({ row: line.row, message: `El componente ${line.componentCode} está inactivo.` });
      else if (component.measureUnit !== line.measureUnit) errors.push({ row: line.row, message: `La unidad de ${line.componentCode} no coincide con el catálogo.` });
      else if (component.compositionKind === "composite") errors.push({ row: line.row, message: `${line.componentCode} es compuesto; las composiciones anidadas no se admiten.` });
    }
  }
  const includedCodes = new Set(parsed.recipes.map((recipe) => recipe.parentCode));
  const pendingProducts = products
    .filter((product) => product.compositionKind === "composite" && !product.components?.length && !includedCodes.has(product.code))
    .map(({ code, name }) => ({ code, name }));
  return { ...parsed, errors, pendingProducts };
}
