import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createApp } from "../server.js";
import { today } from "../src/models/store.js";

const directory = mkdtempSync(join(tmpdir(), "sipro-dashboard-"));
const { server, store } = createApp({ dbPath: join(directory, "test.sqlite") });
const shift = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const monday = shift(
  today(),
  1 - (new Date(`${today()}T12:00:00Z`).getUTCDay() || 7) - 7,
);
const anchor = shift(monday, 2);
// Datos exclusivos de esta base temporal; nunca se agregan ventas a la instalación.
store.change((s) => {
  s.started = shift(monday, -10);
  s.products[0].name = "Arroz <especial> & familiar";
  s.products[0].offers = [
    { supplierId: 1, cost: 10 },
    { supplierId: 2, cost: 11 },
  ];
  s.products[1].name = "Café de prueba";
  s.products[1].offers = [{ supplierId: 2, cost: 20 }];
  s.invoices = [
    [0, 90, "Efectivo", 1, 2],
    [1, 200, "Tarjeta", 2, 1],
    [2, 50, "SINPE", 1, 1],
    [6, 60, "Efectivo", 2, 3],
    [2, 999, "Tarjeta", 2, 100],
  ].map(([offset, total, payment, productId, qty], index) => ({
    id: index + 1,
    date: shift(monday, offset),
    total,
    payment,
    issuedAt: `${shift(monday, offset)}T18:00:00.000Z`,
    subtotal: total,
    paid: total + 1000,
    change: 1000,
    vat: 0,
    status: index === 4 ? "Anulada" : "Emitida",
    items: [
      {
        productId,
        name: s.products[productId - 1].name,
        code: "TEST",
        qty,
        cost: 5,
        total,
      },
    ],
  }));
});
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
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !message.text().includes("401 (Unauthorized)")
  )
    errors.push(message.text());
});
const money = (value) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(value);
const ready = () =>
  page.locator('#sales-dashboard[aria-busy="false"]').waitFor();
const change = async (action) => {
  const response = page.waitForResponse((r) =>
    r.url().includes("/api/dashboard?"),
  );
  await action();
  assert.equal((await response).status(), 200);
  await ready();
};
const rankingReady = () =>
  page.locator('#dashboard-product-ranking[aria-busy="false"]').waitFor();
const consultRanking = async () => {
  const response = page.waitForResponse((r) =>
    r.url().includes("/api/dashboard/products?"),
  );
  await page
    .getByRole("button", { name: "Consultar Top 10", exact: true })
    .click();
  assert.equal((await response).status(), 200);
  await rankingReady();
};
const total = async (value) =>
  assert.equal(
    await page.locator("#dashboard-selected-total").innerText(),
    money(value),
  );
