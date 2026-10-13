import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createApp } from "../server.js";

const dir = mkdtempSync(join(tmpdir(), "sipro-browser-"));
const { server } = createApp({ dbPath: join(dir, "browser.sqlite") });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SIPRO_CHROMIUM
    ? { executablePath: process.env.SIPRO_CHROMIUM }
    : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401 (Unauthorized)"))
    errors.push(m.text());
});
mkdirSync("test-results", { recursive: true });
const dialog = () => page.getByRole("dialog");
async function navigate(name) {
  await page
    .getByRole("navigation")
    .getByRole("link", { name, exact: true })
    .click();
  await page
    .locator('nav a[aria-current="page"]')
    .filter({ hasText: name })
    .waitFor();
}
async function signIn(username, password) {
  await page
    .locator("#login-form")
    .getByLabel("Usuario", { exact: true })
    .fill(username);
  await page
    .locator("#login-form")
    .getByLabel("Contraseña", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await page.getByRole("navigation").waitFor();
}
try {
  await page.goto(base);
  await signIn("admin", "Admin123!");
  await page.screenshot({ path: "test-results/resumen.png", fullPage: true });
  // Registro real de proveedor y producto, incluyendo su relación.
  await navigate("Proveedores");
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  for (const [label, value] of [
    ["Nombre o razón social", "Proveedor navegador"],
    ["Identificación", "BROWSER-01"],
    ["Contacto principal", "Contacto prueba"],
    ["Teléfono", "2661-0000"],
    ["Correo electrónico", "browser@example.com"],
    ["Dirección", "Puntarenas"],
  ])
    await dialog().getByLabel(label, { exact: true }).fill(value);
  await dialog().getByRole("button", { name: "Guardar", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page
    .getByRole("cell", { name: "Proveedor navegador", exact: false })
    .waitFor();
  await navigate("Productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  for (const [label, value] of [
    ["Código", "BROWSER-P01"],
    ["Nombre", "Producto navegador"],
    ["Categoría", "Abarrotes"],
    ["Presentación / unidad", "Unidad"],
    ["Precio de venta, IVA incluido (₡)", "1000"],
    ["Existencia inicial", "10"],
    ["Costo unitario inicial (₡)", "500"],
  ])
    await dialog().getByLabel(label, { exact: true }).fill(value);
  await dialog().getByRole("button", { name: "Asociar" }).click();
  await dialog()
    .getByLabel("Proveedor", { exact: true })
    .selectOption({ label: "Proveedor navegador" });
  await dialog().getByLabel("Costo (₡)", { exact: true }).fill("500");
  await dialog().getByRole("button", { name: "Guardar", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByLabel("Buscar", { exact: true }).fill("BROWSER-P01");
  await page
    .getByRole("cell", { name: "Producto navegador", exact: false })
    .waitFor();
  // Pedido, revisión, regreso al borrador, confirmación y recepción.
  await navigate("Pedidos");
  await page.getByRole("button", { name: "Nuevo pedido" }).click();
  await dialog()
    .getByLabel("Proveedor", { exact: true })
    .selectOption({ label: "Proveedor navegador" });
  await dialog().getByLabel("Cantidad", { exact: true }).fill("4");
  await dialog().getByRole("button", { name: "Agregar", exact: true }).click();
  await dialog().getByRole("button", { name: "Revisar pedido" }).click();
  await dialog().getByRole("button", { name: "Volver a editar" }).click();
  await dialog().getByRole("button", { name: "Revisar pedido" }).click();
  await dialog().getByRole("button", { name: "Confirmar pedido" }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Ver", exact: true }).click();
  await dialog()
    .getByRole("button", { name: "Confirmar recepción completa" })
    .click();
  await dialog().waitFor({ state: "hidden" });
  await page
    .locator("#listing")
    .getByRole("cell", { name: "Recibido", exact: true })
    .waitFor();
  await navigate("Inventario");
  await page.getByLabel("Buscar", { exact: true }).fill("BROWSER-P01");
  assert.match(await page.locator("#listing").innerText(), /14/);
  // Venta con descuento, persistencia al recargar, PDF y anulación.
  await navigate("Facturación");
  await page.getByLabel("Buscar producto", { exact: true }).selectOption("7");
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.keyboard.press("F2");
  assert.equal(
    await page
      .getByLabel("Código de producto / lector de barras")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page
    .getByLabel("Código de producto / lector de barras")
    .fill("BROWSER-P01");
  await page.getByLabel("Código de producto / lector de barras").press("Enter");
  await page.getByLabel("Descuento (%)", { exact: true }).fill("10");
  await page.getByLabel("Efectivo recibido (₡)", { exact: true }).fill("2000");
  await page.screenshot({ path: "test-results/caja-pos.png", fullPage: true });
  await page.getByRole("button", { name: "Emitir factura" }).click();
  await dialog().getByRole("heading", { name: "FAC-00001" }).waitFor();
  const state = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(state.products.find((p) => p.code === "BROWSER-P01").stock, 12);
  assert.equal(state.invoices[0].total, 1800);
  await page.evaluate(() => {
    window.print = () => {
      window.__printed = true;
    };
  });
  await dialog().getByRole("button", { name: "Imprimir ticket" }).click();
  await page.waitForFunction(() => window.__printed === true);
  await page.pdf({
    path: "test-results/factura.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await dialog()
    .getByLabel("Ancho del ticket", { exact: true })
    .selectOption("58");
  await page.evaluate(() => {
    window.__printed = false;
  });
  await dialog()
    .getByRole("button", { name: "Imprimir ticket", exact: true })
    .click();
  await page.waitForFunction(() => window.__printed === true);
  await page.pdf({
    path: "test-results/ticket-58.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  assert.ok(
    await page
      .locator("#print-area .receipt")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await page.screenshot({
    path: "test-results/ticket-preview.png",
    fullPage: true,
  });
  await dialog().getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Ver historial" }).click();
  await dialog().getByRole("button", { name: "Ver", exact: true }).click();
  await dialog()
    .getByRole("button", { name: "Anular factura", exact: true })
    .click();
  await dialog()
    .getByLabel("Justificación obligatoria")
    .fill("Prueba de devolución");
  await dialog().getByRole("button", { name: "Guardar", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  const after = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(after.products.find((p) => p.code === "BROWSER-P01").stock, 14);
  await navigate("Ventas guardadas");
  await page.getByLabel("Buscar", { exact: true }).fill("FAC-00001");
  await page
    .getByRole("button", { name: "Ver / reimprimir ticket", exact: true })
    .click();
  await dialog().getByText("FACTURA ANULADA", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.print = () => {
      window.__printed = true;
    };
    window.__printed = false;
  });
  await dialog()
    .getByRole("button", { name: "Imprimir ticket", exact: true })
    .click();
  await page.waitForFunction(() => window.__printed === true);
  await page.pdf({
    path: "test-results/ticket-anulado.pdf",
    preferCSSPageSize: true,
  });
  assert.equal(
    (await page.evaluate(async () => await (await fetch("/api/state")).json()))
      .invoices.length,
    1,
  );
  await dialog().getByRole("button", { name: "Cerrar", exact: true }).click();
  // Facturas de proveedores: compra directa y factura de un pedido ya recibido.
  await navigate("Facturas de compra");
  await page
    .getByRole("button", { name: "Registrar factura de compra" })
    .click();
  await dialog()
    .getByLabel("Proveedor", { exact: true })
    .selectOption({ label: "Proveedor navegador" });
  await dialog()
    .getByLabel("Número de factura del proveedor", { exact: true })
    .fill("COMPRA-DIRECTA-001");
  await dialog().getByLabel("Cantidad a agregar", { exact: true }).fill("3");
  await dialog().getByRole("button", { name: "Agregar", exact: true }).click();
  await dialog()
    .getByLabel("Costo de Producto navegador", { exact: true })
    .fill("600");
  await dialog()
    .getByLabel("Descuento de Producto navegador", { exact: true })
    .fill("10");
  await dialog()
    .getByLabel("Estado de pago", { exact: true })
    .selectOption("Pendiente");
  await dialog()
    .getByLabel("Fecha de vencimiento", { exact: true })
    .fill(after.today);
  await dialog()
    .getByRole("button", { name: "Guardar factura de compra", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  let purchaseState = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(
    purchaseState.products.find((p) => p.code === "BROWSER-P01").stock,
    17,
  );
  assert.equal(purchaseState.purchaseInvoices[0].total, 1830.6);
  await page.getByRole("button", { name: "Ver", exact: true }).click();
  await dialog()
    .getByRole("button", { name: "Imprimir / guardar PDF", exact: true })
    .click();
  await page.pdf({
    path: "test-results/factura-compra.pdf",
    format: "A4",
    printBackground: true,
  });
  await dialog()
    .getByRole("button", { name: "Marcar como pagada", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Confirmar pago completo", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Registrar factura de compra" })
    .click();
  await dialog()
    .getByLabel("Proveedor", { exact: true })
    .selectOption({ label: "Proveedor navegador" });
  await dialog()
    .getByLabel("Número de factura del proveedor", { exact: true })
    .fill("COMPRA-PEDIDO-001");
  await dialog()
    .getByLabel("Origen de la compra", { exact: true })
    .selectOption("1");
  assert.equal(
    await dialog()
      .getByLabel("Cantidad de Producto navegador", { exact: true })
      .inputValue(),
    "4",
  );
  await dialog()
    .getByRole("button", { name: "Guardar factura de compra", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  await page.reload();
  await page
    .getByRole("heading", { name: "Facturas de compra", exact: true })
    .waitFor();
  purchaseState = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(
    purchaseState.products.find((p) => p.code === "BROWSER-P01").stock,
    17,
  );
  assert.equal(purchaseState.purchaseInvoices.length, 2);
  assert.equal(purchaseState.purchaseInvoices[0].status, "Pagada");
  await page.getByLabel("Buscar", { exact: true }).fill("COMPRA-PEDIDO-001");
  assert.equal(await page.locator("#listing tbody tr").count(), 1);
  await page.screenshot({ path: "test-results/compras.png", fullPage: true });
  await navigate("Reportes");
  await page.getByLabel("Tipo de reporte").selectOption("purchase-invoices");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Facturas de compra", exact: true })
    .waitFor();
  assert.equal(await page.locator("#report-result tbody tr").count(), 2);
  const purchaseDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar Excel", exact: true })
    .click();
  await (
    await purchaseDownloadPromise
  ).saveAs("test-results/facturas-compra.xls");

  // Reporte filtrado y archivo Excel descargable.
  await navigate("Reportes");
  await page.getByLabel("Tipo de reporte").selectOption("purchases");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await page.getByRole("heading", { name: "Compras recibidas" }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar Excel" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-results/compras.xls");
  assert.equal(download.suggestedFilename(), "SIPRO-purchases.xls");
  // Usuario creado desde la interfaz y permisos visibles por rol.
  await navigate("Usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  for (const [label, value] of [
    ["Identificación", "BROWSER-U01"],
    ["Nombre", "Persona"],
    ["Apellidos", "Prueba"],
    ["Correo electrónico", "persona@example.com"],
    ["Nombre de usuario", "persona"],
    ["Contraseña", "Prueba123!"],
  ])
    await dialog().getByLabel(label, { exact: true }).fill(value);
  await dialog().getByRole("button", { name: "Guardar", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await signIn("persona", "Prueba123!");
  assert.equal(
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Usuarios", exact: true })
      .count(),
    0,
  );
  await navigate("Proveedores");
  assert.equal(
    await page.getByRole("button", { name: "Nuevo proveedor" }).count(),
    0,
  );
  await navigate("Facturas de compra");
  assert.equal(
    await page
      .getByRole("button", { name: "Registrar factura de compra" })
      .count(),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await navigate("Resumen");
  await page.screenshot({ path: "test-results/movil.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Navegador: proveedor → producto → pedido → recepción → venta → PDF → anulación → facturas de compra directa/pedido → pago → Excel → usuario y permisos → móvil: OK",
  );
} catch (error) {
  await page.screenshot({ path: "test-results/fallo.png", fullPage: true });
  console.error("Errores del navegador:", errors);
  console.error(
    "Diálogo:",
    await dialog()
      .innerText()
      .catch(() => ""),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
}
