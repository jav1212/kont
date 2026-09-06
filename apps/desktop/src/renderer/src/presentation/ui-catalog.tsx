import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePeriodPicker,
  DatePicker,
  FieldSkeleton,
  Heading,
  OptionPicker,
  Skeleton,
  StatusBadge,
  Text,
  TextField,
  UiProvider,
} from "@kontave/ui";
import "./ui-catalog.css";

/**
 * Renders development-only UI component examples without Desktop runtime state.
 * @returns An isolated component catalog for visual and interaction review.
 */
export function DesktopUiCatalog(): React.JSX.Element {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const [option, setOption] = useState("ves");
  const [date, setDate] = useState("2026-09-06");
  const [period, setPeriod] = useState("2026-09");

  return <UiProvider theme={theme} locale="es-VE">
    <main className="desktop-ui-catalog">
      <header className="desktop-ui-catalog__header">
        <div>
          <Text tone="subtle">Desktop · solo desarrollo</Text>
          <Heading level={1}>Catálogo UI</Heading>
        </div>
        <Button appearance="outline" intent="neutral" onPress={() => setTheme((current) => current === "light" ? "dark" : "light")}>
          Usar tema {theme === "light" ? "oscuro" : "claro"}
        </Button>
      </header>

      <section className="desktop-ui-catalog__grid" aria-label="Estados de componentes">
        <CatalogCard title="Acciones">
          <Button onPress={() => undefined}>Primaria</Button>
          <Button intent="neutral">Neutral</Button>
          <Button intent="danger">Eliminar</Button>
          <Button appearance="outline">Secundaria</Button>
          <Button loading>Cargando</Button>
          <Button disabled>Deshabilitada</Button>
        </CatalogCard>

        <CatalogCard title="Campos">
          <TextField label="Nombre" value={text} onValueChange={setText} placeholder="Escribe aquí" hint="Valor controlado" />
          <TextField label="Con error" value="" onValueChange={() => undefined} error="Este campo es obligatorio." />
          <TextField label="Cargando" value="" onValueChange={() => undefined} loading loadingLabel />
          <Checkbox label="Recordarme" checked={checked} onCheckedChange={setChecked} />
        </CatalogCard>

        <CatalogCard title="Selección">
          <OptionPicker
            label="Moneda"
            value={option}
            options={[
              { value: "ves", label: "Bolívares", description: "VES" },
              { value: "usd", label: "Dólares", description: "USD" },
            ]}
            onValueChange={setOption}
          />
          <DatePicker label="Fecha" value={date} onValueChange={setDate} />
          <DatePeriodPicker label="Período" value={period} onValueChange={setPeriod} />
        </CatalogCard>

        <CatalogCard title="Estados">
          <Alert intent="info">Información del sistema.</Alert>
          <Alert intent="success">Operación completada.</Alert>
          <Alert intent="warning">Requiere atención.</Alert>
          <Alert intent="danger">No se pudo guardar.</Alert>
          <div className="desktop-ui-catalog__badges">
            <StatusBadge intent="success">Listo</StatusBadge>
            <StatusBadge intent="warning">Pendiente</StatusBadge>
            <StatusBadge intent="danger">Error</StatusBadge>
          </div>
        </CatalogCard>

        <CatalogCard title="Carga">
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="45%" />
          <Skeleton variant="rectangle" width="100%" height={84} />
          <FieldSkeleton label="Cargando campo" hint loadingLabel />
        </CatalogCard>
      </section>
    </main>
  </UiProvider>;
}

/**
 * Groups related catalog examples under a shared heading.
 * @param props - Catalog-card title and component examples.
 * @returns A titled collection of examples.
 */
function CatalogCard({ children, title }: { readonly children: React.ReactNode; readonly title: string }): React.JSX.Element {
  return <Card className="desktop-ui-catalog__card">
    <Heading level={2}>{title}</Heading>
    <div className="desktop-ui-catalog__examples">{children}</div>
  </Card>;
}
