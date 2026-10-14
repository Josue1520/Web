import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createApp } from "../server.js";

const directory = mkdtempSync(join(tmpdir(), "sipro-browser-recommendations-"));
const { server, store } = createApp({ dbPath: join(directory, "test.sqlite") });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  ...(process.env.SIPRO_CHROMIUM
    ? { executablePath: process.env.SIPRO_CHROMIUM }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const dialog = () => page.getByRole("dialog");
const openRecommendations = async () => {
  await page
    .getByRole("button", { name: "Pedidos recomendados", exact: true })
    .click();
  await dialog().getByLabel("Filtrar recomendaciones por proveedor").waitFor();
};
const chooseSupplier = async (id) => {
  await dialog()
    .getByLabel("Filtrar recomendaciones por proveedor")
    .selectOption(String(id));
  await dialog().locator(`[data-recommended-supplier="${id}"]`).click();
  await dialog()
    .getByRole("heading", { name: "Preparar pedido recomendado" })
    .waitFor();
};
mkdirSync("test-results", { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Pedidos", exact: true })
    .click();
  await openRecommendations();
  assert.equal(
    await dialog().locator("[data-recommended-supplier]").count(),
    2,
  );
  const rice = dialog().getByRole("row").filter({ hasText: "Arroz Tío Pelón" });
  assert.deepEqual(
    (await rice.getByRole("cell").allTextContents())
      .slice(1, 5)
      .map((s) => s.trim()),
    ["6", "10", "0", "4"],
  );
  await page.screenshot({
    path: "test-results/pedidos-recomendados.png",
    fullPage: true,
  });
  await chooseSupplier(2);
  assert.equal(
    await dialog().getByLabel("Proveedor", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await dialog()
      .getByLabel("Cantidad de Arroz Tío Pelón", { exact: true })
      .inputValue(),
    "4",
  );
  assert.equal(store.read().orders.length, 0, "preparar no guarda");
  assert.equal(
    await dialog().locator("#order-minimum-warning").isVisible(),
    false,
  );
  // El borrador se puede ajustar y revisar sin modificar existencias.
  await dialog()
    .getByLabel("Cantidad de Arroz Tío Pelón", { exact: true })
    .fill("3");
  await dialog()
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await dialog().getByRole("button", { name: "Volver a editar" }).click();
  assert.equal(
    await dialog()
      .getByLabel("Cantidad de Arroz Tío Pelón", { exact: true })
      .inputValue(),
    "3",
  );
  await dialog()
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(store.read().orders.length, 1);
  assert.equal(store.read().orders[0].items[0].qty, 3);
  assert.equal(store.read().products[2].stock, 6);
  await page.reload();
  await openRecommendations();
  assert.deepEqual(
    (
      await dialog()
        .getByRole("row")
        .filter({ hasText: "Arroz Tío Pelón" })
        .getByRole("cell")
        .allTextContents()
    )
      .slice(1, 5)
      .map((s) => s.trim()),
    ["6", "10", "3", "1"],
  );
  await chooseSupplier(2);
  // Simula una entrada realizada por otra sesión mientras este borrador está abierto.
  store.change((s) => {
    s.products[2].stock = 7;
  });
  await dialog()
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await dialog().getByRole("alert").filter({ hasText: "cambiaron" }).waitFor();
  assert.equal(store.read().orders.length, 1);
  await dialog()
    .getByRole("button", { name: "Recalcular recomendación" })
    .click();
  await dialog()
    .getByRole("heading", {
      name: "Faltantes cubiertos por pedidos pendientes",
    })
    .waitFor();
  assert.equal(
    await dialog().locator('[data-recommended-supplier="2"]').count(),
    0,
  );
  await dialog().getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .locator("#listing")
    .getByRole("button", { name: "Ver", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Confirmar recepción completa" })
    .click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(store.read().products[2].stock, 10);
  assert.equal(store.read().orders[0].status, "Recibido");
  // Mínimo comercial y productos que requieren configuración, visibles también en móvil.
  store.change((s) => {
    s.suppliers[2].minimum = 50000;
    s.products[0].stock = 0;
    s.products[0].minimum = 0;
    s.products[1].stock = 0;
    s.products[1].offers = [];
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openRecommendations();
  await dialog()
    .getByRole("heading", { name: "Faltantes sin proveedor activo" })
    .waitFor();
  await dialog()
    .getByRole("heading", { name: "Productos agotados sin mínimo configurado" })
    .waitFor();
  await dialog()
    .getByText("para alcanzar el monto mínimo del proveedor", { exact: false })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/pedidos-recomendados-movil.png",
    fullPage: true,
  });
  await chooseSupplier(3);
  await dialog().locator("#order-minimum-warning").waitFor();
  await dialog()
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await dialog()
    .getByRole("alert")
    .filter({ hasText: "pedido mínimo" })
    .waitFor();
  assert.equal(store.read().orders.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Navegador pedidos recomendados: faltantes → proveedor → borrador editable → guardar → descontar pendientes → propuesta caducada → recepción → mínimos y móvil: OK",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/recomendaciones-fallo.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
