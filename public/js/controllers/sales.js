import { saleTotals } from "../models/financial-model.js";
import {
  $,
  button,
  crc,
  date,
  esc,
  field,
  filters,
  head,
  icon,
  idLabel,
  select,
  statusBadge,
  table,
  ticketContent,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";
import {
  api,
  isAdmin,
  matches,
  model,
  receiptWidth,
} from "../models/app-model.js";
import { reload } from "./application.js";
import { openDialog, toast } from "../views/feedback.js";
import { attachFilter, editForm } from "./forms.js";

export function invoicesPage() {
  $("#content").innerHTML = view("invoices-page-1", {
    head: head(
      "Facturación",
      "Punto de venta · Caja principal",
      button("Ver historial", "invoice-history"),
    ),
    field: field(
      "customer",
      "Nombre del cliente",
      model.saleDraft.customer,
      "text",
      "required",
    ),
    field3: field(
      "identification",
      "Identificación (opcional)",
      model.saleDraft.identification,
    ),
    field4: field("notes", "Observaciones", model.saleDraft.notes),
    button: button("Vaciar", "clear-sale", "", "small"),
    field6: field(
      "barcode",
      "Código de producto / lector de barras",
      "",
      "text",
      'autocomplete="off" placeholder="Escanea o digita el código y presiona Enter"',
    ),
    select: select(
      "productId",
      "Buscar producto",
      model.state.products
        .filter((p) => p.active && p.stock > 0)
        .map((p) => [p.id, `${p.code} · ${p.name} · ${crc(p.price)}`]),
    ),
    field8: field("qty", "Cantidad", 1, "number", 'min="1" step="1"'),
    field9: field(
      "discount",
      "Descuento (%)",
      model.saleDraft.discount,
      "number",
      'required min="0" max="100" step="0.01"',
    ),
    select10: select(
      "payment",
      "Medio de pago",
      ["Efectivo", "Tarjeta", "SINPE"],
      model.saleDraft.payment,
    ),
    field11: field(
      "paid",
      "Efectivo recibido (₡)",
      model.saleDraft.paid,
      "number",
      'min="0" step="0.01"',
    ),
    icon: icon("arrow"),
  });
  const form = $("#sale-form");
  function paintCart() {
    $("#cart-table").innerHTML = table(
      ["Producto", "Cantidad", "Precio", "Total", ""],
      model.cart.map((l, i) => {
        const p = model.state.products.find((p) => p.id === l.productId);
        return tr([
          view("invoices-page-2", {
            esc: esc(p.name),
            esc2: esc(p.code),
            stock: p.stock,
          }),
          view("invoices-page-3", {
            stock: p.stock,
            qty: l.qty,
            i: i,
            esc: esc(p.name),
          }),
          crc(p.price),
          crc(p.price * l.qty),
          view("invoices-page-4", { i: i, esc: esc(p.name) }),
        ]);
      }),
      "Agrega productos para comenzar la venta.",
    );
    paintTotals();
  }
  function paintTotals() {
    const t = saleTotals();
    $("#sale-totals").innerHTML = view("invoices-page-5", {
      crc: crc(t.gross),
      crc2: crc(t.discount),
      crc3: crc(t.net),
      crc4: crc(t.vat),
      crc5: crc(t.total),
      slot6:
        model.saleDraft.payment === "Efectivo"
          ? view("invoices-page-6", {
              crc: crc(Math.max(0, Number(model.saleDraft.paid) - t.total)),
            })
          : "",
    });
    $("#cash-field").hidden = model.saleDraft.payment !== "Efectivo";
    $('[name="paid"]').required = model.saleDraft.payment === "Efectivo";
    $("#issue-invoice").disabled = !model.cart.length;
  }
  form.addEventListener("input", (e) => {
    if (e.target.name in model.saleDraft) {
      model.saleDraft[e.target.name] = e.target.value;
      paintTotals();
    }
  });
  $("#add-sale-line").onclick = () => {
    const p = model.state.products.find(
      (p) => p.id === Number($('[name="productId"]', form).value),
    );
    const qty = Number($('[name="qty"]', form).value),
      old = model.cart.find((l) => l.productId === p?.id);
    if (
      !p ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty + (old?.qty ?? 0) > p.stock
    )
      return ($(".error", form).textContent =
        "Revisa el producto, la cantidad y la existencia disponible.");
    if (old) old.qty += qty;
    else model.cart.push({ productId: p.id, qty });
    $(".error", form).textContent = "";
    paintCart();
  };
  function scanProduct() {
    const code = $('[name="barcode"]', form).value.trim();
    const product = model.state.products.find(
      (p) => p.code === code && p.active && p.stock > 0,
    );
    if (!product) {
      $(".error", form).textContent =
        "Código no encontrado o producto sin existencias.";
      return;
    }
    $('[name="productId"]', form).value = product.id;
    $("#add-sale-line").click();
    if (!$(".error", form).textContent) $('[name="barcode"]', form).value = "";
    $('[name="barcode"]', form).focus();
  }
  $("#scan-product").onclick = scanProduct;
  $('[name="barcode"]', form).onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      scanProduct();
    }
  };
  $("#cart-table").onchange = (e) => {
    if (e.target.dataset.saleLine !== undefined) {
      const i = Number(e.target.dataset.saleLine),
        qty = Number(e.target.value);
      if (Number.isSafeInteger(qty) && qty > 0) model.cart[i].qty = qty;
      paintCart();
    }
  };
  $("#cart-table").onclick = (e) => {
    const b = e.target.closest("[data-remove-sale]");
    if (b) {
      model.cart.splice(Number(b.dataset.removeSale), 1);
      paintCart();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#issue-invoice");
    btn.disabled = true;
    try {
      const invoice = await api("invoices", "POST", {
        ...model.saleDraft,
        items: model.cart,
      });
      model.cart = [];
      model.saleDraft = {
        customer: "Consumidor final",
        identification: "",
        discount: "0",
        payment: "Efectivo",
        paid: "",
        notes: "",
      };
      await reload();
      viewInvoice(invoice.id);
      toast("Factura guardada e inventario actualizado.");
    } catch (error) {
      if ($("#sale-form .error"))
        $("#sale-form .error").textContent = error.message;
      btn.disabled = false;
    }
  };
  paintCart();
}

