import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { salesDashboard, dashboardProducts } from "../src/models/dashboard.js";
import { createApp } from "../server.js";

const sale = (
  date,
  total,
  payment = "Efectivo",
  productId = 1,
  qty = 1,
  extra = {},
) => ({
  date,
  total,
  payment,
  paid: total + 10,
  change: 10,
  vat: Math.round(((total * 13) / 113) * 100) / 100,
  status: "Emitida",
  items: [
    {
      productId,
      name: `Producto ${productId}`,
      code: `P${productId}`,
      qty,
      total,
    },
  ],
  ...extra,
});
const fixture = () => ({
  started: "2026-09-01",
  products: [
    {
      id: 1,
      name: "Arroz",
      code: "A01",
      active: true,
      offers: [{ supplierId: 1 }, { supplierId: 2 }],
    },
    {
      id: 2,
      name: "Café",
      code: "C01",
      active: false,
      offers: [{ supplierId: 2 }],
    },
  ],
  suppliers: [
    { id: 1, name: "Proveedor A" },
    { id: 2, name: "Proveedor B" },
    { id: 3, name: "Sin ventas" },
  ],
  invoices: [
    sale("2026-10-05", 90, "Efectivo", 1, 2),
    sale("2026-10-06", 200, "Tarjeta", 2),
    sale("2026-10-07", 50, "SINPE"),
    sale("2026-10-11", 60, "Efectivo", 2, 3),
    sale("2026-10-12", 100),
    sale("2026-09-30", 80, "Tarjeta"),
    sale("2026-10-07", 999, "Tarjeta", 2, 100, { status: "Anulada" }),
    sale("2026-10-15", 888),
  ],
});
const calculate = (options = {}, state = fixture()) =>
  salesDashboard(
    state,
    new URLSearchParams({ date: "2026-10-07", ...options }),
    "2026-10-14",
  );

test("dashboard: día, semana y mes calendario excluyen anuladas y fechas futuras", () => {
  const state = fixture(),
    before = structuredClone(state);
  const result = calculate({}, state);
  assert.equal(result.summaries.day.total, 50);
  assert.equal(result.summaries.week.total, 400);
  assert.equal(result.summaries.month.total, 500);
  assert.equal(result.summaries.week.from, "2026-10-05");
  assert.equal(result.summaries.week.to, "2026-10-11");
  assert.equal(result.summaries.month.to, "2026-10-31");
  assert.equal(result.selected.count, 4);
  assert.equal(result.selected.units, 7);
  assert.equal(result.selected.averageTicket, 100);
  assert.equal(result.selected.dailyAverage, 57.14);
  assert.equal(result.eligibleDays, 7);
  assert.deepEqual(
    result.week.days.map((day) => day.total),
    [90, 200, 50, 0, 0, 0, 60],
  );
  assert.deepEqual(state, before);
});

test("dashboard: días elegidos filtran todos los detalles, pero no los indicadores completos", () => {
  const result = calculate({ days: "1,3" });
  assert.equal(result.selected.total, 140);
  assert.equal(result.selected.units, 3);
  assert.equal(result.selected.dailyAverage, 70);
  assert.equal(result.selected.averageTicket, 70);
  assert.equal(result.eligibleDays, 2);
  assert.equal(result.summaries.week.total, 400);
  assert.deepEqual(
    result.payments.map((p) => p.total),
    [90, 0, 50],
  );
  assert.equal(result.topProducts.length, 1);
  assert.equal(result.topProducts[0].units, 3);
  assert.equal(calculate({ days: "", period: "week" }).selected.total, 0);
  assert.equal(calculate({ days: "", period: "week" }).eligibleDays, 0);
  assert.equal(calculate({ days: "", period: "day" }).selected.total, 50);
  assert.equal(calculate({ days: "1", period: "month" }).selected.total, 500);
});

