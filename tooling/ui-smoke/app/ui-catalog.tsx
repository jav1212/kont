"use client";

import { useState } from "react";
import {
  Alert, Button, Card, Checkbox, DatePicker, DatePeriodPicker, Heading,
  OptionPicker, PageShell, Skeleton, Stack, Text, TextField, UiProvider,
} from "@kontave/ui";

/**
 * Verifies hydration, controlled inputs and themed overlays through one public import.
 * @returns A standalone interactive fixture without account or business context.
 */
export function Catalog() {
  const [dark, setDark] = useState(false);
  const [count, setCount] = useState(0);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState("first");
  const [choiceChanges, setChoiceChanges] = useState(0);
  const [date, setDate] = useState("2026-09-06");
  const [period, setPeriod] = useState("2026-09");
  const selectChoice = (value: string): void => {
    setChoice(value);
    setChoiceChanges((count) => count + 1);
  };
  return <UiProvider theme={dark ? "dark" : "light"} locale="es-VE">
    <PageShell>
      <Stack>
        <Heading>Catálogo UI · consumidor Next.js</Heading>
        <Text>Esta página prueba renderizado de servidor e hidratación.</Text>
        <Checkbox label="Tema oscuro" checked={dark} onCheckedChange={setDark} />
        <Card><Stack>
          <Button onPress={() => setCount((value) => value + 1)}>Acciones: {count}</Button>
          <Button loading onPress={() => setCount((value) => value + 100)}>Guardando</Button>
          <Button disabled onPress={() => setCount((value) => value + 100)}>Deshabilitado</Button>
          <TextField label="Nombre" value={name} onValueChange={setName} />
          <TextField label="Campo con error" value="" error="Completa este campo" onValueChange={() => {}} />
          <Text aria-live="polite">Valor: {name || "vacío"}</Text>
          <OptionPicker label="Opción" value={choice} onValueChange={selectChoice} searchable options={[
            { value: "first", label: "Primera opción" },
            { value: "second", label: "Segunda opción" },
            { value: "disabled", label: "No disponible", disabled: true },
          ]} />
          <DatePicker label="Fecha" value={date} min="2026-09-01" max="2026-09-30" onValueChange={setDate} />
          <DatePeriodPicker label="Período" value={period} min="2026-01" max="2026-12" onValueChange={setPeriod} />
          <Text>Selección: {choice} · {date} · {period}</Text>
          <Text>Cambios de selección: {choiceChanges}</Text>
          <Alert intent="info">Componentes independientes del cliente.</Alert>
          <Skeleton width="60%" variant="text" />
        </Stack></Card>
      </Stack>
    </PageShell>
  </UiProvider>;
}