export function invoiceHistory() {
  openDialog(
    "Historial de facturas",
    view("invoice-history-1", {
      filters: filters(
        select("status", "Estado", [["", "Todos"], "Emitida", "Anulada"]) +
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
    }),
  );
  const paint = () => {
    const f = Object.fromEntries(
      [...$("#modal").querySelectorAll("[name]")].map((e) => [e.name, e.value]),
    );
    $("#invoice-list").innerHTML = table(
      ["Factura / fecha", "Cliente", "Total", "Estado", ""],
      model.state.invoices
        .filter(
          (i) =>
            matches(f.search, idLabel("FAC", i.id), i.customer) &&
            (!f.status || i.status === f.status) &&
            (!f.from || i.date >= f.from) &&
            (!f.to || i.date <= f.to),
        )
        .reverse()
        .map((i) =>
          tr([
            view("invoice-history-2", {
              idLabel: idLabel("FAC", i.id),
              date: date(i.date),
            }),
            esc(i.customer),
            crc(i.total),
            statusBadge(i.status),
            button("Ver", "view-invoice", i.id, "small"),
          ]),
        ),
    );
  };
  $("#modal .filters").oninput = paint;
  paint();
}

export function viewInvoice(id) {
  const i = model.state.invoices.find((i) => i.id === Number(id));
  openDialog(
    idLabel("FAC", i.id),
    view("view-invoice-1", {
      ticketContent: ticketContent(i, receiptWidth()),
      select: select(
        "ticketWidth",
        "Ancho del ticket",
        [
          [80, "80 mm"],
          [58, "58 mm"],
        ],
        receiptWidth(),
      ),
      button: button("Imprimir ticket", "print-invoice", i.id, "primary block"),
      slot4:
        isAdmin() && i.status === "Emitida"
          ? button("Anular factura", "void-invoice", i.id, "danger block")
          : "",
    }),
  );
  $('[name="ticketWidth"]').onchange = (e) => {
    try {
      localStorage.setItem("sipro-ticket-width", e.target.value);
    } catch {}
    $("#ticket-preview").innerHTML = ticketContent(i, Number(e.target.value));
  };
}

export function voidInvoiceForm(id) {
  editForm(
    `Anular ${idLabel("FAC", id)}`,
    view("void-invoice-form-1", {
      field: field(
        "reason",
        "Justificación obligatoria",
        "",
        "text",
        "required",
      ),
    }),
    (b) => api(`invoices/${id}/void`, "POST", b),
  );
}

export function savedSalesPage() {
  const active = model.state.invoices.filter((i) => i.status === "Emitida");
  $("#content").innerHTML = view("saved-sales-page-1", {
    head: head(
      "Ventas guardadas",
      "Todas las facturas emitidas, disponibles para consulta y reimpresión.",
      view("saved-sales-page-2"),
    ),
    length: model.state.invoices.length,
    crc: crc(active.reduce((sum, i) => sum + i.total, 0)),
    slot4: model.state.invoices.length - active.length,
    filters: filters(
      select("status", "Estado", [["", "Todos"], "Emitida", "Anulada"]) +
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
    const rows = model.state.invoices.filter(
      (i) =>
        matches(f.search, idLabel("FAC", i.id), i.customer, i.identification) &&
        (!f.status || i.status === f.status) &&
        (!f.from || i.date >= f.from) &&
        (!f.to || i.date <= f.to),
    );
    $("#listing").innerHTML = table(
      [
        "Factura",
        "Fecha",
        "Cliente",
        "Cajero",
        "Pago",
        "Total",
        "Estado",
        "Comprobante",
      ],
      rows
        .slice()
        .reverse()
        .map((i) =>
          tr([
            idLabel("FAC", i.id),
            date(i.date),
            esc(i.customer),
            esc(i.user),
            esc(i.payment),
            crc(i.total),
            statusBadge(i.status),
            button("Ver / reimprimir ticket", "view-invoice", i.id, "small"),
          ]),
        ),
    );
  });
}
