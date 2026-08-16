import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Heading, Text, nativeTheme } from "@kontave/ui-native";
import { MobileBcvFailure, MobileBcvSource, type MobileBcvRate } from "../bcv/mobile-bcv-source";
import { useAuth } from "../auth/auth-context";
import { useClientExperience } from "../client-experience/mobile-client-experience";

type Direction = "to-ves" | "from-ves";
const PRIORITY = ["USD", "EUR", "CNY"];
const KEYPAD: readonly (string | "backspace")[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "backspace"];

export function BcvCalculatorScreen(): React.JSX.Element {
  const auth = useAuth();
  const { feedback } = useClientExperience();
  const source = useMemo(() => new MobileBcvSource(auth.authenticatedFetch), [auth.authenticatedFetch]);
  const [rates, setRates] = useState<readonly MobileBcvRate[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("USD");
  const [direction, setDirection] = useState<Direction>("to-ves");
  const [amount, setAmount] = useState("100");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await source.current();
      setRates(snapshot.rates);
      setDate(snapshot.date);
      setCode((current) => snapshot.rates.some((rate) => rate.code === current) ? current : snapshot.rates[0]?.code ?? "USD");
    } catch (cause: unknown) {
      const failure = cause instanceof MobileBcvFailure ? cause : new MobileBcvFailure("BCV_UNAVAILABLE", "No se pudo consultar el BCV.");
      feedback.execute({ intent: "error", message: failure.message, description: `Código: ${failure.code}`, referenceCode: failure.code, deduplicationKey: "mobile-bcv-error" });
    } finally { setLoading(false); }
  }, [feedback, source]);

  useEffect(() => { void load(); }, [load]);

  const orderedRates = useMemo(() => [...rates].sort((left, right) => {
    const leftIndex = PRIORITY.indexOf(left.code); const rightIndex = PRIORITY.indexOf(right.code);
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex) || left.code.localeCompare(right.code);
  }), [rates]);
  const activeRate = rates.find((rate) => rate.code === code) ?? null;
  const numericAmount = parseAmount(amount);
  const result = activeRate && Number.isFinite(numericAmount)
    ? direction === "to-ves" ? numericAmount * activeRate.sell : numericAmount / activeRate.sell
    : Number.NaN;
  const originCode = direction === "to-ves" ? code : "VES";
  const targetCode = direction === "to-ves" ? "VES" : code;

  const enterAmount = (key: string | "backspace"): void => {
    if (key === "backspace") { setAmount((current) => current.slice(0, -1)); return; }
    setAmount((current) => appendAmount(current, key));
  };
  const selectNextCurrency = (): void => {
    if (!orderedRates.length) return;
    const index = orderedRates.findIndex((rate) => rate.code === code);
    setCode(orderedRates[(index + 1) % orderedRates.length]?.code ?? code);
  };

  return <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <View style={styles.headingRow}><View style={styles.flex}><Text style={styles.eyebrow}>TASA OFICIAL</Text><Heading style={styles.title}>Calculadora BCV</Heading><Text style={styles.subtitle}>Convierte montos rápidamente usando la tasa oficial disponible.</Text></View><Pressable accessibilityLabel="Actualizar tasas" disabled={loading} onPress={() => { void load(); }} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>{loading ? <ActivityIndicator color={nativeTheme.color.primary} /> : <Ionicons name="refresh" size={23} color={nativeTheme.color.primary} />}</Pressable></View>

    <Pressable accessibilityLabel="Cambiar moneda" disabled={!activeRate} onPress={selectNextCurrency} style={({ pressed }) => [styles.ratePill, pressed && styles.pressed]}><View style={styles.liveDot} /><Text style={styles.pillMuted}>BCV</Text><View style={styles.pillDivider} />{activeRate ? <Text style={styles.pillRate}>1 {code} = {formatNumber(activeRate.sell, 2)} Bs</Text> : <Text style={styles.pillRate}>Consultando…</Text>}<View style={styles.pillDivider} /><Text style={styles.pillMuted}>{date ? formatRelativeDate(date) : "Hoy"}</Text><Ionicons name="chevron-down" size={14} color="#7A8293" /></Pressable>

    <View style={styles.fintechCard}><View style={styles.cardGlow} /><View style={styles.amountTop}><Text style={styles.darkLabel}>MONTO</Text><Pressable accessibilityLabel="Limpiar monto" onPress={() => setAmount("")}><Text style={styles.clearAmount}>Limpiar</Text></Pressable></View><View style={styles.amountLine}><Text style={styles.symbol}>{currencySymbol(originCode)}</Text><Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, !amount && styles.amountEmpty]}>{amount || "0"}</Text><Text style={styles.originCode}>{originCode}</Text></View>
      <View style={styles.swapLine}><View style={styles.rule} /><Pressable accessibilityLabel="Invertir conversión" onPress={() => setDirection((current) => current === "to-ves" ? "from-ves" : "to-ves")} style={({ pressed }) => [styles.swap, pressed && styles.swapPressed]}><Ionicons name="swap-vertical" size={19} color="#FFFFFF" /></Pressable><View style={styles.rule} /></View>
      <Text style={styles.darkLabel}>RECIBES APROXIMADAMENTE</Text><View style={styles.resultLine}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.resultValue}>{Number.isFinite(result) ? formatNumber(result, 2) : "—"}</Text><Text style={styles.resultCode}>{targetCode}</Text></View>
    </View>

    <View accessibilityLabel="Teclado numérico" style={styles.keypad}>{KEYPAD.map((key) => <Pressable key={key} accessibilityLabel={key === "backspace" ? "Borrar último dígito" : key === "," ? "Separador decimal" : key} onPress={() => enterAmount(key)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>{key === "backspace" ? <Ionicons name="backspace-outline" size={24} color={nativeTheme.color.text} /> : <Text style={styles.keyText}>{key}</Text>}</Pressable>)}</View>

    <View style={styles.actions}><Pressable accessibilityLabel="Cambiar dirección de conversión" onPress={() => setDirection((current) => current === "to-ves" ? "from-ves" : "to-ves")} style={({ pressed }) => [styles.directionButton, pressed && styles.pressed]}><Ionicons name="swap-horizontal" size={18} color="#343B4D" /><Text style={styles.directionText}>Cambiar {originCode} ↔ {targetCode}</Text></Pressable><Pressable accessibilityLabel="Confirmar cálculo" onPress={() => feedback.execute({ intent: "success", message: "Cálculo listo", description: null, referenceCode: null, deduplicationKey: "bcv-calculation-ready" })} style={({ pressed }) => [styles.confirm, pressed && styles.confirmPressed]}><Ionicons name="checkmark" size={22} color="#FFFFFF" /></Pressable></View>
    <Text style={styles.disclaimer}>Cálculo referencial basado en la tasa oficial BCV.</Text>
  </ScrollView>;
}

