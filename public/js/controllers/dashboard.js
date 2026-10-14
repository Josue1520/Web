import { model } from "../models/app-model.js";
import {
  $,
  button,
  crc,
  date,
  esc,
  head,
  icon,
  idLabel,
  statusBadge,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";

export function dashboard() {
  const low = model.state.products.filter(
    (p) => p.active && p.stock <= p.minimum,
  );
  const pending = model.state.orders.filter((o) => o.status === "Pendiente");
  const sales = model.state.invoices.filter(
    (i) => i.date === model.state.today && i.status === "Emitida",
  );
  const stats = [
    [
      "Ventas de hoy",
      crc(sales.reduce((n, i) => n + i.total, 0)),
      `${sales.length} facturas emitidas`,
      "invoices",
    ],
    [
      "Pedidos pendientes",
      pending.length,
      "Por recibir de tus proveedores",
      "orders",
    ],
    [
      "Productos activos",
      model.state.products.filter((p) => p.active).length,
      "En tu catálogo unificado",
      "products",
    ],
    [
      "Existencias bajas",
      low.length,
      "Productos que necesitan atención",
      "alert",
    ],
  ];
  $("#content").innerHTML = view("dashboard-1", {
    head: head(
      "Resumen del negocio",
      `${date(model.state.today)} · Así va tu operación hoy.`,
      view("dashboard-2"),
    ),
    slot2: stats
      .map(([label, value, note, ico]) =>
        view("dashboard-3", {
          slot1: ico === "alert" ? "warn" : "",
          label: label,
          icon: icon(ico),
          value: value,
          note: note,
        }),
      )
      .join(""),
    slot3: low.length
      ? view("dashboard-4", { icon: icon("alert"), length: low.length })
      : "",
    table: table(
      ["Producto", "Disponible", "Mínimo", "Nivel"],
      low.slice(0, 5).map((p) =>
        tr([
          view("dashboard-5", {
            icon: icon("products"),
            esc: esc(p.name),
            esc3: esc(p.presentation),
          }),
          p.stock,
          p.minimum,
          statusBadge(p.stock ? "Bajo" : "Agotado"),
        ]),
      ),
      "Todo está en orden. No hay productos con existencias bajas.",
    ),
    slot5: model.state.movements
      .slice(-4)
      .reverse()
      .map((m) =>
        view("dashboard-6", {
          esc: esc(m.product),
          esc2: esc(m.reason),
          date: date(m.date),
          slot4: m.delta > 0 ? "+" : "",
          delta: m.delta,
        }),
      )
      .join(""),
    slot6: [
      ["invoices", "Registrar venta"],
      ["orders", "Crear pedido"],
      ["products", "Consultar catálogo"],
      ["reports", "Ver reportes"],
    ]
      .map(([key, label]) =>
        view("dashboard-7", { key: key, icon: icon(key), label: label }),
      )
      .join(""),
    length: pending.length,
    slot8: pending.length
      ? pending
          .slice(-4)
          .reverse()
          .map((o) =>
            view("dashboard-8", {
              esc: esc(o.supplier),
              idLabel: idLabel("PED", o.id),
              date: date(o.date),
              button: button("Ver", "view-order", o.id, "small"),
            }),
          )
          .join("")
      : view("dashboard-9"),
  });
}
