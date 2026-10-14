import { createHash } from "node:crypto";
import { ensure, saveOrder } from "./domain.js";
import { money } from "./store.js";

// Cada faltante se asigna una sola vez. No modifica inventario ni crea pedidos.
export function recommendOrders(state) {
  const pending = new Map();
  const lastOrderBySupplier = new Map();
  for (const order of state.orders) {
    lastOrderBySupplier.set(
      order.supplierId,
      Math.max(lastOrderBySupplier.get(order.supplierId) ?? 0, order.id ?? 0),
    );
    if (order.status !== "Pendiente") continue;
    for (const line of order.items)
      pending.set(
        line.productId,
        (pending.get(line.productId) ?? 0) + line.qty,
      );
  }
  const suppliers = new Map(
    state.suppliers.filter((s) => s.active).map((s) => [s.id, s]),
  );
  const groups = new Map(),
    unassigned = [],
    unconfigured = [],
    covered = [];
  for (const product of state.products) {
    if (!product.active) continue;
    const incoming = pending.get(product.id) ?? 0;
    const item = {
      productId: product.id,
      code: product.code,
      name: product.name,
      presentation: product.presentation,
      stock: product.stock,
      minimum: product.minimum,
      pending: incoming,
      qty: Math.max(0, product.minimum - product.stock - incoming),
    };
    if (product.minimum === 0) {
      if (product.stock === 0) unconfigured.push(item);
      continue;
    }
    if (!item.qty) {
      if (product.stock < product.minimum) covered.push(item);
      continue;
    }
    // Igual costo: menor plazo de entrega; finalmente ID para un resultado estable.
    const offers = product.offers
      .filter((o) => suppliers.has(o.supplierId))
      .sort(
        (a, b) =>
          a.cost - b.cost ||
          a.delivery - b.delivery ||
          a.supplierId - b.supplierId,
      );
    if (!offers.length) {
      unassigned.push(item);
      continue;
    }
    const offer = offers[0],
      supplier = suppliers.get(offer.supplierId);
    if (!groups.has(supplier.id))
      groups.set(supplier.id, {
        supplierId: supplier.id,
        supplier: supplier.name,
        minimum: supplier.minimum,
        delivery: supplier.delivery,
        terms: supplier.terms,
        days: supplier.days,
        items: [],
      });
    groups.get(supplier.id).items.push({
      ...item,
      price: offer.cost,
      delivery: offer.delivery,
      total: money(item.qty * offer.cost),
      alternatives: offers.length - 1,
    });
  }
  const recommendations = [...groups.values()].sort(
    (a, b) => a.supplierId - b.supplierId,
  );
  for (const group of recommendations) {
    group.items.sort((a, b) => a.productId - b.productId);
    group.total = money(group.items.reduce((sum, item) => sum + item.total, 0));
    group.minimumGap = money(Math.max(0, group.minimum - group.total));
    // El token detecta cambios desde la revisión, incluidos pedidos concurrentes.
    group.token = createHash("sha256")
      .update(
        JSON.stringify([group, lastOrderBySupplier.get(group.supplierId) ?? 0]),
      )
      .digest("hex");
  }
  return { groups: recommendations, unassigned, unconfigured, covered };
}

export function saveRecommendedOrder(state, user, body) {
  const current = recommendOrders(state).groups.find(
    (g) => g.supplierId === Number(body.supplierId),
  );
  ensure(
    current &&
      typeof body.recommendationToken === "string" &&
      current.token === body.recommendationToken,
    "Los faltantes, precios o pedidos pendientes cambiaron. Vuelve a Pedidos recomendados para revisar una propuesta actualizada.",
    409,
  );
  // Se permiten cantidades editadas, artículos adicionales y líneas eliminadas.
  // Las validaciones habituales y el mínimo comercial del proveedor siguen vigentes.
  const order = saveOrder(state, user, null, body);
  order.origin = "recommended";
  return order;
}