test("dashboard: medios de pago cuentan ventas netas de descuentos, no efectivo entregado ni vuelto", () => {
  const result = calculate();
  assert.deepEqual(
    result.payments.map((p) => [p.name, p.total, p.count]),
    [
      ["Efectivo", 150, 2],
      ["Tarjeta", 200, 1],
      ["SINPE", 50, 1],
    ],
  );
  assert.equal(
    result.payments.reduce((sum, p) => sum + p.total, 0),
    result.selected.total,
  );
  assert.equal(
    result.payments.reduce((sum, p) => sum + p.share, 0),
    100,
  );
  const empty = calculate({ date: "2026-10-08", period: "day" });
  assert.equal(empty.selected.averageTicket, 0);
  assert.ok(empty.payments.every((p) => p.share === 0));
});

test("dashboard: ranking por unidades incluye productos ahora inactivos y catálogos compartidos sin duplicar el total general", () => {
  const result = calculate();
  assert.deepEqual(
    result.topProducts.map((p) => [p.name, p.units, p.total]),
    [
      ["Café", 4, 260],
      ["Arroz", 3, 140],
    ],
  );
  assert.deepEqual(
    result.supplierRanking.map((s) => [s.supplierId, s.units, s.total]),
    [
      [2, 7, 400],
      [1, 3, 140],
    ],
  );
  const filtered = calculate({ supplierId: "1" });
  assert.equal(filtered.selected.total, 400);
  assert.deepEqual(
    filtered.supplierRanking[0].products.map((p) => p.name),
    ["Arroz"],
  );
  assert.equal(calculate({ supplierId: "3" }).supplierRanking.length, 0);
  const state = fixture();
  state.products[0].offers = [];
  const changed = calculate({}, state);
  assert.equal(changed.selected.total, 400);
  assert.equal(changed.supplierRanking.length, 1);
  assert.equal(changed.supplierRanking[0].total, 260);
});

test("dashboard: límites de año, febrero bisiesto y días disponibles sin promediar el futuro", () => {
  const state = fixture();
  state.started = "2023-12-01";
  state.invoices = [
    sale("2023-12-31", 10),
    sale("2024-01-01", 20),
    sale("2024-02-28", 30),
    sale("2024-02-29", 40),
  ];
  let result = salesDashboard(
    state,
    new URLSearchParams({ date: "2023-12-31" }),
    "2024-03-01",
  );
  assert.equal(result.week.from, "2023-12-25");
  assert.equal(result.week.to, "2023-12-31");
  assert.equal(result.selected.total, 10);
  result = salesDashboard(
    state,
    new URLSearchParams({ date: "2024-02-29", period: "month" }),
    "2024-03-01",
  );
  assert.equal(result.to, "2024-02-29");
  assert.equal(result.selected.total, 70);
  assert.equal(result.eligibleDays, 29);
  result = calculate({ date: "2026-10-14" });
  assert.equal(result.eligibleDays, 3);
  assert.equal(result.selected.dailyAverage, 33.33);
  assert.deepEqual(
    result.week.days.map((day) => day.available),
    [true, true, true, false, false, false, false],
  );
});

test("dashboard: valida fecha real, período, proveedor y selección de días", () => {
  for (const options of [
    { date: "2026-02-30" },
    { date: "2026-10-15" },
    { date: "2025-01-01" },
    { date: "x" },
    { period: "year" },
    { supplierId: "999" },
    { days: "8" },
    { days: "1,1" },
    { days: "1,,2" },
  ]) {
    assert.throws(
      () => calculate(options),
      (error) => error.status === 400,
    );
  }
});

