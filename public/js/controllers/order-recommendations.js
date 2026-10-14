import { api, model } from "../models/app-model.js";
import { $, crc, esc, select, table, tr } from "../views/components.js";
import { openDialog } from "../views/feedback.js";
import { view } from "../views/template.js";
import { editOrder } from "./orders.js";

export async function recommendedOrders() {
  openDialog(
    "Pedidos recomendados por proveedor",
    view("recommendations-loading"),
  );
  const container = $("#recommendations-content");
  try {
    const recommendations = await api("orders/recommendations");
    // El editor normal utiliza el catálogo de la sesión: actualizarlo también.
    model.state = await api("state");
    if (!container.isConnected || !$("#modal").open) return;
    container.innerHTML = view("recommendations-overview", {
      supplierFilter: select(
        "recommendedSupplier",
        "Filtrar recomendaciones por proveedor",
        [
          ["", "Todos los proveedores recomendados"],
          ...recommendations.groups.map((g) => [g.supplierId, g.supplier]),
        ],
      ),
      exceptions: exceptionViews(recommendations),
    });
    const filter = $('[name="recommendedSupplier"]', container);
    const paint = () => {
      const groups = recommendations.groups.filter(
        (g) => !filter.value || String(g.supplierId) === filter.value,
      );
      $("#recommendation-groups", container).innerHTML = groups.length
        ? groups.map(groupView).join("")
        : view("recommendations-empty");
    };
    filter.onchange = paint;
    paint();
    $("#recalculate-recommendations", container).onclick = recommendedOrders;
    container.onclick = (event) => {
      const button = event.target.closest("[data-recommended-supplier]");
      if (!button) return;
      const group = recommendations.groups.find(
        (g) => g.supplierId === Number(button.dataset.recommendedSupplier),
      );
      if (group) editOrder(null, group);
    };
  } catch (error) {
    if (!container.isConnected) return;
    container.innerHTML = view("recommendations-error", {
      message: esc(error.message),
    });
    $("#recalculate-recommendations", container).onclick = recommendedOrders;
  }
}

function groupView(group) {
  return view("recommendation-supplier", {
    supplier: esc(group.supplier),
    supplierId: group.supplierId,
    productCount: `${group.items.length} ${group.items.length === 1 ? "producto" : "productos"}`,
    total: crc(group.total),
    minimum: crc(group.minimum),
    lines: table(
      [
        "Producto",
        "Existencia",
        "Mínimo",
        "Por recibir",
        "Cantidad sugerida",
        "Costo unitario",
        "Total",
      ],
      group.items.map((item) =>
        tr([
          view("recommendation-product", {
            name: esc(item.name),
            code: esc(item.code),
            presentation: esc(item.presentation),
          }),
          item.stock,
          item.minimum,
          item.pending,
          item.qty,
          crc(item.price),
          crc(item.total),
        ]),
      ),
    ),
    minimumNotice:
      group.minimumGap > 0
        ? view("recommendation-minimum", { gap: crc(group.minimumGap) })
        : "",
    batchNotice: group.items.length > 100 ? view("recommendation-batch") : "",
  });
}

function exceptionViews({ unassigned, unconfigured, covered }) {
  return [
    unassigned.length
      ? view("recommendation-exceptions", {
          title: "Faltantes sin proveedor activo",
          explanation:
            "Asocia estos productos con un proveedor activo y su costo de compra en Productos. No se incluyeron en ningún pedido recomendado.",
          lines: table(
            [
              "Producto",
              "Existencia",
              "Mínimo",
              "Por recibir",
              "Cantidad faltante",
            ],
            unassigned.map((p) =>
              tr([esc(p.name), p.stock, p.minimum, p.pending, p.qty]),
            ),
          ),
        })
      : "",
    unconfigured.length
      ? view("recommendation-exceptions", {
          title: "Productos agotados sin mínimo configurado",
          explanation:
            "Define un mínimo mayor que cero en Productos para calcular cuánto reponer. Un mínimo de cero no genera una compra automática.",
          lines: table(
            ["Producto", "Código", "Por recibir"],
            unconfigured.map((p) => tr([esc(p.name), esc(p.code), p.pending])),
          ),
        })
      : "",
    covered.length
      ? view("recommendation-exceptions", {
          title: "Faltantes cubiertos por pedidos pendientes",
          explanation:
            "Ya hay cantidades suficientes por recibir para llegar al mínimo. No se propone comprarlas otra vez.",
          lines: table(
            ["Producto", "Existencia", "Mínimo", "Por recibir"],
            covered.map((p) =>
              tr([esc(p.name), p.stock, p.minimum, p.pending]),
            ),
          ),
        })
      : "",
  ].join("");
}
