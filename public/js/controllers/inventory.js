import { api, isAdmin, matches, model } from "../models/app-model.js";
import {
  $,
  button,
  date,
  esc,
  field,
  filters,
  head,
  icon,
  select,
  statusBadge,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";
import { attachFilter, editForm } from "./forms.js";

export function inventoryPage() {
  const low = model.state.products.filter(
    (p) => p.active && p.stock <= p.minimum,
  ).length;
  $("#content").innerHTML = view("inventory-page-1", {
    head: head(
      "Inventario",
      "Existencias y trazabilidad de entradas y salidas.",
      isAdmin()
        ? button("＋ Registrar movimiento", "adjust-stock", "", "primary")
        : "",
    ),
    slot2: low
      ? view("inventory-page-2", { icon: icon("alert"), low: low })
      : "",
    filters: filters(
      select("level", "Nivel", [
        ["", "Todos"],
        ["low", "Bajo o agotado"],
        ["normal", "Normal"],
      ]),
    ),
    table: table(
      ["Fecha", "Producto", "Movimiento", "Saldo", "Motivo", "Usuario"],
      model.state.movements
        .slice(-50)
        .reverse()
        .map((m) =>
          tr([
            date(m.date),
            esc(m.product),
            `${m.delta > 0 ? "+" : ""}${m.delta}`,
            m.balance,
            esc(m.reason),
            esc(m.user),
          ]),
        ),
    ),
  });
  attachFilter((f) => {
    const rows = model.state.products.filter(
      (p) =>
        matches(f.search, p.code, p.name) &&
        (!f.level ||
          (f.level === "low" ? p.stock <= p.minimum : p.stock > p.minimum)),
    );
    $("#listing").innerHTML = table(
      ["Producto", "Categoría", "Existencia", "Mínimo", "Nivel", "Acciones"],
      rows.map((p) =>
        tr([
          view("inventory-page-3", {
            esc: esc(p.name),
            esc2: esc(p.code),
            esc3: esc(p.presentation),
          }),
          esc(p.category),
          p.stock,
          p.minimum,
          statusBadge(
            p.stock === 0
              ? "Agotado"
              : p.stock <= p.minimum
                ? "Bajo"
                : "Normal",
          ),
          `${button("Proveedores", "view-product", p.id, "small")} ${isAdmin() ? button("Editar mínimo", "edit-product", p.id, "small") : ""}`,
        ]),
      ),
    );
  });
}

export function adjustStock() {
  editForm(
    "Registrar movimiento de inventario",
    view("adjust-stock-1", {
      select: select(
        "productId",
        "Producto",
        model.state.products.map((p) => [
          p.id,
          `${p.name} · ${p.stock} disponibles`,
        ]),
      ),
      field: field(
        "delta",
        "Cantidad (+ entrada / − salida)",
        "",
        "number",
        'required step="1"',
      ),
      field3: field(
        "reason",
        "Motivo del movimiento",
        "",
        "text",
        'required placeholder="Por ejemplo: ajuste por conteo físico"',
      ),
    }),
    (b) => api("stock", "POST", b),
  );
}
