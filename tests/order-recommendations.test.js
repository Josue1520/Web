import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recommendOrders,
  saveRecommendedOrder,
} from "../src/models/order-recommendations.js";
import { createApp } from "../server.js";
import { openStore } from "../src/models/store.js";

const product = (id, extra = {}) => ({
  id,
  name: `Producto ${id}`,
  code: `P-${id}`,
  presentation: "Unidad",
  stock: 2,
  minimum: 10,
  active: true,
  cost: 80,
  price: 120,
  tax: 13,
  offers: [
    { supplierId: 1, cost: 100, delivery: 2 },
    { supplierId: 2, cost: 90, delivery: 3 },
  ],
  ...extra,
});
const state = () => ({
  suppliers: [
    {
      id: 1,
      name: "Proveedor uno",
      minimum: 0,
      active: true,
      delivery: 2,
      days: 0,
      terms: "Contado",
    },
    {
      id: 2,
      name: "Proveedor dos",
      minimum: 0,
      active: true,
      delivery: 3,
      days: 15,
      terms: "Crédito",
    },
    { id: 3, name: "Inactivo", minimum: 0, active: false, delivery: 1 },
  ],
  products: [product(1)],
  orders: [],
  movements: [],
});
const user = { username: "dependiente", role: "Dependiente" };

test("no repite la confirmación aunque se hayan sustituido todos los artículos sugeridos", () => {
  const s = state();
  s.products.push(product(2, { stock: 100 }));
  const group = recommendOrders(s).groups[0];
  const body = {
    supplierId: 2,
    recommendationToken: group.token,
    items: [{ productId: 2, qty: 1 }],
  };
  saveRecommendedOrder(s, user, body);
  assert.throws(
    () => saveRecommendedOrder(s, user, body),
    (error) => error.status === 409,
  );
  assert.equal(s.orders.length, 1);
  assert.equal(recommendOrders(s).groups[0].items[0].qty, 8);
});

test("más de 100 faltantes permiten preparar lotes sin perder los productos restantes", () => {
  const s = state();
  s.products = Array.from({ length: 120 }, (_, i) => product(i + 1));
  const group = recommendOrders(s).groups[0];
  assert.equal(group.items.length, 120);
  saveRecommendedOrder(s, user, {
    supplierId: 2,
    recommendationToken: group.token,
    items: group.items
      .slice(0, 100)
      .map((p) => ({ productId: p.productId, qty: p.qty })),
  });
  const next = recommendOrders(s);
  assert.equal(next.groups[0].items.length, 20);
  assert.equal(next.groups[0].items[0].productId, 101);
  assert.equal(next.covered.length, 100);
});

test("faltantes: resta pendientes de todos los proveedores y omite recibidos, iguales al mínimo e inactivos", () => {
  const s = state();
  s.products.push(
    product(2, { stock: 10 }),
    product(3, { stock: 20 }),
    product(4, { active: false }),
  );
  s.orders = [
    { status: "Pendiente", supplierId: 1, items: [{ productId: 1, qty: 2 }] },
    { status: "Pendiente", supplierId: 2, items: [{ productId: 1, qty: 1 }] },
    { status: "Recibido", supplierId: 2, items: [{ productId: 1, qty: 50 }] },
  ];
  const original = structuredClone(s);
  const result = recommendOrders(s);
  assert.deepEqual(s, original, "consultar no escribe ni reordena el catálogo");
  assert.equal(result.groups.length, 1);
  const group = result.groups[0];
  assert.equal(group.supplierId, 2);
  assert.equal(group.items.length, 1);
  assert.equal(group.items[0].pending, 3);
  assert.equal(group.items[0].qty, 5);
  assert.equal(group.total, 450);
});

test("asigna una sola vez al menor costo activo y desempata por entrega e ID", () => {
  const s = state();
  s.products = [
    product(1, {
      offers: [
        { supplierId: 3, cost: 1, delivery: 0 },
        { supplierId: 2, cost: 90, delivery: 3 },
        { supplierId: 1, cost: 90, delivery: 2 },
      ],
    }),
  ];
  assert.equal(recommendOrders(s).groups[0].supplierId, 1);
  s.products[0].offers[2].delivery = 3;
  assert.equal(recommendOrders(s).groups[0].supplierId, 1);
  s.products[0].offers[1].cost = 89.99;
  const group = recommendOrders(s).groups[0];
  assert.equal(group.supplierId, 2);
  assert.equal(group.total, 719.92);
  assert.equal(group.items[0].alternatives, 1);
});

test("explica faltantes sin proveedor, agotados sin mínimo y necesidades cubiertas por pedidos", () => {
  const s = state();
  s.products = [
    product(1, { offers: [] }),
    product(2, { offers: [{ supplierId: 3, cost: 1, delivery: 0 }] }),
    product(3, { stock: 0, minimum: 0 }),
    product(4, { stock: 1, minimum: 0 }),
    product(5),
  ];
  s.orders = [{ status: "Pendiente", items: [{ productId: 5, qty: 12 }] }];
  const result = recommendOrders(s);
  assert.equal(result.groups.length, 0);
  assert.deepEqual(
    result.unassigned.map((p) => p.productId),
    [1, 2],
  );
  assert.deepEqual(
    result.unconfigured.map((p) => p.productId),
    [3],
  );
  assert.deepEqual(
    result.covered.map((p) => p.productId),
    [5],
  );
  assert.equal(result.covered[0].qty, 0);
});

