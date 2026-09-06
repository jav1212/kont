import { expect, test } from "@playwright/test";

test("hydrates one UI import and preserves controlled interactions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(await response?.text()).toContain("Catálogo UI");
  await page.getByRole("button", { name: "Acciones: 0" }).click();
  await expect(page.getByRole("button", { name: "Acciones: 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardando" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Deshabilitado" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Kontave");
  await expect(page.getByText("Valor: Kontave")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Campo con error" })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("checkbox", { name: "Tema oscuro" }).check();
  await expect(page.locator("[data-kontave-theme='dark']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Opción", exact: true })).toHaveCSS("background-color", "rgb(33, 37, 41)");
  await page.screenshot({ path: "out/catalog-dark.png", fullPage: true });
  await page.getByRole("checkbox", { name: "Tema oscuro" }).uncheck();
  await expect(page.locator("[data-kontave-theme='light']")).toBeVisible();
  await page.screenshot({ path: "out/catalog-light.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("select supports search, keyboard selection, focus, and Escape dismissal", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Opción", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("Segunda");
  const secondOption = page.getByRole("option", { name: "Segunda opción" });
  await expect(secondOption).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(secondOption).toBeFocused();
  await page.keyboard.press("Space");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Selección: second · 2026-09-06 · 2026-09")).toBeVisible();
  await expect(page.getByText("Cambios de selección: 1")).toBeVisible();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("option", { name: "No disponible" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("select commits once when Enter activates the focused option", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Opción", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const search = page.getByRole("searchbox");
  await search.fill("Segunda");
  const secondOption = page.getByRole("option", { name: "Segunda opción" });
  await page.keyboard.press("ArrowDown");
  await expect(secondOption).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Selección: second · 2026-09-06 · 2026-09")).toBeVisible();
  await expect(page.getByText("Cambios de selección: 1")).toBeVisible();
});

test("date picker prevents out-of-range selection and commits an allowed date", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Fecha", exact: true }).click();
  const calendar = page.getByRole("grid");
  await expect(calendar).toBeVisible();
  await expect(calendar.locator("[aria-disabled='true'], button:disabled").first()).toBeVisible();

  await calendar.getByRole("gridcell", { name: /15 de septiembre de 2026/i }).click();
  await expect(page.getByText("Selección: first · 2026-09-15 · 2026-09")).toBeVisible();
});

test("period picker enforces its year bounds and restores trigger focus on Escape", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Período", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Período" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Año anterior" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Año siguiente" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
