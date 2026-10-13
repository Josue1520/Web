import { hashPassword, money, today } from "./store.js";
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const ensure = (condition, message, status = 400) => {
  if (!condition) throw new AppError(message, status);
};
const text = (value, label, required = true) => {
  ensure(typeof value === "string", `${label}: introduce texto válido.`);
  const s = value.trim();
  ensure(
    (!required || s.length > 0) && s.length <= 500,
    `${label}: revisa el campo (máximo 500 caracteres).`,
  );
  return s;
};
const number = (v, label, min = 0, max = 100000000, integer = false) => {
  ensure(
    v !== "" && v !== null && v !== undefined && typeof v !== "boolean",
    `${label}: introduce un número.`,
  );
  const n = Number(v);
  ensure(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isSafeInteger(n)),
    `${label}: valor fuera de rango.`,
  );
  return n;
};
const active = (value) => {
  ensure(typeof value === "boolean", "Estado inválido.");
  return value;
};
const email = (value) => {
  const s = text(value, "Correo");
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "Correo electrónico inválido.");
  return s;
};
const next = (list) => Math.max(0, ...list.map((x) => x.id)) + 1;
export const find = (list, id) => {
  const x = list.find((x) => x.id === Number(id));
  ensure(x, "Registro no encontrado.", 404);
  return x;
};
export const admin = (user) =>
  ensure(
    user.role === "Administrador",
    "Esta operación requiere el rol Administrador.",
    403,
  );