function parseAmount(value: string): number { return Number(value.trim().replace(/\s/g, "").replace(",", ".")); }
function appendAmount(current: string, key: string): string {
  if (current.length >= 15) return current;
  if (key === ",") return current.includes(",") ? current : current ? `${current},` : "0,";
  const decimals = current.split(",")[1];
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current === "0") return key === "0" ? current : key;
  return `${current}${key}`;
}
function formatNumber(value: number, decimals: number): string { return new Intl.NumberFormat("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value); }
function formatRelativeDate(value: string): string { const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" }); return value === today ? "Hoy" : value.split("-").reverse().join("/"); }
function currencySymbol(code: string): string { return code === "USD" ? "$" : code === "EUR" ? "€" : code === "GBP" ? "£" : code === "VES" ? "Bs." : code; }

const styles = StyleSheet.create({
  page: { backgroundColor: "#F5F6F8", gap: 20, padding: 20, paddingBottom: 112 }, flex: { flex: 1 }, pressed: { opacity: 0.7 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: 14 }, eyebrow: { color: nativeTheme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2 }, title: { fontSize: 30, letterSpacing: -1.2, marginTop: 6 }, subtitle: { color: "#747E92", fontSize: 14, lineHeight: 21, marginTop: 7, maxWidth: 420 }, refresh: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#E4E7EC", borderRadius: 18, borderWidth: 1, elevation: 4, height: 54, justifyContent: "center", shadowColor: "#111522", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 12, width: 54 },
  ratePill: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderColor: "#E1E4EA", borderRadius: 22, borderWidth: 1, flexDirection: "row", gap: 9, minHeight: 42, paddingHorizontal: 14 }, liveDot: { backgroundColor: "#20BE64", borderRadius: 5, height: 9, width: 9 }, pillMuted: { color: "#697286", fontSize: 12 }, pillDivider: { backgroundColor: "#D7DAE1", height: 13, width: 1 }, pillRate: { color: "#22293A", fontSize: 12, fontWeight: "800" },
  fintechCard: { backgroundColor: "#111A2A", borderRadius: 28, gap: 16, minHeight: 330, overflow: "hidden", padding: 28 }, cardGlow: { backgroundColor: "#1A2538", borderRadius: 120, height: 190, position: "absolute", right: -70, top: -85, width: 190 }, amountTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, darkLabel: { color: "#AEB7C9", fontSize: 10, fontWeight: "900", letterSpacing: 2 }, clearAmount: { color: "#FF7555", fontSize: 12, fontWeight: "800" }, amountLine: { alignItems: "center", flexDirection: "row", minHeight: 96 }, symbol: { color: "#C0C8D8", fontSize: 24, fontWeight: "800", marginRight: 10 }, amount: { color: "#FFFFFF", flex: 1, fontSize: 50, fontWeight: "900", letterSpacing: -2 }, amountEmpty: { color: "#657086" }, originCode: { color: "#AEB7C9", fontSize: 13, fontWeight: "800" }, swapLine: { alignItems: "center", flexDirection: "row", gap: 13 }, rule: { backgroundColor: "#2B3548", flex: 1, height: 1 }, swap: { alignItems: "center", backgroundColor: "#202A3B", borderColor: "#3B4558", borderRadius: 24, borderWidth: 1, height: 48, justifyContent: "center", width: 48 }, swapPressed: { backgroundColor: "#303B4E", transform: [{ scale: 0.96 }] }, resultLine: { alignItems: "baseline", flexDirection: "row", gap: 9 }, resultValue: { color: "#FFFFFF", flexShrink: 1, fontSize: 35, fontWeight: "900", letterSpacing: -1.4 }, resultCode: { color: "#AEB7C9", fontSize: 14, fontWeight: "800" },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, key: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 20, elevation: 2, height: 72, justifyContent: "center", shadowColor: "#111522", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.035, shadowRadius: 9, width: "31%" }, keyPressed: { backgroundColor: "#ECEEF2", transform: [{ scale: 0.97 }] }, keyText: { color: "#151C2B", fontSize: 24, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 12 }, directionButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DFE2E8", borderRadius: 18, borderWidth: 1, flex: 1, flexDirection: "row", gap: 10, justifyContent: "center", minHeight: 64 }, directionText: { color: "#343B4D", fontSize: 13, fontWeight: "800" }, confirm: { alignItems: "center", backgroundColor: nativeTheme.color.primary, borderRadius: 20, elevation: 8, justifyContent: "center", minHeight: 64, shadowColor: nativeTheme.color.primary, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.22, shadowRadius: 16, width: 68 }, confirmPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] }, disclaimer: { color: "#9BA3B3", fontSize: 11, textAlign: "center" },
});
