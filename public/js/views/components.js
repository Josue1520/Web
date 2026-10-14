import { view } from "./template.js";
import { model } from "../models/app-model.js";

export const $ = (s, root = document) => root.querySelector(s);

export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export const crc = (n) =>
  new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" }).format(
    n,
  );

export const date = (s) =>
  s
    ? new Intl.DateTimeFormat("es-CR", {
        dateStyle: "medium",
        timeZone: "America/Costa_Rica",
      }).format(new Date(`${s}T12:00:00Z`))
    : "—";

export const idLabel = (prefix, id) =>
  `${prefix}-${String(id).padStart(5, "0")}`;

export const paths = {
  home: view("paths-1"),
  products: view("paths-2"),
  suppliers: view("paths-3"),
  inventory: view("paths-4"),
  orders: view("paths-5"),
  invoices: view("paths-6"),
  reports: view("paths-7"),
  users: view("paths-8"),
  arrow: view("paths-9"),
  alert: view("paths-10"),
  logout: view("paths-11"),
};

export const icon = (name) =>
  view("icon-1", {
    slot1:
      paths[name] ||
      (["purchase-invoices", "sales-history"].includes(name)
        ? paths.invoices
        : paths.products),
  });

export const statusBadge = (s) =>
  view("status-badge-1", {
    slot1: ["Activo", "Emitida", "Recibido", "Normal", "Pagada"].includes(s)
      ? "green"
      : ["Pendiente", "Bajo"].includes(s)
        ? "amber"
        : ["Agotado", "Anulada"].includes(s)
          ? "red"
          : "gray",
    esc: esc(s),
  });

export const button = (label, action, id = "", style = "") =>
  view("button-1", { style: style, action: action, id: id, label: label });

export const table = (
  heads,
  rows,
  empty = "No hay registros para mostrar.",
) => {
  const numeric = heads.map((h) =>
    /^(Cantidad.*|Por recibir|Costo.*|Precio.*|Total|IVA.*|Importe|Exonerado|Neto|Impuestos.*|Otros impuestos|Otros cargos|Descuento|Existencias?|Antes|Ingresadas|Después|Saldo|Stock.*|Mínimo|Subtotal|Entradas|Salidas|Utilidad.*)$/.test(
      h,
    ),
  );
  return view("table-1", {
    slot1: heads
      .map((h, i) =>
        view("table-2", {
          slot1: numeric[i] ? ' class="numeric"' : "",
          esc: esc(h),
        }),
      )
      .join(""),
    slot2: rows.length
      ? rows
          .map((row) =>
            view("tr-1", {
              slot1: row
                .map((c, i) =>
                  view("tr-2", {
                    c,
                    className: numeric[i] ? "numeric" : "",
                  }),
                )
                .join(""),
            }),
          )
          .join("")
      : view("table-4", { length: heads.length, esc: esc(empty) }),
  });
};

export const tr = (cells) => cells;

export const options = (items, value) =>
  items
    .map((i) => {
      const [v, label] = Array.isArray(i) ? i : [i, i];
      return view("options-1", {
        esc: esc(v),
        slot2: String(v) === String(value) ? "selected" : "",
        esc3: esc(label),
      });
    })
    .join("");

export function field(name, label, value = "", type = "text", extra = "") {
  return view("field-1", {
    label: label,
    name: name,
    type: type,
    esc: esc(value),
    extra: extra,
  });
}

export function select(name, label, items, value = "", extra = "") {
  return view("select-1", {
    label: label,
    name: name,
    esc: esc(label),
    extra: extra,
    options: options(items, value),
  });
}

export const head = (title, subtitle, action = "") =>
  view("head-1", { title: title, subtitle: subtitle, action: action });

export const brand = view("brand-1");

export const filters = (extra) =>
  view("filters-1", {
    field: field(
      "search",
      "Buscar",
      "",
      "search",
      'placeholder="Nombre, código o identificación…" class="filter-control"',
    ),
    slot2: extra || "",
  });

export function offerRow(o = {}) {
  return view("offer-row-1", {
    select: select(
      "offerSupplier",
      "Proveedor",
      model.state.suppliers.map((s) => [
        s.id,
        `${s.name}${s.active ? "" : " (inactivo)"}`,
      ]),
      o.supplierId,
    ),
    field: field(
      "offerCost",
      "Costo (₡)",
      o.cost ?? "",
      "number",
      'required min="0.01" step="0.01"',
    ),
    field3: field(
      "offerDelivery",
      "Entrega (días)",
      o.delivery ?? 1,
      "number",
      'required min="0" max="365"',
    ),
    button: button("×", "remove-offer", "", "small danger"),
  });
}

export const taxName = (t) =>
  ({
    "01": "IVA",
    "02": "Selectivo de consumo",
    "03": "Combustibles",
    "04": "Bebidas alcohólicas",
    "05": "Bebidas envasadas y jabones",
    "06": "Tabaco",
    "07": "IVA · cálculo especial",
    "08": "IVA · bienes usados",
    12: "Cemento",
    99: t.description || "Otros impuestos",
  })[t.code] || `Impuesto ${t.code}`;