test("avisa el mínimo comercial sin inflar cantidades; deja ajustar el borrador y conserva inventario", () => {
  const s = state();
  s.suppliers[1].minimum = 1000;
  const proposal = recommendOrders(s).groups[0];
  assert.equal(proposal.items[0].qty, 8);
  assert.equal(proposal.minimumGap, 280);
  const body = {
    supplierId: 2,
    recommendationToken: proposal.token,
    items: [{ productId: 1, qty: 8 }],
  };
  assert.throws(() => saveRecommendedOrder(s, user, body), /pedido mínimo/);
  assert.equal(s.orders.length, 0);
  const order = saveRecommendedOrder(s, user, {
    ...body,
    items: [{ productId: 1, qty: 12 }],
  });
  assert.equal(order.total, 1080);
  assert.equal(order.origin, "recommended");
  assert.equal(order.status, "Pendiente");
  assert.equal(s.products[0].stock, 2);
  assert.deepEqual(s.movements, []);
  assert.equal(recommendOrders(s).groups.length, 0);
});

test("una propuesta caducada por inventario, costos, mínimos o pedidos se rechaza sin guardar", () => {
  for (const change of [
    (s) => {
      s.products[0].stock++;
    },
    (s) => {
      s.products[0].minimum++;
    },
    (s) => {
      s.products[0].offers[1].cost++;
    },
    (s) => {
      s.suppliers[1].active = false;
    },
    (s) => {
      s.orders.push({ status: "Pendiente", items: [{ productId: 1, qty: 1 }] });
    },
  ]) {
    const s = state(),
      group = recommendOrders(s).groups[0];
    change(s);
    const before = structuredClone(s);
    assert.throws(
      () =>
        saveRecommendedOrder(s, user, {
          supplierId: group.supplierId,
          recommendationToken: group.token,
          items: [{ productId: 1, qty: 8 }],
        }),
      (error) => error.status === 409,
    );
    assert.deepEqual(s, before);
  }
});

test("API: requiere sesión, dependiente revisa/edita, dos confirmaciones crean solo un pedido y persiste", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sipro-recommendations-"));
  const dbPath = join(directory, "test.sqlite");
  const { server, store } = createApp({ dbPath });
  let closed = false;
  try {
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}/api/`;
    assert.equal((await fetch(base + "orders/recommendations")).status, 401);
    assert.equal(
      (
        await fetch(base + "orders/recommendations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Sipro-Request": "1",
          },
          body: "{}",
        })
      ).status,
      401,
    );
    const login = await fetch(base + "login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sipro-Request": "1" },
      body: JSON.stringify({ username: "dependiente", password: "Caja123!" }),
    });
    const headers = {
      Cookie: login.headers.get("set-cookie").split(";")[0],
      "Content-Type": "application/json",
      "X-Sipro-Request": "1",
    };
    const before = store.read();
    const preview = await (
      await fetch(base + "orders/recommendations", { headers })
    ).json();
    assert.deepEqual(store.read(), before);
    const group = preview.groups.find((g) => g.supplierId === 2);
    assert.equal(group.items[0].qty, 4);
    const body = {
      supplierId: 2,
      recommendationToken: group.token,
      items: [{ productId: 3, qty: 3 }],
      notes: "Ajustado por caja",
    };
    const results = await Promise.all(
      [1, 2].map(() =>
        fetch(base + "orders/recommendations", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const after = store.read();
    assert.equal(after.orders.length, 1);
    assert.equal(after.orders[0].items[0].qty, 3);
    assert.equal(after.orders[0].notes, "Ajustado por caja");
    assert.deepEqual(after.products, before.products);
    assert.deepEqual(after.movements, before.movements);
    const next = await (
      await fetch(base + "orders/recommendations", { headers })
    ).json();
    assert.equal(next.groups.find((g) => g.supplierId === 2).items[0].qty, 1);
    const edit = await fetch(base + "orders/1", {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...body, items: [{ productId: 3, qty: 4 }] }),
    });
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).origin, "recommended");
    const denied = await fetch(base + "orders/1/receive", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(denied.status, 403);
    await new Promise((r) => server.close(r));
    closed = true;
    const reopened = openStore(dbPath);
    try {
      assert.equal(reopened.read().orders[0].origin, "recommended");
      assert.equal(reopened.read().orders[0].items[0].qty, 4);
      assert.equal(
        recommendOrders(reopened.read()).groups.some((g) => g.supplierId === 2),
        false,
      );
    } finally {
      reopened.close();
    }
  } finally {
    if (!closed) await new Promise((r) => server.close(r));
    await rm(directory, { recursive: true, force: true });
  }
});