export const publicUser = ({ password, ...user }) => user;
export function snapshot(s, user) {
  return {
    ...s,
    users: user.role === "Administrador" ? s.users.map(publicUser) : [],
    me: publicUser(user),
    today: today(),
  };
}
function unique(list, field, value, id) {
  ensure(
    !list.some(
      (x) =>
        x.id !== id &&
        String(x[field]).toLowerCase() === String(value).toLowerCase(),
    ),
    `Ya existe un registro con ${field === "code" ? "ese código" : field === "username" ? "ese usuario" : "esa identificación"}.`,
  );
}
function movement(s, p, delta, reason, user) {
  ensure(
    Number.isSafeInteger(p.stock + delta) && p.stock + delta >= 0,
    `Existencia insuficiente para ${p.name}.`,
  );
  p.stock += delta;
  s.movements.push({
    id: next(s.movements),
    productId: p.id,
    product: p.name,
    date: today(),
    delta,
    balance: p.stock,
    reason,
    user: user.username,
  });
}
export function saveEntity(s, user, kind, id, b) {
  admin(user);
  ensure(
    ["suppliers", "products", "users"].includes(kind),
    "Entidad inválida.",
    404,
  );
  const list = s[kind],
    old = id ? find(list, id) : null;
  const entityId = old?.id ?? next(list);
  let row;
  if (kind === "suppliers") {
    const identification =
      old?.identification ?? text(b.identification, "Identificación");
    unique(list, "identification", identification, entityId);
    ensure(
      ["Física", "Jurídica", "DIMEX"].includes(b.idType),
      "Tipo de identificación inválido.",
    );
    row = {
      id: entityId,
      name: text(b.name, "Razón social"),
      identification,
      idType: old?.idType ?? b.idType,
      contact: text(b.contact, "Contacto"),
      phone: text(b.phone, "Teléfono"),
      email: email(b.email),
      address: text(b.address, "Dirección"),
      terms: text(b.terms, "Condición de pago"),
      days: number(b.days, "Plazo de pago", 0, 365, true),
      delivery: number(b.delivery, "Plazo de entrega", 0, 365, true),
      minimum: money(number(b.minimum, "Pedido mínimo")),
      active: active(b.active),
    };
  } else if (kind === "products") {
    const code = text(b.code, "Código");
    unique(list, "code", code, entityId);
    ensure(
      Array.isArray(b.offers) && b.offers.length <= 30,
      "Lista de proveedores inválida.",
    );
    const offers = b.offers.map((o) => ({
      supplierId: find(s.suppliers, o.supplierId).id,
      cost: money(number(o.cost, "Precio de compra", 0.01)),
      delivery: number(o.delivery, "Entrega", 0, 365, true),
    }));
    ensure(
      new Set(offers.map((o) => o.supplierId)).size === offers.length,
      "No repitas proveedores asociados.",
    );
    row = {
      id: entityId,
      code,
      name: text(b.name, "Nombre"),
      category: text(b.category, "Categoría"),
      presentation: text(b.presentation, "Presentación"),
      description: text(b.description ?? "", "Descripción", false),
      price: money(number(b.price, "Precio de venta", 0.01)),
      tax: number(b.tax, "IVA", 0, 100),
      cost: old?.cost ?? money(number(b.cost, "Costo inicial")),
      stock: old?.stock ?? 0,
      minimum: number(b.minimum, "Stock mínimo", 0, 1000000, true),
      active: active(b.active),
      offers,
    };
    if (!old)
      movement(
        s,
        row,
        number(b.stock, "Existencia inicial", 0, 1000000, true),
        "Existencia inicial",
        user,
      );
  } else {
    const identification =
      old?.identification ?? text(b.identification, "Identificación");
    const username = text(b.username, "Usuario");
    unique(list, "identification", identification, entityId);
    unique(list, "username", username, entityId);
    ensure(["Administrador", "Dependiente"].includes(b.role), "Rol inválido.");
    let password = old?.password;
    if (!old || b.password) {
      const plain = text(b.password, "Contraseña");
      ensure(
        plain.length >= 8,
        "La contraseña debe tener al menos 8 caracteres.",
      );
      password = hashPassword(plain);
    }
    row = {
      id: entityId,
      identification,
      username,
      name: text(b.name, "Nombre"),
      surname: text(b.surname, "Apellidos"),
      email: email(b.email),
      role: b.role,
      active: active(b.active),
      password,
    };
    if (
      old?.role === "Administrador" &&
      old.active &&
      (!row.active || row.role !== "Administrador")
    )
      ensure(
        list.some(
          (u) => u.id !== entityId && u.active && u.role === "Administrador",
        ),
        "Debe permanecer al menos un administrador activo.",
      );
  }
  if (old) list[list.indexOf(old)] = row;
  else list.push(row);
  return kind === "users" ? publicUser(row) : row;
}
export function adjustStock(s, user, b) {
  admin(user);
  const p = find(s.products, b.productId);
  const delta = number(b.delta, "Movimiento", -1000000, 1000000, true);
  ensure(delta !== 0, "La cantidad del movimiento no puede ser cero.");
  movement(s, p, delta, text(b.reason, "Motivo"), user);
  return p;
}
function lines(s, items, supplier) {
  ensure(
    Array.isArray(items) && items.length > 0 && items.length <= 100,
    "Agrega entre 1 y 100 productos.",
  );
  ensure(
    new Set(items.map((i) => Number(i.productId))).size === items.length,
    "Hay productos repetidos; agrúpalos en una línea.",
  );
  return items.map((i) => {
    const p = find(s.products, i.productId);
    ensure(p.active, `${p.name} está inactivo.`);
    const qty = number(i.qty, "Cantidad", 1, 1000000, true);
    const offer = supplier
      ? p.offers.find((o) => o.supplierId === supplier.id)
      : null;
    if (supplier) ensure(offer, `${p.name} no está asociado al proveedor.`);
    else ensure(p.stock >= qty, `Existencia insuficiente para ${p.name}.`);
    const price = supplier ? offer.cost : p.price;
    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      qty,
      price,
      cost: p.cost,
      tax: p.tax,
      total: money(qty * price),
    };
  });
}
export function saveOrder(s, user, id, b) {
  const old = id ? find(s.orders, id) : null;
  if (old)
    ensure(
      old.status === "Pendiente",
      "Solo se pueden modificar pedidos pendientes.",
    );
  const supplier = find(s.suppliers, b.supplierId);
  ensure(supplier.active, "El proveedor está inactivo.");
  const items = lines(s, b.items, supplier),
    total = money(items.reduce((sum, l) => sum + l.total, 0));
  ensure(
    total >= supplier.minimum,
    `El pedido mínimo del proveedor es ₡${supplier.minimum}.`,
  );
  const row = {
    id: old?.id ?? next(s.orders),
    supplierId: supplier.id,
    supplier: supplier.name,
    items,
    total,
    date: old?.date ?? today(),
    status: "Pendiente",
    notes: text(b.notes ?? "", "Observaciones", false),
    user: old?.user ?? user.username,
  };
  if (old) s.orders[s.orders.indexOf(old)] = row;
  else s.orders.push(row);
  return row;
}
export function receiveOrder(s, user, id) {
  admin(user);
  const o = find(s.orders, id);
  ensure(o.status === "Pendiente", "El pedido ya fue recibido.");
  for (const line of o.items) {
    const p = find(s.products, line.productId);
    p.cost = money(
      (p.stock * p.cost + line.qty * line.price) / (p.stock + line.qty),
    );
    movement(s, p, line.qty, `Recepción de pedido PED-${o.id}`, user);
  }
  o.status = "Recibido";
  o.received = today();
  return o;
}
export function createInvoice(s, user, b) {
  const items = lines(s, b.items);
  const discount = number(b.discount ?? 0, "Descuento", 0, 100);
  for (const line of items) {
    line.gross = line.total;
    line.discount = money((line.gross * discount) / 100);
    line.total = money(line.gross - line.discount);
    line.net = money(line.total / (1 + line.tax / 100));
    line.vat = money(line.total - line.net);
  }
  const total = money(items.reduce((sum, l) => sum + l.total, 0));
  const payment = text(b.payment, "Medio de pago");
  ensure(
    ["Efectivo", "Tarjeta", "SINPE"].includes(payment),
    "Medio de pago inválido.",
  );
  const paid =
    payment === "Efectivo" ? money(number(b.paid, "Monto recibido")) : total;
  ensure(paid >= total, "El monto recibido no cubre la factura.");
  const invoice = {
    id: next(s.invoices),
    date: today(),
    customer: text(b.customer, "Cliente"),
    identification: text(b.identification ?? "", "Identificación", false),
    notes: text(b.notes ?? "", "Observaciones", false),
    items,
    discount,
    total,
    subtotal: money(items.reduce((sum, l) => sum + l.net, 0)),
    vat: money(items.reduce((sum, l) => sum + l.vat, 0)),
    payment,
    paid,
    change: money(paid - total),
    status: "Emitida",
    user: user.username,
  };
  for (const l of items)
    movement(
      s,
      find(s.products, l.productId),
      -l.qty,
      `Venta FAC-${invoice.id}`,
      user,
    );
  s.invoices.push(invoice);
  return invoice;
}
export function voidInvoice(s, user, id, b) {
  admin(user);
  const invoice = find(s.invoices, id);
  ensure(invoice.status === "Emitida", "La factura ya está anulada.");
  const reason = text(b.reason, "Justificación");
  for (const l of invoice.items) {
    const p = find(s.products, l.productId);
    p.cost = money((p.stock * p.cost + l.qty * l.cost) / (p.stock + l.qty));
    movement(s, p, l.qty, `Anulación FAC-${id}: ${reason}`, user);
  }
  invoice.status = "Anulada";
  invoice.reason = reason;
  invoice.voidDate = today();
  invoice.voidUser = user.username;
  return invoice;
}
export function report(s, user, query) {
  const type = query.get("type") || "orders";
  ensure(
    [
      "orders",
      "purchases",
      "requested",
      "inventory",
      "sales",
      "profit",
    ].includes(type),
    "Reporte inválido.",
  );
  if (["profit", "inventory"].includes(type)) admin(user);
  const from = query.get("from") || s.started,
    to = query.get("to") || today();
  const validDate = (v) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  ensure(
    validDate(from) &&
      validDate(to) &&
      from >= s.started &&
      to <= today() &&
      from <= to,
    `El período debe estar entre ${s.started} y ${today()}.`,
  );
  const within = (v) => v >= from && v <= to;
  const supplierId = query.get("supplierId"),
    status = query.get("status");
  const orders = s.orders.filter(
    (o) =>
      within(type === "purchases" ? (o.received ?? o.date) : o.date) &&
      (!supplierId || String(o.supplierId) === supplierId) &&
      (!status || o.status === status),
  );
  let columns, rows, title;
  if (type === "inventory") {
    title = "Inventario actual";
    columns = [
      "Código",
      "Producto",
      "Categoría",
      "Presentación",
      "Existencia",
      "Mínimo",
      "Nivel",
    ];
    rows = s.products.map((p) => [
      p.code,
      p.name,
      p.category,
      p.presentation,
      p.stock,
      p.minimum,
      p.stock === 0 ? "Agotado" : p.stock <= p.minimum ? "Bajo" : "Normal",
    ]);
  } else if (["orders", "purchases", "requested"].includes(type)) {
    title = {
      orders: "Pedidos",
      purchases: "Compras recibidas",
      requested: "Productos solicitados",
    }[type];
    columns = [
      "Pedido",
      "Fecha",
      "Proveedor",
      "Código",
      "Producto",
      "Cantidad",
      "Costo unitario",
      "Total de línea",
      "Estado",
      "Recepción",
    ];
    rows = orders
      .filter((o) => type !== "purchases" || o.status === "Recibido")
      .flatMap((o) =>
        o.items.map((l) => [
          `PED-${o.id}`,
          o.date,
          o.supplier,
          l.code,
          l.name,
          l.qty,
          l.price,
          l.total,
          o.status,
          o.received ?? "—",
        ]),
      );
  } else {
    const invoices = s.invoices.filter((i) => within(i.date));
    if (type === "profit") {
      title = "Utilidad bruta estimada";
      columns = [
        "Ingresos sin IVA",
        "Costo de productos vendidos",
        "Utilidad bruta",
        "Margen (%)",
      ];
      const valid = invoices.filter((i) => i.status === "Emitida");
      const income = money(valid.reduce((sum, i) => sum + i.subtotal, 0));
      const cost = money(
        valid.reduce(
          (sum, i) => sum + i.items.reduce((sum, l) => sum + l.cost * l.qty, 0),
          0,
        ),
      );
      rows = [
        [
          income,
          cost,
          money(income - cost),
          income ? money(((income - cost) * 100) / income) : 0,
        ],
      ];
    } else {
      title = "Facturas de venta";
      columns = [
        "Factura",
        "Fecha",
        "Cliente",
        "Subtotal sin IVA",
        "IVA",
        "Total",
        "Estado",
      ];
      rows = invoices
        .filter((i) => !status || i.status === status)
        .map((i) => [
          `FAC-${i.id}`,
          i.date,
          i.customer,
          i.subtotal,
          i.vat,
          i.total,
          i.status,
        ]);
    }
  }
  return { type, title, from, to, columns, rows };
}
