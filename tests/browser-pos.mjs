import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createApp } from "../server.js";

const dir = mkdtempSync(join(tmpdir(), "sipro-pos-"));
const { server, store } = createApp({ dbPath: join(dir, "test.sqlite") });
store.change((s) => {
  s.products[0].name = "Artículo <especial> & prueba";
  s.products[0].stock = 20;
  s.products[0].price = 1000;
  s.products[0].tax = 13;
  s.products[0].category = "Prueba";
  for (let i = 0; i < 15; i++)
    s.products.push({
      ...s.products[0],
      id: 100 + i,
      code: `POS-${i}`,
      name: `Artículo rápido ${i}`,
    });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  ...(process.env.SIPRO_CHROMIUM
    ? { executablePath: process.env.SIPRO_CHROMIUM }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const modal = page.getByRole("dialog");
const cash = modal.getByLabel("Efectivo recibido (₡)", { exact: true });
const state = () =>
  page.evaluate(async () => (await fetch("/api/state")).json());
const quick = page.locator('[data-quick-product="1"]');
const close = () =>
  modal.getByRole("button", { name: "Cerrar", exact: true }).click();
const open = () => page.keyboard.press("F9");
mkdirSync("test-results", { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#invoices`);
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await page.locator("#sale-form").waitFor();
  await open();
  assert.equal(await modal.isVisible(), false, "No abre un cobro vacío");
  await page.getByRole("button", { name: "Productos siguientes" }).click();
  assert.match(await page.locator("#quick-page").innerText(), /^2 /);
  await page.getByLabel("Filtrar artículos").fill("<especial>");
  assert.equal(await page.locator("[data-quick-product]").count(), 1);
  await quick.click();
  await quick.click();
  const qty = page.getByLabel("Cantidad de Artículo <especial> & prueba", {
    exact: true,
  });
  assert.equal(await qty.inputValue(), "2");
  await qty.fill("21");
  await qty.press("Tab");
  assert.equal(await qty.inputValue(), "2");
  assert.match(
    await page.locator("#sale-form .error").innerText(),
    /entre 1 y 20/,
  );
  await page.getByLabel("Descuento (%)", { exact: true }).fill("10");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/pos-terminal.png",
    fullPage: true,
  });
  await open();
  await modal.getByLabel("Nombre del cliente").fill("Cliente de prueba");
  for (const digit of ["1", "8", "0", "0"])
    await modal.getByRole("button", { name: digit, exact: true }).click();
  await modal.getByRole("button", { name: "Decimal", exact: true }).click();
  await modal.getByRole("button", { name: "5", exact: true }).click();
  assert.equal(await cash.inputValue(), "1800.5");
  await modal.getByRole("button", { name: "Borrar", exact: true }).click();
  assert.equal(await cash.inputValue(), "1800");
  await cash.fill("1000");
  await modal.getByRole("button", { name: "Emitir factura" }).click();
  assert.equal((await state()).invoices.length, 0);
  assert.equal(await cash.evaluate((el) => el.validity.valid), false);
  await modal.getByRole("button", { name: "Volver a la venta" }).click();
  await open();
  assert.equal(
    await modal.getByLabel("Nombre del cliente").inputValue(),
    "Cliente de prueba",
  );
  assert.equal(await cash.inputValue(), "1000");
  await modal.locator('[data-cash-add="1000"]').click();
  assert.equal(await cash.inputValue(), "2000");
  await page.screenshot({ path: "test-results/pos-cobro.png" });
  // Una respuesta lenta no permite doble envío ni cerrar y abrir otro cobro.
  let requests = 0;
  await page.route("**/api/invoices", async (route) => {
    requests++;
    await new Promise((r) => setTimeout(r, 250));
    await route.continue();
  });
  await page.keyboard.press("F10");
  await page.keyboard.press("F10");
  await page.keyboard.press("Escape");
  await modal.getByRole("heading", { name: "FAC-00001" }).waitFor();
  assert.equal(requests, 1);
  let snapshot = await state();
  assert.equal(snapshot.invoices[0].total, 1800);
  assert.equal(snapshot.invoices[0].paid, 2000);
  assert.equal(snapshot.invoices[0].change, 200);
  assert.equal(snapshot.products[0].stock, 18);
  assert.equal(await modal.getByLabel("Ancho del ticket").inputValue(), "80");
  await close();
  await page.unroute("**/api/invoices");
  for (const [index, payment] of ["Tarjeta", "SINPE"].entries()) {
    await quick.click();
    await open();
    await modal.getByRole("button", { name: payment, exact: true }).click();
    assert.equal(await cash.isVisible(), false);
    assert.equal(await modal.locator("#cash-keyboard").isVisible(), false);
    await modal.getByRole("button", { name: "Emitir factura" }).click();
    await modal
      .getByRole("heading", { name: `FAC-0000${index + 2}` })
      .waitFor();
    snapshot = await state();
    assert.equal(snapshot.invoices[index + 1].payment, payment);
    assert.equal(snapshot.invoices[index + 1].paid, 1000);
    assert.equal(snapshot.invoices[index + 1].change, 0);
    await close();
  }
  assert.equal((await state()).products[0].stock, 16);
  await page.setViewportSize({ width: 390, height: 844 });
  await quick.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "test-results/pos-movil.png", fullPage: true });
  await open();
  await modal
    .getByRole("button", { name: "Monto exacto", exact: true })
    .click();
  assert.equal(await cash.inputValue(), "1000");
  assert.ok(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: "test-results/pos-cobro-movil.png" });
  await close();
  await page.reload();
  await page.locator("#sale-form").waitFor();
  snapshot = await state();
  assert.equal(snapshot.invoices.length, 3);
  assert.equal(snapshot.products[0].stock, 16);
  assert.deepEqual(errors, []);
  console.log(
    "POS: escaneo y botonera, existencias, filtros, cobro, teclado, efectivo/tarjeta/SINPE, envío único y móvil OK.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
}
