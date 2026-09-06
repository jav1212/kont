/* eslint-disable @typescript-eslint/no-require-imports -- Jest hoists native-module factories before imports. */
import { Platform } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { getUiColors } from "../../core/src/tokens";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  ImageWithFallback,
  OptionPicker,
  Text,
  TextField,
  UiProvider,
} from "../src";

jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  const { View: MockView } = require("react-native");
  return function MockDatePicker(props: object) {
    return React.createElement(MockView, { ...props, testID: "date-wheel" });
  };
});

test("presses once and suppresses busy/disabled actions while retaining a label", () => {
  const action = jest.fn();
  const view = render(<Button onPress={action}>Guardar</Button>);
  fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(action).toHaveBeenCalledTimes(1);
  view.rerender(
    <Button onPress={action} loading>
      Guardar
    </Button>,
  );
  expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Guardar" }).props.accessibilityState
      .busy,
  ).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  view.rerender(
    <Button onPress={action} disabled>
      Guardar
    </Button>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
  expect(action).toHaveBeenCalledTimes(1);
});

test("controlled fields and checkbox deliver semantic values", () => {
  const change = jest.fn(),
    check = jest.fn();
  render(
    <>
      <TextField
        label="Nombre"
        value=""
        onValueChange={change}
        error="Requerido"
      />
      <Checkbox label="Aceptar" checked={false} onCheckedChange={check} />
    </>,
  );
  fireEvent.changeText(screen.getByLabelText("Nombre"), "Ana");
  expect(change).toHaveBeenCalledWith("Ana");
  fireEvent.press(screen.getByRole("checkbox", { name: "Aceptar" }));
  expect(check).toHaveBeenCalledWith(true);
  expect(screen.getByText("Requerido")).toBeOnTheScreen();
});

test("provider colors update existing surfaces and text", () => {
  const view = render(
    <UiProvider theme="light">
      <Card testID="card">
        <Text>Texto</Text>
      </Card>
    </UiProvider>,
  );
  expect(screen.getByTestId("card")).toHaveStyle({
    backgroundColor: getUiColors("light").surface,
  });
  view.rerender(
    <UiProvider theme="dark">
      <Card testID="card">
        <Text>Texto</Text>
      </Card>
    </UiProvider>,
  );
  expect(screen.getByTestId("card")).toHaveStyle({
    backgroundColor: getUiColors("dark").surface,
  });
  expect(screen.getByText("Texto")).toHaveStyle({
    color: getUiColors("dark").text,
  });
});

test("unknown options stay unselected; search, selection and cancellation are distinct", () => {
  const change = jest.fn();
  render(
    <OptionPicker
      label="Opciones"
      value="missing"
      onValueChange={change}
      searchable
      options={[
        { value: "a", label: "Alfa" },
        { value: "b", label: "Beta", disabled: true },
      ]}
    />,
  );
  expect(screen.getByText("Seleccionar")).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Opciones" }));
  fireEvent.changeText(screen.getByLabelText("Buscar..."), "zzz");
  expect(screen.getByText("No hay opciones que coincidan.")).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Cerrar Opciones" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Opciones" }));
  fireEvent.press(screen.getByRole("radio", { name: "Beta" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("radio", { name: "Alfa" }));
  expect(change).toHaveBeenCalledWith("a");
});

test("iOS date drafts commit only on confirmation and cancel preserves the value", () => {
  Platform.OS = "ios";
  const change = jest.fn();
  render(
    <DatePicker
      value="2026-09-06"
      min="2026-09-01"
      max="2026-09-30"
      onValueChange={change}
    />,
  );
  fireEvent.press(screen.getByRole("button", { name: "Fecha" }));
  fireEvent(
    screen.getByTestId("date-wheel"),
    "onChange",
    { type: "set" },
    new Date(2026, 8, 9, 12),
  );
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Cerrar Fecha" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Fecha" }));
  fireEvent(
    screen.getByTestId("date-wheel"),
    "onChange",
    { type: "set" },
    new Date(2026, 8, 10, 12),
  );
  fireEvent.press(screen.getByRole("button", { name: "Confirmar fecha" }));
  expect(change).toHaveBeenCalledWith("2026-09-10");
});

test("failed images retry when their source changes", () => {
  const view = render(
    <ImageWithFallback
      src="one.png"
      alt="Imagen"
      fallback={<Text>Sin imagen</Text>}
    />,
  );
  fireEvent(screen.getByLabelText("Imagen"), "error", {
    nativeEvent: { error: "failed" },
  });
  expect(screen.getByText("Sin imagen")).toBeOnTheScreen();
  view.rerender(
    <ImageWithFallback
      src="two.png"
      alt="Imagen"
      fallback={<Text>Sin imagen</Text>}
    />,
  );
  expect(screen.getByLabelText("Imagen")).toBeOnTheScreen();
  view.rerender(<ImageWithFallback fallback="Sin imagen" />);
  expect(screen.getByText("Sin imagen")).toBeOnTheScreen();
});

test("Android date dismissal preserves selection and confirmation commits once", () => {
  Platform.OS = "android";
  try {
    const change = jest.fn();
    render(<DatePicker value="2026-09-06" onValueChange={change} />);
    fireEvent.press(screen.getByRole("button", { name: "Fecha" }));
    fireEvent(screen.getByTestId("date-wheel"), "onChange", {
      type: "dismissed",
    });
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByTestId("date-wheel")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Fecha" }));
    fireEvent(
      screen.getByTestId("date-wheel"),
      "onChange",
      { type: "set" },
      new Date(2026, 8, 12, 12),
    );
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith("2026-09-12");
  } finally {
    Platform.OS = "ios";
  }
});