mkdirSync("test-results", { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await ready();
  await total(0);
  await change(() => page.getByLabel("Fecha de referencia").fill(anchor));
  await total(400);
  for (const [key, value] of [
    ["cash", 150],
    ["card", 200],
    ["sinpe", 50],
  ]) {
    assert.equal(
      await page.locator(`[data-payment="${key}"] strong`).innerText(),
      money(value),
    );
  }
  await rankingReady();
  await page.getByLabel("Desde · Top 10", { exact: true }).fill(monday);
  await page
    .getByLabel("Hasta · Top 10", { exact: true })
    .fill(shift(monday, 6));
  await consultRanking();
  const ranking = page.locator("#dashboard-top-products");
  assert.match(
    await ranking.getByRole("row").nth(1).innerText(),
    /Café de prueba\s+.*4/,
  );
  assert.equal(
    await ranking.locator("especial").count(),
    0,
    "el nombre se escapa como texto",
  );
  assert.match(await ranking.innerText(), /Arroz <especial> & familiar/);
  assert.equal(await ranking.locator(".dashboard-product").count(), 2);
  await page
    .locator("#dashboard-product-ranking")
    .screenshot({ path: "test-results/top10-general.png" });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/dashboard-ventas.png",
    fullPage: true,
  });
  await change(() =>
    page.getByRole("checkbox", { name: "Martes", exact: true }).uncheck(),
  );
  await total(200);
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Martes", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await change(() =>
    page.getByRole("checkbox", { name: "Domingo", exact: true }).uncheck(),
  );
  await total(140);
  assert.equal(
    await page.locator('[data-sales-metric="week"] strong').innerText(),
    money(400),
    "tarjeta superior conserva la semana completa",
  );
  await page.getByLabel("Vista del Top 10", { exact: true }).selectOption("1");
  await consultRanking();
  await total(140);
  assert.equal(await ranking.locator(".dashboard-product").count(), 1);
  assert.doesNotMatch(await ranking.innerText(), /Café de prueba/);
  assert.match(
    await page.locator(".dashboard-ranking-summary").innerText(),
    /140,00/,
  );
  await page
    .locator("#dashboard-product-ranking")
    .screenshot({ path: "test-results/top10-proveedor.png" });
  await page.getByLabel("Vista del Top 10", { exact: true }).selectOption("3");
  await consultRanking();
  assert.match(await ranking.innerText(), /No hay artículos vendidos/);
  await page.getByLabel("Vista del Top 10", { exact: true }).selectOption("");
  await consultRanking();
  await change(() =>
    page.getByRole("button", { name: "Lunes a viernes", exact: true }).click(),
  );
  await total(340);
  await change(() =>
    page.getByRole("button", { name: "Fin de semana", exact: true }).click(),
  );
  await total(60);
  await change(() =>
    page.getByRole("button", { name: "Día", exact: true }).click(),
  );
  await total(50);
  await change(() =>
    page.getByRole("button", { name: "Mes", exact: true }).click(),
  );
  await total(
    store
      .read()
      .invoices.filter(
        (i) =>
          i.status === "Emitida" && i.date.slice(0, 7) === anchor.slice(0, 7),
      )
      .reduce((sum, i) => sum + i.total, 0),
  );
  await change(() => page.locator('[data-chart-day="1"]').click());
  await total(90);
  await change(() =>
    page.getByRole("checkbox", { name: "Lunes", exact: true }).uncheck(),
  );
  await total(0);
  await page
    .getByText("No hay días disponibles seleccionados.", { exact: false })
    .waitFor();
  assert.equal(
    await ranking.locator(".dashboard-product").count(),
    2,
    "Top 10 no cambia al quitar días del filtro general",
  );
  await change(() =>
    page.getByRole("button", { name: "Toda la semana", exact: true }).click(),
  );
  await total(400);
  // Rangos propios del Top 10: mismo día, rango sin ventas y error visible.
  await page.getByLabel("Desde · Top 10", { exact: true }).fill(anchor);
  await page.getByLabel("Hasta · Top 10", { exact: true }).fill(anchor);
  await consultRanking();
  assert.equal(await ranking.locator(".dashboard-product").count(), 1);
  assert.match(
    await page.locator(".dashboard-ranking-summary").innerText(),
    /50,00/,
  );
  await total(400);
  await page
    .getByLabel("Desde · Top 10", { exact: true })
    .fill(shift(monday, 3));
  await page
    .getByRole("button", { name: "Consultar Top 10", exact: true })
    .click();
  assert.match(await page.locator("#ranking-error").innerText(), /posterior/);
  await page
    .getByLabel("Hasta · Top 10", { exact: true })
    .fill(shift(monday, 3));
  await consultRanking();
  assert.match(await ranking.innerText(), /No hay artículos vendidos/);
  await page.getByLabel("Desde · Top 10", { exact: true }).fill(monday);
  await page
    .getByLabel("Hasta · Top 10", { exact: true })
    .fill(shift(monday, 6));
  await consultRanking();
  await page.getByLabel("Mostrar ventas semanales en").selectOption("units");
  assert.match(
    await page
      .locator('[data-chart-day="1"] .dashboard-bar-amount')
      .innerText(),
    /^2$/,
  );
  await page.getByLabel("Horas que deseas visualizar").selectOption("night");
  assert.equal(
    await page
      .locator(".dashboard-hourly .dashboard-x-label")
      .first()
      .textContent(),
    "18:00",
  );
  await change(() =>
    page.getByRole("button", { name: "Rango", exact: true }).click(),
  );
  await page.getByLabel("Desde · Ventas y pagos", { exact: true }).fill(monday);
  await page.getByLabel("Hasta · Ventas y pagos", { exact: true }).fill(anchor);
  await change(() =>
    page
      .getByRole("button", { name: "Consultar ventas y pagos", exact: true })
      .click(),
  );
  await total(340);
  assert.equal(await ranking.locator(".dashboard-product").count(), 2);
  await change(() =>
    page.getByRole("button", { name: "Semana", exact: true }).click(),
  );
  await total(400);
  await page.getByLabel("Mostrar ventas semanales en").selectOption("total");
  await page.getByLabel("Horas que deseas visualizar").selectOption("24");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "sin desbordamiento horizontal en móvil",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/dashboard-ventas-movil.png",
    fullPage: true,
  });
  // Una respuesta lenta no puede sobrescribir el filtro más reciente.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const intercepted = new Promise((resolve) => {
    entered = resolve;
  });
  const delayedDay = async (route) => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get("period") === "day") {
      entered();
      await gate;
    }
    await route.fulfill({ response });
  };
  await page.route("**/api/dashboard?*", delayedDay);
  await page.getByRole("button", { name: "Día", exact: true }).click();
  await intercepted;
  await change(() =>
    page.getByRole("button", { name: "Semana", exact: true }).click(),
  );
  await total(400);
  const finished = page.waitForResponse(
    (r) =>
      r.url().includes("/api/dashboard?") &&
      new URL(r.url()).searchParams.get("period") === "day",
  );
  release();
  await (await finished).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await total(400);
  await page.unroute("**/api/dashboard?*", delayedDay);
  // La respuesta de un proveedor anterior no puede reemplazar el ranking actual.
  let releaseRanking, enteredRanking;
  const rankingGate = new Promise((resolve) => {
    releaseRanking = resolve;
  });
  const rankingIntercepted = new Promise((resolve) => {
    enteredRanking = resolve;
  });
  const delayedRanking = async (route) => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get("supplierId") === "1") {
      enteredRanking();
      await rankingGate;
    }
    await route.fulfill({ response });
  };
  await page.route("**/api/dashboard/products?*", delayedRanking);
  await page.getByLabel("Vista del Top 10", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Consultar Top 10", exact: true })
    .click();
  await rankingIntercepted;
  await page.getByLabel("Vista del Top 10", { exact: true }).selectOption("");
  await consultRanking();
  const oldRankingFinished = page.waitForResponse(
    (r) =>
      r.url().includes("/api/dashboard/products?") &&
      new URL(r.url()).searchParams.get("supplierId") === "1",
  );
  releaseRanking();
  await (await oldRankingFinished).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(await ranking.locator(".dashboard-product").count(), 2);
  await page.unroute("**/api/dashboard/products?*", delayedRanking);
  await page.getByRole("button", { name: "Ver Top 10", exact: true }).click();
  assert.equal(
    await page
      .locator("#top-products-title")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  // Al recargar vuelve a consultar ventas guardadas, sin perder datos.
  await page.reload();
  await ready();
  await change(() => page.getByLabel("Fecha de referencia").fill(anchor));
  await total(400);
  assert.deepEqual(errors, []);
  console.log(
    "Navegador dashboard: períodos → pagos sin vuelto → rankings por catálogo → días → gráfico → cero ventas → móvil → respuestas concurrentes → persistencia: OK",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/dashboard-fallo.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
