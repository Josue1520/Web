import {
  $,
  button,
  crc,
  date,
  esc,
  field,
  filters,
  head,
  idLabel,
  select,
  statusBadge,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";
import { api, isAdmin, matches, model } from "../models/app-model.js";
import { attachFilter } from "./forms.js";
import { openDialog, toast } from "../views/feedback.js";
import { reload } from "./application.js";
import { recommendedOrders } from "./order-recommendations.js";

export function ordersPage() {
  $("#content").innerHTML = view("orders-page-1", {
    head: head(
      "Pedidos a proveedores",
      "Prepara tus compras y registra su recepción.",
      view("orders-actions", {
        recommended: button(
          "Pedidos recomendados",
          "recommended-orders",
          "",
          "primary",
        ),
        manual: button("＋ Nuevo pedido", "edit-order"),
      }),
    ),
    filters: filters(
      select("status", "Estado", [["", "Todos"], "Pendiente", "Recibido"]) +
        select("supplier", "Proveedor", [
          ["", "Todos"],
          ...model.state.suppliers.map((s) => [s.id, s.name]),
        ]) +
        field(
          "from",
          "Desde",
          "",
          "date",
          `min="${model.state.started}" max="${model.state.today}"`,
        ) +
        field(
          "to",
          "Hasta",
          "",
          "date",
          `min="${model.state.started}" max="${model.state.today}"`,
        ),
    ),
  });
  attachFilter((f) => {
    const rows = model.state.orders.filter(
      (o) =>
        matches(f.search, idLabel("PED", o.id), o.supplier) &&
        (!f.status || o.status === f.status) &&
        (!f.supplier || String(o.supplierId) === f.supplier) &&
        (!f.from || o.date >= f.from) &&
        (!f.to || o.date <= f.to),
    );
    $("#listing").innerHTML = table(
      ["Pedido", "Proveedor", "Fecha", "Total", "Estado", "Acciones"],
      rows
        .slice()
        .reverse()
        .map((o) =>
          tr([
            view("order-reference", {
              reference: idLabel("PED", o.id),
              origin: o.origin === "recommended" ? "Recomendado" : "Manual",
            }),
            esc(o.supplier),
            date(o.date),
            crc(o.total),
            statusBadge(o.status),
            view("orders-page-2", {
              button: button("Ver", "view-order", o.id, "small"),
              slot2:
                o.status === "Pendiente"
                  ? button("Editar", "edit-order", o.id, "small")
                  : "",
            }),
          ]),
        ),
      "Aún no hay pedidos. Crea uno para comenzar a abastecer tu negocio.",
    );
  });
}

export function editOrder(id, recommendation = null) {
  const order = model.state.orders.find((o) => o.id === Number(id));
  let supplierId =
    order?.supplierId ??
    recommendation?.supplierId ??
    model.state.suppliers.find((s) => s.active)?.id;
  let items = order
    ? order.items.map((l) => ({ productId: l.productId, qty: l.qty }))
    : (recommendation?.items ?? [])
        .slice(0, 100)
        .map((l) => ({ productId: l.productId, qty: l.qty }));
  openDialog(
    order
      ? `Editar ${idLabel("PED", order.id)}`
      : recommendation
        ? "Preparar pedido recomendado"
        : "Nuevo pedido a proveedor",
    view("edit-order-1", {
      select: select(
        "supplierId",
        "Proveedor",
        model.state.suppliers
          .filter((s) => s.active)
          .map((s) => [s.id, s.name]),
        supplierId,
        recommendation ? "required disabled" : "required",
      ),
      recommendationNotice: recommendation
        ? view("recommended-draft-notice")
        : "",
      field: field(
        "notes",
        "Observaciones",
        order?.notes ??
          (recommendation
            ? "Pedido recomendado para completar mínimos, descontando cantidades pendientes de recibir."
            : ""),
      ),
      button: button("Cancelar", "close"),
    }),
  );
  const form = $("#order-form");
  function paint() {
    const s = model.state.suppliers.find((s) => s.id === Number(supplierId));
    $("#order-terms").textContent = s
      ? `${s.terms} · Plazo de pago: ${s.days} días · Entrega: ${s.delivery} días · Pedido mínimo: ${crc(s.minimum)}`
      : "Primero registra un proveedor activo.";
    const products = model.state.products.filter(
      (p) =>
        p.active && p.offers.some((o) => o.supplierId === Number(supplierId)),
    );
    $("#order-picker").innerHTML = view("edit-order-2", {
      select: select(
        "productId",
        "Producto",
        products.map((p) => [
          p.id,
          `${p.name} · ${crc(p.offers.find((o) => o.supplierId === Number(supplierId)).cost)}`,
        ]),
      ),
      field: field("qty", "Cantidad", 1, "number", 'min="1" step="1"'),
    });
    let total = 0;
    $("#order-lines").innerHTML =
      table(
        ["Producto", "Cantidad", "Costo unitario", "Total", ""],
        items.map((l, i) => {
          const p = model.state.products.find((p) => p.id === l.productId),
            cost =
              p.offers.find((o) => o.supplierId === Number(supplierId))?.cost ??
              0;
          total += cost * l.qty;
          return tr([
            esc(p.name),
            view("edit-order-3", { esc: esc(p.name), qty: l.qty, i: i }),
            crc(cost),
            crc(cost * l.qty),
            view("edit-order-4", { i: i, esc: esc(p.name) }),
          ]);
        }),
      ) + view("edit-order-5", { crc: crc(total) });
    total = Math.round((total + Number.EPSILON) * 100) / 100;
    $("#order-minimum-message").textContent =
      s && total < s.minimum
        ? `Faltan ${crc(s.minimum - total)} para el pedido mínimo de este proveedor. Ajusta las cantidades o agrega productos antes de guardarlo.`
        : "";
    $("#order-minimum-warning").hidden = !$("#order-minimum-message")
      .textContent;
    $("#add-order-line").onclick = () => {
      const productId = Number($('[name="productId"]', form).value),
        qty = Number($('[name="qty"]', form).value);
      if (!productId || !Number.isSafeInteger(qty) || qty < 1)
        return ($(".error", form).textContent =
          "Selecciona un producto y una cantidad entera mayor que cero.");
      const line = items.find((l) => l.productId === productId);
      if (line) line.qty += qty;
      else items.push({ productId, qty });
      $(".error", form).textContent = "";
      paint();
    };
    $("#order-lines").onchange = (e) => {
      if (e.target.dataset.orderLine !== undefined) {
        const qty = Number(e.target.value);
        if (Number.isSafeInteger(qty) && qty > 0)
          items[Number(e.target.dataset.orderLine)].qty = qty;
        paint();
      }
    };
    $("#order-lines").onclick = (e) => {
      const b = e.target.closest("[data-remove-order]");
      if (b) {
        items.splice(Number(b.dataset.removeOrder), 1);
        paint();
      }
    };
  }
  $('[name="supplierId"]', form).onchange = (e) => {
    supplierId = Number(e.target.value);
    items = [];
    paint();
  };
  paint();
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!items.length)
      return ($(".error", form).textContent =
        "Agrega al menos un producto al pedido.");
    const b = {
      supplierId,
      items,
      notes: $('[name="notes"]', form).value,
      ...(recommendation ? { recommendationToken: recommendation.token } : {}),
    };
    const review = $("#order-lines")
      .innerHTML.replace(/<input[^>]*value="(\d+)"[^>]*>/g, "$1")
      .replace(/<button[\s\S]*?<\/button>/g, "");
    openDialog(
      "Revisar y registrar pedido",
      view("edit-order-6", {
        esc: esc(
          model.state.suppliers.find((s) => s.id === Number(supplierId))?.name,
        ),
        review: review,
        esc3: esc(b.notes),
        recommendationAction: recommendation
          ? view("recommendation-recalculate-action")
          : "",
      }),
    );
    // Conservar el formulario y sus eventos permite volver sin perder el borrador.
    $("#back-order").onclick = () => {
      openDialog(
        order
          ? "Editar pedido"
          : recommendation
            ? "Preparar pedido recomendado"
            : "Nuevo pedido",
        "",
      );
      $(".dialog-body").append(form);
    };
    if (recommendation)
      $("#refresh-order-recommendation").onclick = recommendedOrders;
    $("#confirm-order").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await api(
          recommendation
            ? "orders/recommendations"
            : `orders${order ? `/${order.id}` : ""}`,
          order ? "PUT" : "POST",
          b,
        );
        $("#modal").close();
        await reload();
        toast("Pedido registrado. El inventario cambiará al recibirlo.");
      } catch (error) {
        $("#modal .error").textContent = error.message;
        e.target.disabled = false;
      }
    };
  };
}

export function viewOrder(id) {
  const o = model.state.orders.find((o) => o.id === Number(id));
  openDialog(
    idLabel("PED", o.id),
    view("view-order-1", {
      esc: esc(o.supplier),
      statusBadge: statusBadge(o.status),
      date: date(o.date),
      date4: date(o.received),
      table: table(
        ["Producto", "Cantidad", "Costo unitario", "Total"],
        o.items.map((l) =>
          tr([esc(l.name), l.qty, crc(l.price), crc(l.total)]),
        ),
      ),
      crc: crc(o.total),
      esc7: esc(o.notes),
      slot8:
        isAdmin() && o.status === "Pendiente"
          ? view("view-order-2", {
              button: button(
                "Confirmar recepción completa",
                "receive-order",
                o.id,
                "primary",
              ),
            })
          : "",
    }),
  );
}
