import { checkoutSale } from "./sales-checkout.js";
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
import { openDialog, toast } from "../views/feedback.js";
import { attachFilter, editForm } from "./forms.js";

export function invoicesPage() {
  const products = model.state.products.filter((p) => p.active && p.stock > 0);
  $("#content").innerHTML = view("invoices-page-1", {
    head: head(
      "Facturación",
      "Punto de venta · Caja principal",
      button("Ver historial", "invoice-history"),
    ),
    barcode: field(
      "barcode",
      "Código de producto / lector de barras",
      "",
      "text",
      'autocomplete="off" placeholder="Escanea el código y presiona Enter"',
    ),
    product: select(
      "productId",
      "Buscar producto",
      products.map((p) => [p.id, `${p.code} · ${p.name} · ${crc(p.price)}`]),
    ),
    quantity: field("qty", "Cantidad", 1, "number", 'min="1" step="1"'),
    discount: field(
      "discount",
      "Descuento (%)",
      model.saleDraft.discount,
      "number",
      'required min="0" max="100" step="0.01"',
    ),
    category: select("quickCategory", "Categoría", [
      ["", "Todas las categorías"],
      ...[...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    ]),
  });
  const form = $("#sale-form");
  let quickPage = 0;
  function paintQuick() {
    const list = products.filter(
      (p) =>
        matches($("#quick-search").value, p.name, p.code) &&
        (!$('[name="quickCategory"]').value ||
          p.category === $('[name="quickCategory"]').value),
    );
    const pages = Math.max(1, Math.ceil(list.length / 12));
    quickPage = Math.min(quickPage, pages - 1);
    $("#quick-products").innerHTML =
      list
        .slice(quickPage * 12, (quickPage + 1) * 12)
        .map((p) =>
          view("pos-quick-product", {
            id: p.id,
            name: esc(p.name),
            code: esc(p.code),
            price: crc(p.price),
            stock:
              p.stock -
              (model.cart.find((l) => l.productId === p.id)?.qty || 0),
          }),
        )
        .join("") ||
      '<p class="form-help">No hay artículos disponibles con ese filtro.</p>';
    $("#quick-page").textContent = `${quickPage + 1} / ${pages}`;
    $("#quick-prev").disabled = quickPage === 0;
    $("#quick-next").disabled = quickPage + 1 >= pages;
  }
  function paintTotals() {
    const t = saleTotals();
    $("#pos-total").textContent = crc(t.total);
    $("#pos-units").textContent =
      `${model.cart.reduce((sum, l) => sum + l.qty, 0)} unidades · ${model.cart.length} artículos`;
    $("#sale-totals").innerHTML = view("pos-totals", {
      gross: crc(t.gross),
      discount: crc(t.discount),
      net: crc(t.net),
      vat: crc(t.vat),
    });
    $("#open-checkout").disabled = !model.cart.length;
  }
  function paintCart() {
    $("#cart-table").innerHTML = table(
      ["Código", "Artículo", "Cantidad", "Precio con IVA", "Importe", ""],
      model.cart.map((l, i) => {
        const p = model.state.products.find((p) => p.id === l.productId);
        return tr([
          esc(p.code),
          view("invoices-page-2", {
            esc: esc(p.name),
            esc2: esc(p.presentation || "Unidad"),
            stock: p.stock,
          }),
          view("invoices-page-3", {
            stock: p.stock,
            qty: l.qty,
            i,
            esc: esc(p.name),
          }),
          crc(p.price),
          crc(p.price * l.qty),
          view("invoices-page-4", { i, esc: esc(p.name) }),
        ]);
      }),
      "Escanea un código o selecciona un artículo de los accesos rápidos.",
    );
    paintTotals();
    paintQuick();
  }
  function addProduct(id, qty) {
    const p = products.find((p) => p.id === Number(id));
    const old = model.cart.find((l) => l.productId === p?.id);
    if (
      !p ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty + (old?.qty || 0) > p.stock
    ) {
      $(".error", form).textContent =
        "Revisa la cantidad y la existencia disponible.";
      return false;
    }
    if (old) old.qty += qty;
    else model.cart.push({ productId: p.id, qty });
    $(".error", form).textContent = "";
    $("#pos-last-item").textContent =
      `${p.name} · ${qty} × ${crc(p.price)} · Existencia: ${p.stock}`;
    paintCart();
    return true;
  }
  $("#add-sale-line").onclick = () =>
    addProduct(
      $('[name="productId"]', form).value,
      Number($('[name="qty"]', form).value),
    );
  function scanProduct() {
    const input = $('[name="barcode"]', form);
    const p = products.find((p) => p.code === input.value.trim());
    if (!p)
      $(".error", form).textContent =
        "Código no encontrado o producto sin existencias.";
    else if (addProduct(p.id, Number($('[name="qty"]', form).value)))
      input.value = "";
    input.focus();
  }
  $("#scan-product").onclick = scanProduct;
  $('[name="barcode"]', form).onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      scanProduct();
    }
  };
  $('[name="discount"]', form).oninput = (e) => {
    if (e.target.validity.valid) {
      model.saleDraft.discount = e.target.value;
      paintTotals();
    }
  };
  $("#cart-table").onchange = (e) => {
    if (e.target.dataset.saleLine === undefined) return;
    const l = model.cart[Number(e.target.dataset.saleLine)];
    const p = model.state.products.find((p) => p.id === l.productId);
    const qty = Number(e.target.value);
    if (Number.isSafeInteger(qty) && qty > 0 && qty <= p.stock) {
      l.qty = qty;
      $(".error", form).textContent = "";
    } else
      $(".error", form).textContent =
        `La cantidad debe estar entre 1 y ${p.stock}.`;
    paintCart();
  };
  $("#cart-table").onclick = (e) => {
    const b = e.target.closest("[data-remove-sale]");
    if (b) {
      model.cart.splice(Number(b.dataset.removeSale), 1);
      $("#pos-last-item").textContent = "Artículo retirado de la venta.";
      paintCart();
    }
  };
  $("#quick-products").onclick = (e) => {
    const b = e.target.closest("[data-quick-product]");
    if (b) addProduct(b.dataset.quickProduct, 1);
  };
  $("#quick-search").oninput = () => {
    quickPage = 0;
    paintQuick();
  };
  $('[name="quickCategory"]').onchange = () => {
    quickPage = 0;
    paintQuick();
  };
  $("#quick-prev").onclick = () => {
    quickPage--;
    paintQuick();
  };
  $("#quick-next").onclick = () => {
    quickPage++;
    paintQuick();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    checkoutSale();
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