export function purchaseTaxDetail(i) {
  return view("purchase-tax-detail-1", {
    slot1: i.taxBreakdown?.length
      ? view("purchase-tax-detail-2", {
          length: i.taxBreakdown.length,
          table: table(
            ["Impuesto", "Tarifa", "Importe", "Exonerado", "Neto"],
            i.taxBreakdown.map((t) =>
              tr([
                view("purchase-tax-detail-3", {
                  esc: esc(taxName(t)),
                  esc2: esc(t.code),
                }),
                t.rate === null ? "Específico / factor" : `${t.rate}%`,
                crc(t.amount),
                crc(t.exonerated),
                crc(t.net),
              ]),
            ),
          ),
        })
      : "",
    slot2: i.charges?.length
      ? view("purchase-tax-detail-4", {
          table: table(
            ["Concepto", "Tercero", "Importe"],
            i.charges.map((c) =>
              tr([esc(c.description), esc(c.thirdParty || "—"), crc(c.amount)]),
            ),
          ),
        })
      : "",
    crc: crc(i.subtotal),
    slot4: i.taxBreakdown?.some((t) => t.exonerated) ? " tras exoneración" : "",
    crc5: crc(i.vat),
    slot6: i.otherTaxes
      ? view("purchase-tax-detail-5", { crc: crc(i.otherTaxes) })
      : "",
    slot7: i.assumedTax
      ? view("purchase-tax-detail-6", { crc: crc(i.assumedTax) })
      : "",
    slot8: i.chargesTotal
      ? view("purchase-tax-detail-7", { crc: crc(i.chargesTotal) })
      : "",
    slot9: i.vatRefund
      ? view("purchase-tax-detail-8", { crc: crc(i.vatRefund) })
      : "",
    crc10: crc(i.total),
  });
}

export function purchaseInvoiceContent(i) {
  return view("purchase-invoice-content-1", {
    slot1: i.xml
      ? view("purchase-invoice-content-2", {
          esc: esc(i.xml.version),
          esc2: esc(i.xml.key),
        })
      : "",
    esc: esc(i.supplier),
    esc3: esc(i.supplierIdentification),
    esc4: esc(i.invoiceNumber),
    date: date(i.date),
    statusBadge: statusBadge(i.status),
    slot7:
      i.status === "Pagada"
        ? `Pago registrado: ${date(i.paidDate)}`
        : `Vencimiento: ${date(i.dueDate)}`,
    slot8: i.orderId
      ? idLabel("PED", i.orderId)
      : "Compra directa con ingreso a inventario",
    date9: date(i.registered),
    esc10: esc(i.user),
    table: table(
      [
        "Producto",
        "Cantidad",
        "Costo neto",
        "Descuento",
        "Impuestos netos",
        "Total",
      ],
      i.items.map((l) =>
        tr([
          view("purchase-invoice-content-3", {
            esc: esc(l.name),
            esc2: esc(l.code),
            slot3: l.xmlDescription
              ? view("purchase-invoice-content-4", {
                  esc: esc(l.xmlDescription),
                  esc2: esc(l.unit),
                })
              : "",
          }),
          l.qty,
          crc(l.price),
          crc(l.discountAmount),
          view("purchase-invoice-content-5", {
            crc: crc(l.taxTotal ?? l.vat),
            slot2: l.taxes
              ? l.taxes.map((t) => esc(taxName(t))).join(" · ")
              : `${l.tax}% IVA`,
          }),
          crc(l.total),
        ]),
      ),
    ),
    purchaseTaxDetail: purchaseTaxDetail(i),
    purchaseStockReceipt: purchaseStockReceipt(i),
    esc14: esc(i.notes),
  });
}

export function purchaseStockReceipt(i) {
  if (i.orderId)
    return view("purchase-stock-receipt-1", {
      idLabel: idLabel("PED", i.orderId),
    });
  const receipt = i.inventoryReceipt;
  if (!receipt?.entries?.length) return view("purchase-stock-receipt-2");
  return view("purchase-stock-receipt-3", {
    date: date(i.registered),
    table: table(
      ["Producto", "Antes", "Ingresadas", "Después"],
      receipt.entries.map((e) =>
        tr([
          view("purchase-stock-receipt-4", {
            esc: esc(e.name),
            esc2: esc(e.code),
          }),
          e.before,
          `+${e.quantity}`,
          e.after,
        ]),
      ),
    ),
  });
}

export function ticketContent(i, width = 80) {
  const time = i.issuedAt
    ? new Intl.DateTimeFormat("es-CR", {
        timeZone: "America/Costa_Rica",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(i.issuedAt))
    : "";
  const discount = i.items.reduce((sum, l) => sum + l.discount, 0);
  return view("ticket-content-1", {
    width: width,
    idLabel: idLabel("FAC", i.id),
    slot3: i.status === "Anulada" ? view("ticket-content-2") : "",
    idLabel4: idLabel("FAC", i.id),
    date: date(i.date),
    esc: esc(i.user),
    slot7: time ? ` · ${esc(time)}` : "",
    esc8: esc(i.customer),
    slot9: i.identification
      ? view("ticket-content-3", { esc: esc(i.identification) })
      : "",
    slot10: i.items
      .map((l) =>
        view("ticket-content-4", {
          esc: esc(l.name),
          qty: l.qty,
          crc: crc(l.price),
          crc4: crc(l.total),
          slot5: l.discount
            ? view("ticket-content-5", { crc: crc(l.discount) })
            : "",
          tax: l.tax,
          crc7: crc(l.vat),
        }),
      )
      .join(""),
    slot11: discount ? view("ticket-content-6", { crc: crc(discount) }) : "",
    crc: crc(i.subtotal),
    crc13: crc(i.vat),
    crc14: crc(i.total),
    esc15: esc(i.payment),
    crc16: crc(i.paid),
    crc17: crc(i.change),
    slot18: i.notes ? view("ticket-content-7", { esc: esc(i.notes) }) : "",
    slot19:
      i.status === "Anulada"
        ? view("ticket-content-8", {
            date: date(i.voidDate),
            esc: esc(i.reason),
          })
        : "",
    idLabel20: idLabel("FAC", i.id),
    slot21: i.items.reduce((sum, l) => sum + l.qty, 0),
  });
}
