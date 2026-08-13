import fs from "node:fs";
import path from "node:path";

const source = process.argv[2] ?? "C:/Users/hmolina/Downloads/invenatario ii.csv";
const out = process.argv[3] ?? ".";
const lineParse = (line) => {
  const result = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; }
    else if (ch === ";" && !quoted) { result.push(value.trim()); value = ""; }
    else value += ch;
  }
  result.push(value.trim()); return result;
};
const number = (raw) => {
  const s = String(raw ?? "").trim(); if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const row = (values) => values.map(cell).join(",");
const raw = fs.readFileSync(source, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const lines = raw.split("\n");
const headerIndex = lines.findIndex((line) => line.startsWith("codigo;descripcion;departamento;"));
if (headerIndex < 0) throw new Error("No se encontró el encabezado esperado.");
const headers = lineParse(lines[headerIndex]);
const get = (values, name) => values[headers.indexOf(name)] ?? "";
const products = lines.slice(headerIndex + 1).map((line, i) => ({ line: headerIndex + i + 2, values: lineParse(line) }))
  .filter((item) => /^\d+$/.test(get(item.values, "codigo")) && get(item.values, "descripcion"));
const groups = new Map();
for (const product of products) { const code = get(product.values, "codigo"); if (!groups.has(code)) groups.set(code, []); groups.get(code).push(product); }
const stats = { total: products.length, unique: groups.size, duplicateGroups: 0, duplicateRows: 0, negative: 0, zero: 0, positive: 0, salePrice: 0, noSalePrice: 0, eur: 0, blankDepartment: 0, composed: 0, vatGeneral: 0, vatExempt: 0, currencies: new Map(), units: new Map(), departments: new Map() };
for (const group of groups.values()) if (group.length > 1) { stats.duplicateGroups += 1; stats.duplicateRows += group.length; }
const review = [];
for (const product of products) {
  const v = product.values; const code = get(v, "codigo"); const name = get(v, "descripcion"); const dept = get(v, "departamento"); const stockRaw = get(v, "existencia"); const priceRaw = get(v, "precio  1"); const currency = get(v, "moneda"); const vat = get(v, "IVA1"); const unit = get(v, "medidas"); const sourceType = get(v, "producto");
  const stock = number(stockRaw); const price = number(priceRaw); const conflicts = [];
  if (groups.get(code).length > 1) conflicts.push("codigo_duplicado");
  if (stock < 0) { stats.negative += 1; conflicts.push("existencia_negativa"); } else if (stock === 0) stats.zero += 1; else stats.positive += 1;
  if (price > 0) stats.salePrice += 1; else { stats.noSalePrice += 1; conflicts.push("precio_venta_ausente_o_cero"); }
  if (currency === "EUR €") { stats.eur += 1; conflicts.push("moneda_eur_no_soportada"); }
  if (!dept) { stats.blankDepartment += 1; conflicts.push("departamento_vacio"); }
  if (sourceType === "Compuesto") { stats.composed += 1; conflicts.push("tipo_compuesto"); }
  if (vat === "IVA1") stats.vatGeneral += 1; if (vat === "EXENTO") stats.vatExempt += 1;
  for (const [map, key] of [[stats.currencies, currency], [stats.units, unit], [stats.departments, dept || "(vacío)"]]) map.set(key, (map.get(key) ?? 0) + 1);
  review.push([product.line, code, name, dept, stockRaw, priceRaw, currency, vat, unit, sourceType, conflicts.join("|"), conflicts.length ? "revisar_antes_de_importar" : "apto_con_mapeo"]);
}
const mapping = [
  ["codigo", "product.code", "transformar", "Debe quedar único; hay duplicados."],
  ["descripcion", "product.name", "directo", "Usar como nombre."],
  ["departamento", "department.name", "transformar", "Coincidir o crear departamentos."],
  ["existencia", "movement.initialStock", "transformar", "Revisar negativas y convertir a ajuste inicial."],
  ["precio  1", "product.salePricing", "transformar", "Precio de venta fijo; USD→D y Bs.→B."],
  ["precio  2/3/4", "sin_mapeo", "ignorar", "Todos están en cero."],
  ["IVA1", "product.vatType", "transformar", "IVA1→general; EXENTO→exento."],
  ["medidas", "product.measureUnit", "transformar", "UNI→unidad; KG→kg; GR→g."],
  ["producto", "product.type", "transformar", "Producto→mercancia; Compuesto requiere decisión."],
  ["moneda", "product.salePricing.currency", "transformar", "EUR no es compatible."],
  ["(ausente)", "product.averageCost", "faltante", "No hay costo de compra/promedio."],
  ["(ausente)", "product.valuationMethod", "faltante", "Elegir promedio_ponderado o peps."],
];
const list = (map) => [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([key, value]) => "- " + key + ": " + value).join("\n");
const markdown = [
  "# Revisión de inventario antes de importar", "", "Fuente: " + path.basename(source), "",
  "El archivo no debe cargarse directamente. Este informe no realiza ninguna carga.", "",
  "| Indicador | Resultado |", "|---|---:|", `| Filas de productos | ${stats.total} |`, `| Códigos únicos | ${stats.unique} |`, `| Grupos de códigos duplicados | ${stats.duplicateGroups} |`, `| Filas dentro de duplicados | ${stats.duplicateRows} |`, `| Existencia positiva | ${stats.positive} |`, `| Existencia en cero | ${stats.zero} |`, `| Existencia negativa | ${stats.negative} |`, `| Precio 1 válido | ${stats.salePrice} |`, `| Precio 1 vacío/cero | ${stats.noSalePrice} |`, `| Moneda EUR | ${stats.eur} |`, `| Departamento vacío | ${stats.blankDepartment} |`, `| Productos compuestos | ${stats.composed} |`, "",
  "## Mapeo propuesto", "", "| Campo fuente | Campo KONT | Tratamiento |", "|---|---|---|", ...mapping.map(([a, b, c, d]) => "| " + a + " | " + b + " | " + c + ": " + d + " |"), "",
  "## Distribuciones", "", "### Monedas", list(stats.currencies), "", "### Unidades", list(stats.units), "", "### Departamentos", list(stats.departments), "", "### IVA", `- IVA1: ${stats.vatGeneral}`, `- EXENTO: ${stats.vatExempt}`, "",
  "## Archivos", "", "- inventory-import-review.csv: conflictos por producto.", "- inventory-import-mapping.csv: mapeo de campos y transformaciones.", "",
].join("\n");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "inventory-import-review.csv"), "\uFEFF" + [row(["linea_csv", "codigo", "descripcion", "departamento", "existencia", "precio_1", "moneda", "iva", "unidad", "tipo_origen", "conflictos", "recomendacion"]), ...review.map(row)].join("\n"));
fs.writeFileSync(path.join(out, "inventory-import-mapping.csv"), "\uFEFF" + [row(["campo_fuente", "campo_kont", "tratamiento", "nota"]), ...mapping.map(row)].join("\n"));
fs.writeFileSync(path.join(out, "inventory-import-analysis.md"), "\uFEFF" + markdown);
console.log(JSON.stringify({ ...stats, currencies: Object.fromEntries(stats.currencies), units: Object.fromEntries(stats.units), departments: Object.fromEntries(stats.departments) }, null, 2));
