import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  DatePeriodPicker,
  DatePicker,
  FieldSkeleton,
  Heading,
  ImageWithFallback,
  LogoFull,
  LogoMark,
  OptionPicker,
  Sidebar,
  SidebarAction,
  SidebarFooter,
  SidebarHeader,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  Skeleton,
  StatusBadge,
  Text,
  TextField,
  UiProvider,
  useUiTheme,
  type UiThemeContextValue,
} from "@kontave/ui";

const currencyOptions = [
  { label: "Dólar estadounidense (USD)", value: "USD" },
  { label: "Euro (EUR)", value: "EUR" },
  { label: "Bolívar venezolano (VES)", value: "VES" },
] as const;

/**
 * Shows the development-only native component catalog and its interactive states.
 *
 * @returns A local UI catalog with no application data or network dependencies.
 */
export function UiCatalogScreen(): React.JSX.Element {
  const [theme, setTheme] = useState<UiThemeContextValue["theme"]>("light");

  return <UiProvider theme={theme}>
    <CatalogContent theme={theme} onThemeChange={setTheme} />
  </UiProvider>;
}

/**
 * Applies the selected UI theme to the development catalog surface.
 *
 * @param props - The active theme and its update action.
 * @returns The themed catalog content.
 */
function CatalogContent({ onThemeChange, theme }: { readonly onThemeChange: (theme: UiThemeContextValue["theme"]) => void; readonly theme: UiThemeContextValue["theme"] }): React.JSX.Element {
  const { colors } = useUiTheme();
  return <ScrollView contentContainerStyle={styles.content} style={[styles.screen, { backgroundColor: colors.background }]}>
    <Heading>Catálogo UI</Heading>
    <Text style={[styles.description, { color: colors.muted }]}>Estados reutilizables del renderer nativo de Kontave.</Text>

    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Tema</Text>
      <View style={styles.row}>
        <Button intent={theme === "light" ? "primary" : "neutral"} onPress={() => onThemeChange("light")}>Claro</Button>
        <Button intent={theme === "dark" ? "primary" : "neutral"} onPress={() => onThemeChange("dark")}>Oscuro</Button>
      </View>
    </Card>

    <CatalogControls />
  </ScrollView>;
}

/**
 * Provides locally controlled examples for native input and selection components.
 *
 * @returns Interactive catalog examples without any business integration.
 */
function CatalogControls(): React.JSX.Element {
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [currency, setCurrency] = useState<(typeof currencyOptions)[number]["value"]>("USD");
  const [date, setDate] = useState("2026-09-06");
  const [period, setPeriod] = useState("2026-09");

  return <>
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Acciones</Text>
      <View style={styles.row}><Button onPress={() => undefined}>Primario</Button><Button intent="neutral" onPress={() => undefined}>Secundario</Button></View>
      <Button disabled onPress={() => undefined}>Deshabilitado</Button>
      <Button loading onPress={() => undefined}>Guardando</Button>
      <Alert intent="info">Los controles mantienen la misma API en todos los clientes.</Alert>
      <View style={styles.row}><StatusBadge intent="success">Listo</StatusBadge><StatusBadge intent="warning">Pendiente</StatusBadge><StatusBadge intent="danger">Error</StatusBadge></View>
    </Card>

    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Campos</Text>
      <TextField label="Nombre de ejemplo" onValueChange={setName} placeholder="Escribe aquí" value={name} />
      <Checkbox checked={accepted} label="Acepto las condiciones" onCheckedChange={setAccepted} />
      <OptionPicker label="Moneda" onValueChange={setCurrency} options={currencyOptions} value={currency} />
      <DatePicker label="Fecha" locale="es-VE" onValueChange={setDate} value={date} />
      <DatePeriodPicker label="Período" locale="es-VE" onValueChange={setPeriod} value={period} />
    </Card>

    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Carga y contenido</Text>
      <Skeleton height={18} variant="text" width="58%" />
      <Skeleton height={48} variant="control" width="100%" />
      <FieldSkeleton hint label="Empresa" loadingLabel />
      <ImageWithFallback accessibilityLabel="Vista previa sin imagen" fallback="Sin imagen" style={styles.imageFallback} />
    </Card>

    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Identidad y navegación</Text>
      <View style={styles.row}><LogoFull /><LogoMark size={34} /></View>
      <Breadcrumbs ariaLabel="Ruta de ejemplo" items={[{ id: "inicio", label: "Inicio" }, { id: "nomina", label: "Nómina" }, { current: true, id: "bcv", label: "BCV" }]} onNavigate={() => undefined} />
      <Sidebar presentation="expanded" style={styles.sidebar}>
        <SidebarHeader><Text style={styles.sidebarTitle}>Kontave</Text></SidebarHeader>
        <SidebarNav>
          <SidebarSection label="Operación">
            <SidebarLink active icon="▣" label="Nómina" onPress={() => undefined} />
            <SidebarLink badge="3" icon="□" label="Inventario" onPress={() => undefined} />
          </SidebarSection>
        </SidebarNav>
        <SidebarFooter><SidebarAction icon="↗" label="Configuración" onPress={() => undefined} /></SidebarFooter>
      </Sidebar>
    </Card>
  </>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 48 },
  description: { color: "#667087" },
  card: { gap: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageFallback: { alignSelf: "flex-start", height: 72, width: 120 },
  sidebar: { alignSelf: "stretch", minHeight: 230 },
  sidebarTitle: { fontSize: 18, fontWeight: "800" },
});
