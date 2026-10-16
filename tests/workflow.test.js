import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.js";
import { openStore } from "../src/models/store.js";

let app, base, dir, token;
async function call(path, method = "GET", body, cookie = token) {
  const r = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-Sipro-Request": "1" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const type = r.headers.get("content-type");
  return {
    status: r.status,
    body: type?.startsWith("application/json")
      ? await r.json()
      : await r.text(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function login(username = "admin", password = "Admin123!") {
  return (await call("login", "POST", { username, password }, null)).cookie;
}
const supplier = {
  name: "Proveedor de prueba",
  identification: "PRUEBA-123",
  idType: "Jurídica",
  contact: "Persona de prueba",
  phone: "2661-0000",
  email: "prueba@example.com",
  address: "Puntarenas",
  terms: "Contado",
  days: 0,
  delivery: 1,
  minimum: 0,
  active: true,
};
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sipro-test-"));
  app = createApp({ dbPath: join(dir, "test.sqlite") });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  token = await login();
});
afterEach(async () => {
  await new Promise((r) => app.server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

test("autenticación, sesión cerrada y protección de datos", async () => {
  assert.equal((await call("state", "GET", null, null)).status, 401);
  assert.equal(
    (
      await call(
        "login",
        "POST",
        { username: "admin", password: "incorrecta" },
        null,
      )
    ).status,
    401,
  );
  const state = (await call("state")).body;
  assert.equal(state.me.role, "Administrador");
  assert.ok(state.users.every((u) => !("password" in u)));
  await call("logout", "POST");
  assert.equal((await call("state")).status, 401);
});
test("dependiente puede vender y pedir, pero no administrar ni recibir ni anular", async () => {
  token = await login("dependiente", "Caja123!");
  assert.deepEqual((await call("state")).body.users, []);
  for (const [path, body] of [
    ["suppliers", supplier],
    ["products", {}],
    ["users", {}],
    ["stock", { productId: 1, delta: 1, reason: "Ajuste" }],
  ])
    assert.equal((await call(path, "POST", body)).status, 403);
  const order = await call("orders", "POST", {
    supplierId: 1,
    items: [{ productId: 1, qty: 10 }],
  });
  assert.equal(order.status, 201);
  assert.equal(
    (await call(`orders/${order.body.id}/receive`, "POST")).status,
    403,
  );
  const sale = await call("invoices", "POST", {
    customer: "Prueba",
    items: [{ productId: 1, qty: 1 }],
    payment: "Tarjeta",
  });
  assert.equal(sale.status, 201);
  assert.equal(
    (await call(`invoices/${sale.body.id}/void`, "POST", { reason: "Prueba" }))
      .status,
    403,
  );
  assert.equal((await call("reports?type=profit")).status, 403);
  assert.equal((await call("reports?type=orders&format=xls")).status, 403);
  assert.equal((await call("reports?type=orders")).status, 200);
});
test("proveedores: validación, duplicados, edición y conservación histórica", async () => {
  const created = await call("suppliers", "POST", supplier);
  assert.equal(created.status, 201);
  assert.equal((await call("suppliers", "POST", supplier)).status, 400);
  assert.equal(
    (
      await call("suppliers", "POST", {
        ...supplier,
        identification: "NEW",
        email: "mal",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`suppliers/${created.body.id}`, "PUT", {
        ...supplier,
        active: false,
      })
    ).status,
    200,
  );
  assert.equal((await call("state")).body.suppliers.length, 4);
});
test("ciclo pedido → recepción → venta → anulación mantiene inventario y consecutivos", async () => {
  const initial = (await call("state")).body.products[0].stock;
  const o = (
    await call("orders", "POST", {
      supplierId: 1,
      items: [{ productId: 1, qty: 10 }],
    })
  ).body;
  assert.equal((await call("state")).body.products[0].stock, initial);
  assert.equal(
    (
      await call(`orders/${o.id}`, "PUT", {
        supplierId: 1,
        items: [{ productId: 1, qty: 12 }],
      })
    ).status,
    200,
  );
  assert.equal((await call(`orders/${o.id}/receive`, "POST")).status, 201);
  assert.equal((await call(`orders/${o.id}/receive`, "POST")).status, 400);
  assert.equal(
    (
      await call(`orders/${o.id}`, "PUT", {
        supplierId: 1,
        items: [{ productId: 1, qty: 15 }],
      })
    ).status,
    400,
  );
  assert.equal((await call("state")).body.products[0].stock, initial + 12);
  const invoice = (
    await call("invoices", "POST", {
      customer: "Cliente",
      items: [{ productId: 1, qty: 2 }],
      discount: 10,
      payment: "Efectivo",
      paid: 3000,
    })
  ).body;
  assert.equal(invoice.total, 2160);
  assert.equal(invoice.subtotal + invoice.vat, invoice.total);
  assert.equal(invoice.change, 840);
  assert.equal((await call("state")).body.products[0].stock, initial + 10);
  assert.equal(
    (await call(`invoices/${invoice.id}/void`, "POST", { reason: "" })).status,
    400,
  );
  assert.equal(
    (
      await call(`invoices/${invoice.id}/void`, "POST", {
        reason: "Devolución",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(`invoices/${invoice.id}/void`, "POST", {
        reason: "Repetición",
      })
    ).status,
    400,
  );
  const state = (await call("state")).body;
  assert.equal(state.products[0].stock, initial + 12);
  assert.equal(state.invoices[0].status, "Anulada");
  assert.deepEqual(
    state.movements.slice(-3).map((m) => m.delta),
    [12, -2, 2],
  );
  const second = (
    await call("invoices", "POST", {
      customer: "Otro",
      items: [{ productId: 1, qty: 1 }],
      payment: "SINPE",
    })
  ).body;
  assert.equal(second.id, invoice.id + 1);
});
test("ventas inválidas no alteran inventario ni generan registros parciales", async () => {
  const before = (await call("state")).body;
  for (const items of [
    [
      { productId: 1, qty: 1 },
      { productId: 2, qty: 999 },
    ],
    [{ productId: 1, qty: 0 }],
    [{ productId: 1, qty: 1.5 }],
    [
      { productId: 1, qty: 1 },
      { productId: 1, qty: 1 },
    ],
    [],
  ])
    assert.equal(
      (
        await call("invoices", "POST", {
          customer: "Prueba",
          items,
          payment: "Tarjeta",
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await call("invoices", "POST", {
        customer: "Prueba",
        items: [{ productId: 1, qty: 1 }],
        payment: "Efectivo",
        paid: 1,
      })
    ).status,
    400,
  );
  const after = (await call("state")).body;
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.movements, before.movements);
  assert.equal(after.invoices.length, 0);
});
test("ventas concurrentes no permiten existencias negativas", async () => {
  const requests = await Promise.all(
    [1, 2].map(() =>
      call("invoices", "POST", {
        customer: "Caja",
        items: [{ productId: 2, qty: 6 }],
        payment: "Tarjeta",
      }),
    ),
  );
  assert.deepEqual(requests.map((r) => r.status).sort(), [201, 400]);
  assert.equal((await call("state")).body.products[1].stock, 2);
});
test("pedidos rechazan mínimos, proveedores inactivos y productos no asociados", async () => {
  assert.equal(
    (
      await call("orders", "POST", {
        supplierId: 1,
        items: [{ productId: 1, qty: 1 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("orders", "POST", {
        supplierId: 1,
        items: [{ productId: 3, qty: 10 }],
      })
    ).status,
    400,
  );
  const s = (await call("state")).body.suppliers[0];
  await call("suppliers/1", "PUT", { ...s, active: false });
  assert.equal(
    (
      await call("orders", "POST", {
        supplierId: 1,
        items: [{ productId: 1, qty: 10 }],
      })
    ).status,
    400,
  );
});
test("productos: códigos únicos, asociaciones y movimientos iniciales", async () => {
  const p = {
    code: "NEW",
    name: "Nuevo",
    category: "Prueba",
    presentation: "Unidad",
    description: "",
    price: 500,
    cost: 200,
    tax: 0,
    stock: 10,
    minimum: 2,
    active: true,
    offers: [{ supplierId: 2, cost: 200, delivery: 1 }],
  };
  const created = await call("products", "POST", p);
  assert.equal(created.status, 201);
  assert.equal(created.body.stock, 10);
  assert.equal((await call("products", "POST", p)).status, 400);
  assert.equal(
    (
      await call(`products/${created.body.id}`, "PUT", {
        ...p,
        stock: 900,
        offers: [],
      })
    ).status,
    200,
  );
  const actual = (await call("state")).body.products.at(-1);
  assert.equal(actual.stock, 10);
  assert.deepEqual(actual.offers, []);
  assert.equal(
    (
      await call("stock", "POST", {
        productId: actual.id,
        delta: -11,
        reason: "Salida",
      })
    ).status,
    400,
  );
});
test("usuarios: último administrador, desactivación y revocación de sesión", async () => {
  const s = (await call("state")).body;
  assert.equal(
    (await call("users/1", "PUT", { ...s.users[0], active: false })).status,
    400,
  );
  const clerk = await login("dependiente", "Caja123!");
  assert.equal(
    (await call("users/2", "PUT", { ...s.users[1], active: false })).status,
    200,
  );
  assert.equal((await call("state", "GET", null, clerk)).status, 401);
});
test("reportes: fechas, compras recibidas, ventas y Excel real basado en registros", async () => {
  assert.equal((await call("reports?to=2999-01-01")).status, 400);
  assert.equal((await call("reports?from=2026-02-30")).status, 400);
  const o = (
    await call("orders", "POST", {
      supplierId: 1,
      items: [{ productId: 1, qty: 10 }],
    })
  ).body;
  assert.equal((await call("reports?type=purchases")).body.rows.length, 0);
  await call(`orders/${o.id}/receive`, "POST");
  assert.equal((await call("reports?type=purchases")).body.rows.length, 1);
  const excel = await call("reports?type=orders&format=xls");
  assert.equal(excel.status, 200);
  assert.match(excel.body, /<Workbook/);
  assert.match(excel.body, /Cerveza Imperial/);
  const sale = (
    await call("invoices", "POST", {
      customer: "Cliente",
      items: [{ productId: 1, qty: 2 }],
      payment: "Tarjeta",
    })
  ).body;
  const profit = (await call("reports?type=profit")).body.rows[0];
  assert.equal(profit[0], sale.subtotal);
  assert.equal(profit[1], 1600);
  await call(`invoices/${sale.id}/void`, "POST", { reason: "Devolución" });
  assert.deepEqual(
    (await call("reports?type=profit")).body.rows[0],
    [0, 0, 0, 0],
  );
});
test("los datos se recuperan al abrir otra conexión a la base SQLite", async () => {
  await call("suppliers", "POST", supplier);
  const reopened = openStore(join(dir, "test.sqlite"));
  assert.equal(reopened.read().suppliers.at(-1).name, supplier.name);
  reopened.close();
});
test("rechaza mutaciones de otro origen y no expone la base de datos", async () => {
  const r = await fetch(`${base}/api/stock`, {
    method: "POST",
    headers: {
      Cookie: token,
      "Content-Type": "application/json",
      "X-Sipro-Request": "1",
      Origin: "https://otro-sitio.example",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  assert.equal((await fetch(`${base}/data/sipro.sqlite`)).status, 404);
  assert.equal((await fetch(`${base}/Vistas/Facturar.html`)).status, 200);
});

async function purchaseBody(overrides = {}) {
  const s = (await call("state")).body;
  return {
    supplierId: 1,
    invoiceNumber: "PROV-001",
    date: s.today,
    status: "Pagada",
    items: [{ productId: 1, qty: 2, price: 500, tax: 13, discount: 10 }],
    ...overrides,
  };
}
test("factura de compra directa guarda importes, costos y entrada de inventario una sola vez", async () => {
  const before = (await call("state")).body;
  const b = await purchaseBody();
  const result = await call("purchase-invoices", "POST", b);
  assert.equal(result.status, 201);
  assert.equal(result.body.subtotal, 900);
  assert.equal(result.body.vat, 117);
  assert.equal(result.body.total, 1017);
  assert.equal(result.body.invoiceNumber, "PROV-001");
  assert.equal(result.body.orderId, null);
  assert.equal(result.body.inventoryReceipt.kind, "direct");
  assert.equal(result.body.inventoryReceipt.entries[0].before, before.products[0].stock);
  assert.equal(result.body.inventoryReceipt.entries[0].after, before.products[0].stock + 2);
  const after = (await call("state")).body;
  assert.equal(after.products[0].stock, before.products[0].stock + 2);
  assert.equal(after.products[0].cost, 786);
  assert.equal(after.movements.at(-1).delta, 2);
  assert.equal(
    (
      await call("purchase-invoices", "POST", {
        ...b,
        invoiceNumber: " prov-001 ",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("state")).body.products[0].stock,
    after.products[0].stock,
  );
  const secondSupplier = await purchaseBody({
    supplierId: 2,
    items: [{ productId: 3, qty: 1, price: 950, tax: 0 }],
  });
  assert.equal(
    (await call("purchase-invoices", "POST", secondSupplier)).status,
    201,
  );
});
test("factura asociada a pedido recibido no duplica existencias ni movimientos", async () => {
  const order = (
    await call("orders", "POST", {
      supplierId: 1,
      items: [{ productId: 1, qty: 10 }],
    })
  ).body;
  const b = await purchaseBody({
    orderId: order.id,
    items: [{ productId: 1, qty: 10, price: 800, tax: 13 }],
  });
  assert.equal((await call("purchase-invoices", "POST", b)).status, 400);
  await call(`orders/${order.id}/receive`, "POST");
  const before = (await call("state")).body;
  assert.equal(
    (await call("purchase-invoices", "POST", { ...b, supplierId: 2 })).status,
    400,
  );
  assert.equal(
    (
      await call("purchase-invoices", "POST", {
        ...b,
        items: [{ productId: 1, qty: 9, price: 800, tax: 13 }],
      })
    ).status,
    400,
  );
  assert.equal((await call("purchase-invoices", "POST", b)).status, 201);
  const after = (await call("state")).body;
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.movements, before.movements);
  assert.equal(
    (await call("purchase-invoices", "POST", { ...b, invoiceNumber: "OTRA" }))
      .status,
    400,
  );
});
test("compras inválidas y repetidas concurrentes no dejan datos parciales", async () => {
  const before = (await call("state")).body;
  const valid = await purchaseBody();
  for (const extra of [
    { date: "2999-01-01" },
    { date: "2026-02-30" },
    { invoiceNumber: "" },
    { status: "Inexistente" },
    { status: "Pendiente", dueDate: "" },
    { items: [] },
    {
      items: [
        { productId: 1, qty: 2, price: 500, tax: 13 },
        { productId: 1, qty: 2, price: 500, tax: 13 },
      ],
    },
    {
      items: [
        { productId: 1, qty: 2, price: 500, tax: 13 },
        { productId: 3, qty: 2, price: 900, tax: 13 },
      ],
    },
    { items: [{ productId: 1, qty: -1, price: 500, tax: 13 }] },
    { items: [{ productId: 1, qty: 1, price: -500, tax: 13 }] },
    { items: [{ productId: 1, qty: 1, price: 500, tax: 101 }] },
  ])
    assert.equal(
      (await call("purchase-invoices", "POST", { ...valid, ...extra })).status,
      400,
    );
  const after = (await call("state")).body;
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.movements, before.movements);
  assert.deepEqual(after.purchaseInvoices, []);
  const responses = await Promise.all(
    [1, 2].map(() => call("purchase-invoices", "POST", valid)),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 400]);
  assert.equal(
    (await call("state")).body.products[0].stock,
    before.products[0].stock + 2,
  );
});
test("compras a crédito: roles, vencimiento, pago y reportes filtrados", async () => {
  const s = (await call("state")).body;
  const b = await purchaseBody({ status: "Pendiente", dueDate: s.today });
  const clerk = await login("dependiente", "Caja123!");
  assert.equal((await call("purchase-invoices", "POST", b, clerk)).status, 403);
  const invoice = (await call("purchase-invoices", "POST", b)).body;
  assert.equal(
    (await call(`purchase-invoices/${invoice.id}/pay`, "POST", {}, clerk))
      .status,
    403,
  );
  assert.equal(
    (await call("reports?type=purchase-invoices&status=Pendiente")).body.rows
      .length,
    1,
  );
  assert.equal(
    (await call("reports?type=purchase-invoices&supplierId=2")).body.rows
      .length,
    0,
  );
  const excel = await call("reports?type=purchase-invoices&format=xls");
  assert.equal(excel.status, 200);
  assert.match(excel.body, /PROV-001/);
  const before = (await call("state")).body.products;
  assert.equal(
    (await call(`purchase-invoices/${invoice.id}/pay`, "POST")).status,
    201,
  );
  assert.equal(
    (await call(`purchase-invoices/${invoice.id}/pay`, "POST")).status,
    400,
  );
  assert.deepEqual((await call("state")).body.products, before);
  assert.equal(
    (await call("reports?type=purchase-invoices&status=Pendiente")).body.rows
      .length,
    0,
  );
  assert.equal(
    (
      await call(
        "reports?type=purchase-invoices&status=Pagada",
        "GET",
        null,
        clerk,
      )
    ).body.rows.length,
    1,
  );
});
test("actualizar una base anterior conserva registros y agrega facturas de compra sin reinicializar", async () => {
  await call("suppliers", "POST", supplier);
  const sale = await call("invoices", "POST", {
    customer: "Cliente anterior",
    items: [{ productId: 1, qty: 1 }],
    payment: "Tarjeta",
  });
  assert.equal(sale.status, 201);
  app.store.change((s) => {
    delete s.purchaseInvoices;
  });
  const before = (await call("state")).body;
  assert.deepEqual(before.purchaseInvoices, []);
  assert.equal(
    (await call("purchase-invoices", "POST", await purchaseBody())).status,
    201,
  );
  const reopened = openStore(join(dir, "test.sqlite"));
  const saved = reopened.read();
  reopened.close();
  assert.equal(saved.suppliers.length, 4);
  assert.equal(saved.invoices[0].customer, "Cliente anterior");
  assert.equal(saved.purchaseInvoices.length, 1);
  assert.equal(saved.products[0].stock, before.products[0].stock + 2);
});

test("pago mixto: valida antes de guardar, conserva desglose y vuelto, reparte dashboard y anula una sola venta", async () => {
  const body = {
    customer: "Cliente mixto",
    items: [{ productId: 3, qty: 2 }],
    discount: 10,
    payment: "Mixto",
    cardPaid: 500,
    sinpePaid: 800,
    paid: 2000,
  };
  const initial = (await call("state")).body;
  for (const change of [
    { cardPaid: 2500 },
    { cardPaid: -1 },
    { sinpePaid: true },
    { cardPaid: "NaN" },
    { cardPaid: 1.001 },
    { cardPaid: [] },
    { paid: 1129.99 },
    { cardPaid: 0, sinpePaid: 0 },
    { cardPaid: 2430, sinpePaid: 0 },
    { cardPaid: 1000, sinpePaid: 1430, paid: 1 },
  ]) {
    assert.equal(
      (await call("invoices", "POST", { ...body, ...change })).status,
      400,
    );
  }
  const unchanged = (await call("state")).body;
  assert.deepEqual(unchanged.products, initial.products);
  assert.deepEqual(unchanged.movements, initial.movements);
  assert.equal(unchanged.invoices.length, 0);
  const response = await call("invoices", "POST", body);
  assert.equal(response.status, 201);
  const invoice = response.body;
  assert.equal(invoice.total, 2430);
  assert.equal(invoice.paid, 3300);
  assert.equal(invoice.change, 870);
  assert.deepEqual(invoice.payments, [
    { method: "Efectivo", amount: 1130 },
    { method: "Tarjeta", amount: 500 },
    { method: "SINPE", amount: 800 },
  ]);
  const state = (await call("state")).body;
  assert.equal(
    state.products.find((p) => p.id === 3).stock,
    initial.products.find((p) => p.id === 3).stock - 2,
  );
  const persisted = openStore(join(dir, "test.sqlite"));
  assert.deepEqual(persisted.read().invoices[0].payments, invoice.payments);
  persisted.close();
  const dashboard = (await call("dashboard?period=day")).body;
  assert.equal(dashboard.selected.count, 1);
  assert.deepEqual(
    dashboard.payments.map((p) => p.total),
    [1130, 500, 800],
  );
  assert.equal(
    dashboard.payments.reduce((sum, p) => sum + p.total, 0),
    2430,
  );
  const report = (await call("reports?type=sales")).body;
  assert.deepEqual(report.rows[0].slice(-4), ["Mixto", 1130, 500, 800]);
  assert.equal(
    (
      await call(`invoices/${invoice.id}/void`, "POST", {
        reason: "Prueba de devolución",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(`invoices/${invoice.id}/void`, "POST", {
        reason: "No duplicar",
      })
    ).status,
    400,
  );
  assert.deepEqual(
    (await call("dashboard?period=day")).body.payments.map((p) => p.total),
    [0, 0, 0],
  );
  assert.equal(
    (await call("state")).body.products.find((p) => p.id === 3).stock,
    initial.products.find((p) => p.id === 3).stock,
  );
});

test("pago mixto: efectivo+tarjeta, tarjeta+SINPE sin efectivo y centavos exactos", async () => {
  const body = {
    customer: "Cliente",
    items: [{ productId: 3, qty: 1 }],
    payment: "Mixto",
  };
  const cashCard = await call("invoices", "POST", {
    ...body,
    cardPaid: 350,
    paid: 1000,
  });
  assert.equal(cashCard.status, 201);
  assert.deepEqual(cashCard.body.payments, [
    { method: "Efectivo", amount: 1000 },
    { method: "Tarjeta", amount: 350 },
  ]);
  assert.equal(cashCard.body.change, 0);
  const digital = await call("invoices", "POST", {
    ...body,
    cardPaid: 350,
    sinpePaid: 1000,
    paid: 0,
  });
  assert.equal(digital.status, 201);
  assert.equal(digital.body.paid, 1350);
  assert.equal(digital.body.change, 0);
  assert.deepEqual(digital.body.payments, [
    { method: "Tarjeta", amount: 350 },
    { method: "SINPE", amount: 1000 },
  ]);
  app.store.change((s) => {
    s.products.find((p) => p.id === 3).price = 0.3;
  });
  const cents = await call("invoices", "POST", {
    ...body,
    cardPaid: 0.1,
    sinpePaid: 0.2,
    paid: 0,
  });
  assert.equal(cents.status, 201);
  assert.equal(cents.body.change, 0);
  assert.equal(cents.body.total, 0.3);
});