test("dashboard API: sesión requerida, ambos roles consultan y anular una venta elimina sus métricas", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sipro-dashboard-"));
  const { server } = createApp({ dbPath: join(directory, "test.sqlite") });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/`;
    const login = async (username, password) => {
      const response = await fetch(base + "login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sipro-Request": "1" },
        body: JSON.stringify({ username, password }),
      });
      return {
        Cookie: response.headers.get("set-cookie").split(";")[0],
        "Content-Type": "application/json",
        "X-Sipro-Request": "1",
      };
    };
    assert.equal((await fetch(base + "dashboard")).status, 401);
    assert.equal((await fetch(base + "dashboard/products")).status, 401);
    const admin = await login("admin", "Admin123!");
    const response = await fetch(base + "invoices", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        items: [{ productId: 3, qty: 2 }],
        customer: "Cliente",
        discount: 10,
        payment: "Efectivo",
        paid: 5000,
      }),
    });
    assert.equal(response.status, 201);
    const invoice = await response.json();
    assert.equal(invoice.total, 2430);
    assert.equal(invoice.change, 2570);
    const employee = await login("dependiente", "Caja123!");
    const result = await (
      await fetch(base + "dashboard?period=day", { headers: employee })
    ).json();
    assert.equal(result.selected.total, 2430);
    assert.equal(result.payments[0].total, 2430);
    assert.equal(result.topProducts[0].units, 2);
    assert.equal(result.supplierRanking[0].supplierId, 2);
    assert.equal(Object.hasOwn(result.annual.months[0], "profit"), false);
    const adminDashboard = await (
      await fetch(base + "dashboard", { headers: admin })
    ).json();
    assert.equal(
      Object.hasOwn(adminDashboard.annual.months[0], "profit"),
      true,
    );
    const ranking = await (
      await fetch(base + "dashboard/products", { headers: employee })
    ).json();
    assert.equal(ranking.products[0].units, 2);
    assert.equal(ranking.total, 2430);
    assert.equal(
      (await fetch(base + "dashboard?days=9", { headers: employee })).status,
      400,
    );
    const voided = await fetch(base + `invoices/${invoice.id}/void`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ reason: "Prueba de anulación" }),
    });
    assert.equal(voided.status, 201);
    const after = await (
      await fetch(base + "dashboard", { headers: admin })
    ).json();
    assert.equal(after.selected.total, 0);
    assert.equal(after.topProducts.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("Top 10: mes actual por defecto, fechas inclusivas y proveedor sin duplicar el general", () => {
  const state = fixture();
  const rank = (filters = {}) =>
    dashboardProducts(state, new URLSearchParams(filters), "2026-10-14");
  assert.equal(rank().from, "2026-10-01");
  assert.equal(rank().to, "2026-10-14");
  assert.equal(rank().total, 500);
  const general = rank({ from: "2026-10-05", to: "2026-10-11" });
  assert.equal(general.total, 400);
  assert.equal(general.units, 7);
  assert.equal(general.products[0].name, "Café");
  const supplier = rank({
    from: "2026-10-05",
    to: "2026-10-11",
    supplierId: "1",
  });
  assert.equal(supplier.total, 140);
  assert.equal(supplier.units, 3);
  assert.equal(supplier.products.length, 1);
  assert.equal(supplier.products[0].share, 100);
  assert.equal(
    rank({ from: "2026-10-05", to: "2026-10-11", supplierId: "2" }).total,
    400,
  );
  assert.equal(rank({ from: "2026-10-07", to: "2026-10-07" }).total, 50);
  assert.equal(
    rank({ from: "2026-10-08", to: "2026-10-08" }).products.length,
    0,
  );
  assert.equal(rank({ supplierId: "3" }).products.length, 0);
});

test("Top 10: diez filas, empates deterministas y porcentaje sobre todos los artículos", () => {
  const state = fixture();
  state.invoices = [];
  state.products = [];
  for (let id = 1; id <= 12; id++) {
    state.products.push({
      id,
      name: `Producto ${id}`,
      code: `P${id}`,
      offers: [{ supplierId: 1 }, { supplierId: 2 }],
    });
    state.invoices.push(sale("2026-10-07", 10, "Efectivo", id, 1));
  }
  const result = dashboardProducts(state, new URLSearchParams(), "2026-10-14");
  assert.equal(result.productCount, 12);
  assert.equal(result.products.length, 10);
  assert.equal(result.units, 12);
  assert.equal(result.otherUnits, 2);
  assert.deepEqual(
    result.products.map((p) => p.productId),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.ok(Math.abs(result.products[0].share - 100 / 12) < 1e-10);
});

test("Top 10: rechaza rangos invertidos, fechas inexistentes, futuras y proveedores ajenos", () => {
  for (const filter of [
    { from: "2026-10-10", to: "2026-10-01" },
    { from: "2026-02-30" },
    { to: "2026-10-15" },
    { from: "2026-08-31" },
    { supplierId: "999" },
    { supplierId: "x" },
  ])
    assert.throws(
      () =>
        dashboardProducts(fixture(), new URLSearchParams(filter), "2026-10-14"),
      (e) => e.status === 400,
    );
});

test("Dashboard: rango personalizado, año mensual y utilidad con costos históricos y pérdidas", () => {
  const state = fixture();
  state.invoices = [
    sale("2026-09-30", 113, "Efectivo", 1, 1, {
      subtotal: 100,
      items: [{ productId: 1, qty: 1, total: 113, cost: 120 }],
    }),
    sale("2026-10-01", 226, "Tarjeta", 1, 2, {
      subtotal: 200,
      items: [{ productId: 1, qty: 2, total: 226, cost: 50 }],
    }),
  ];
  const options = new URLSearchParams({
    date: "2026-10-07",
    period: "range",
    from: "2026-09-30",
    to: "2026-10-01",
    days: "",
  });
  const result = salesDashboard(state, options, "2026-10-14", {
    includeProfit: true,
  });
  assert.equal(result.selected.total, 339);
  assert.equal(result.eligibleDays, 2);
  assert.equal(result.summaries.year.total, 339);
  assert.equal(result.annual.months.length, 12);
  assert.equal(result.annual.months[8].profit, -20);
  assert.equal(result.annual.months[9].profit, 100);
  assert.equal(result.annual.months[10].available, false);
  assert.equal(result.week.days[0].units, 0);
  delete state.invoices[1].items[0].cost;
  assert.equal(
    salesDashboard(state, options, "2026-10-14", { includeProfit: true }).annual
      .months[9].profit,
    null,
  );
  assert.throws(
    () =>
      salesDashboard(
        state,
        new URLSearchParams({ year: "2027" }),
        "2026-10-14",
      ),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      salesDashboard(
        state,
        new URLSearchParams({
          period: "range",
          from: "2026-10-10",
          to: "2026-10-01",
        }),
        "2026-10-14",
      ),
    (e) => e.status === 400,
  );
});

test("Dashboard: horas de Costa Rica, facturas sin hora y unidades de la semana", () => {
  const state = fixture();
  state.invoices = [
    sale("2026-10-07", 10, "Efectivo", 1, 3, {
      issuedAt: "2026-10-07T06:15:00.000Z",
    }),
    sale("2026-10-07", 20, "SINPE", 2, 4, {
      issuedAt: "2026-10-08T05:59:00.000Z",
    }),
    sale("2026-10-07", 30),
    sale("2026-10-07", 40, "Tarjeta", 1, 1, { issuedAt: "invalid" }),
    sale("2026-10-07", 999, "Tarjeta", 1, 1, {
      status: "Anulada",
      issuedAt: "2026-10-07T06:00:00.000Z",
    }),
  ];
  const result = calculate({ period: "day" }, state);
  assert.equal(result.hourly.hours[0].count, 1);
  assert.equal(result.hourly.hours[23].total, 20);
  assert.equal(result.hourly.unknownTime, 2);
  assert.equal(
    result.hourly.hours.reduce((sum, h) => sum + h.count, 0) +
      result.hourly.unknownTime,
    result.selected.count,
  );
  assert.equal(result.week.days[2].units, 9);
});
