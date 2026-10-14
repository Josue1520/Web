import { purchaseTotals } from "../models/financial-model.js";
import { api, isAdmin, matches, model } from "../models/app-model.js";
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
  purchaseInvoiceContent,
  purchaseTaxDetail,
  select,
  statusBadge,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";
import { attachFilter } from "./forms.js";
import { openDialog, toast } from "../views/feedback.js";
import { editProduct, editSupplier } from "./catalog.js";
import { reload } from "./application.js";

export function purchaseInvoicesPage() {
  const pending = model.state.purchaseInvoices.filter(
    (i) => i.status === "Pendiente",
  );
  $("#content").innerHTML = view("purchase-invoices-page-1", {
    head: head(
      "Facturas de compra",
      "Registra los comprobantes que recibes de tus proveedores.",
      isAdmin()
        ? view("purchase-invoices-page-2", {
            button: button(
              "Registrar factura de compra",
              "new-purchase-invoice",
            ),
            button2: button(
              "Importar XML",
              "import-purchase-xml",
              "",
              "primary",
            ),
          })
        : "",
    ),
    length: pending.length,
    crc: crc(pending.reduce((sum, i) => sum + i.total, 0)),
    filters: filters(
      select("supplier", "Proveedor", [
        ["", "Todos"],
        ...model.state.suppliers.map((s) => [s.id, s.name]),
      ]) +
        select("status", "Estado de pago", [
          ["", "Todos"],
          "Pagada",
          "Pendiente",
        ]) +
        field(
          "from",
          "Desde",
          "",
          "date",
          `min="${model.state.purchaseStart}" max="${model.state.today}"`,
        ) +
        field(
          "to",
          "Hasta",
          "",
          "date",
          `min="${model.state.purchaseStart}" max="${model.state.today}"`,
        ),
    ),
  });
  attachFilter((f) => {
    const rows = model.state.purchaseInvoices.filter(
      (i) =>
        matches(f.search, i.invoiceNumber, i.supplier, idLabel("COM", i.id)) &&
        (!f.supplier || String(i.supplierId) === f.supplier) &&
        (!f.status || i.status === f.status) &&
        (!f.from || i.date >= f.from) &&
        (!f.to || i.date <= f.to),
    );
    $("#listing").innerHTML = table(
      [
        "Factura del proveedor",
        "Proveedor",
        "Fecha",
        "Total",
        "Pago",
        "Origen",
        "Acciones",
      ],
      rows
        .slice()
        .reverse()
        .map((i) =>
          tr([
            view("purchase-invoices-page-3", {
              esc: esc(i.invoiceNumber),
              idLabel: idLabel("COM", i.id),
              slot3: i.xml ? " · XML " + esc(i.xml.version) : "",
            }),
            esc(i.supplier),
            date(i.date),
            crc(i.total),
            `${statusBadge(i.status)}${i.status === "Pendiente" ? view("purchase-invoices-page-4", { date: date(i.dueDate) }) : ""}`,
            i.orderId ? idLabel("PED", i.orderId) : "Compra directa",
            button("Ver", "view-purchase-invoice", i.id, "small"),
          ]),
        ),
      "Aún no hay facturas de proveedores registradas.",
    );
  });
}

export function importPurchaseXml() {
  let xml = "",
    document,
    mappings = [],
    source = "",
    payment = "Pendiente",
    dueDate = "",
    notes = "";
  const xmlAmount = (n) =>
    new Intl.NumberFormat("es-CR", { maximumFractionDigits: 5 }).format(n);
  function upload() {
    openDialog(
      "Importar factura del proveedor",
      view("import-purchase-xml-1", { button: button("Cancelar", "close") }),
    );
    $("#xml-upload").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        const file = $('[name="file"]', form).files[0];
        if (!file || file.size > 1024 * 1024)
          throw new Error("Selecciona un XML de hasta 1 MB.");
        try {
          xml = new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
          }).decode(await file.arrayBuffer());
        } catch {
          throw new Error("El archivo debe estar codificado en UTF-8.");
        }
        document = await api("purchase-invoices/xml/preview", "POST", { xml });
        mappings = document.items.map((i) => i.productId ?? "");
        dueDate = document.dueDate;
        review();
      } catch (error) {
        $(".error", form).textContent = error.message;
      } finally {
        btn.disabled = false;
      }
    };
  }
  async function refresh() {
    document = await api("purchase-invoices/xml/preview", "POST", { xml });
    mappings = mappings.map((m, i) => m || document.items[i].productId || "");
    review();
  }
  function review() {
    const d = document,
      supplier = model.state.suppliers.find((s) => s.id === d.supplierId);
    const products = model.state.products.filter(
      (p) => p.active && p.offers.some((o) => o.supplierId === d.supplierId),
    );
    const orders = model.state.orders.filter(
      (o) =>
        o.supplierId === d.supplierId &&
        o.status === "Recibido" &&
        !model.state.purchaseInvoices.some((i) => i.orderId === o.id),
    );
    openDialog(
      "Revisar factura XML",
      view("import-purchase-xml-2", {
        esc: esc(d.version),
        esc2: esc(d.supplier.name),
        esc3: esc(d.supplier.identification),
        date: date(d.date),
        esc5: esc(d.invoiceNumber),
        crc: crc(d.total),
        length: d.items.length,
        esc8: esc(d.key),
        slot9: d.receiver
          ? `${esc(d.receiver.name)} · ${esc(d.receiver.identification)}`
          : "No indicado en el XML",
        slot10: supplier
          ? view("import-purchase-xml-3", {
              esc: esc(supplier.name),
              slot2: supplier.active
                ? ""
                : " · Inactivo: actívalo en Proveedores antes de importar.",
            })
          : view("import-purchase-xml-4"),
        table: table(
          [
            "Detalle del proveedor",
            "Cantidad",
            "Costo sin IVA",
            "Total",
            "Producto en SIPRO",
          ],
          d.items.map((l, n) =>
            tr([
              view("import-purchase-xml-5", {
                esc: esc(l.name),
                esc2: esc(l.codes.join(" / ") || "Sin código comercial"),
                esc3: esc(l.unit),
              }),
              xmlAmount(l.qty),
              xmlAmount(l.price),
              xmlAmount(l.total),
              view("import-purchase-xml-6", {
                select: select(
                  `mapping-${n}`,
                  `Producto para línea ${n + 1}`,
                  [
                    ["", "Seleccionar producto…"],
                    ...products.map((p) => [
                      p.id,
                      `${p.code} · ${p.name} (${p.presentation})`,
                    ]),
                  ],
                  mappings[n],
                  "required",
                ),
                n: n,
                slot3: supplier?.active ? "" : "disabled",
              }),
            ]),
          ),
        ),
        purchaseTaxDetail: purchaseTaxDetail(d),
        select: select(
          "orderId",
          "Entrada de mercadería",
          [
            ["", "Compra directa · ingresar existencias"],
            ...orders.map((o) => [
              o.id,
              `${idLabel("PED", o.id)} · ya recibido`,
            ]),
          ],
          source,
        ),
        select14: select(
          "status",
          "Estado de pago",
          ["Pendiente", "Pagada"],
          payment,
        ),
        field: field(
          "dueDate",
          "Fecha de vencimiento",
          dueDate,
          "date",
          `required min="${esc(d.date)}"`,
        ),
        field16: field(
          "notes",
          "Observaciones",
          notes,
          "text",
          'maxlength="500"',
        ),
        slot17: supplier?.active ? "" : "disabled",
      }),
    );
    const form = $("#xml-review");
    function remember() {
      const data = new FormData(form);
      mappings = d.items.map((_, i) => data.get(`mapping-${i}`));
      source = data.get("orderId");
      payment = data.get("status");
      dueDate = data.get("dueDate");
      notes = data.get("notes");
      $("#xml-stock-effect").textContent = source
        ? "El pedido ya está recibido: esta factura documentará la compra sin volver a sumar existencias. Deben coincidir productos y cantidades."
        : "Al guardar se sumarán estas cantidades al inventario. Si ya recibiste la mercadería mediante un pedido, selecciónalo arriba.";
      $('[name="dueDate"]', form).required = payment === "Pendiente";
    }
    form.onchange = remember;
    remember();
    $("#xml-other-file").onclick = () => {
      source = "";
      payment = "Pendiente";
      notes = "";
      upload();
    };
    const createSupplier = $("#xml-create-supplier");
    if (createSupplier)
      createSupplier.onclick = () => {
        remember();
        editSupplier(
          null,
          {
            ...d.supplier,
            days: d.creditDays,
            terms: d.creditDays ? "Crédito" : "Contado",
          },
          refresh,
        );
      };
    form.querySelectorAll("[data-xml-product]").forEach(
      (btn) =>
        (btn.onclick = () => {
          remember();
          const index = Number(btn.dataset.xmlProduct),
            line = d.items[index];
          editProduct(
            null,
            {
              code: line.codes[0] ?? "",
              name: line.name,
              presentation: line.unit,
              tax: line.tax,
              offers: [
                {
                  supplierId: d.supplierId,
                  cost: Math.max(0.01, Math.round(line.price * 100) / 100),
                  delivery: 1,
                },
              ],
            },
            async (product) => {
              mappings[index] = product.id;
              await refresh();
            },
          );
          // La entrada se hará al confirmar la factura; el alta de catálogo comienza en cero.
          $('[name="stock"]', $("#edit-form")).readOnly = true;
        }),
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      remember();
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        const invoice = await api("purchase-invoices/xml", "POST", {
          xml,
          mappings,
          orderId: source,
          status: payment,
          dueDate,
          notes,
        });
        $("#modal").close();
        await reload();
        viewPurchaseInvoice(invoice.id);
        toast(
          invoice.orderId
            ? "Factura vinculada al pedido recibido. Las existencias no se duplicaron."
            : "Factura importada e inventario actualizado. Revisa las cantidades ingresadas en el detalle.",
        );
      } catch (error) {
        $(".error", form).textContent = error.message;
      } finally {
        btn.disabled = !supplier?.active;
      }
    };
  }
  upload();
}

export function newPurchaseInvoice() {
  if (!model.state.suppliers.length)
    return toast("Primero registra un proveedor.", true);
  let supplierId =
    model.state.suppliers.find((s) => s.active)?.id ??
    model.state.suppliers[0].id;
  let orderId = "",
    items = [];
  openDialog(
    "Registrar factura de compra",
    view("new-purchase-invoice-1", {
      select: select(
        "supplierId",
        "Proveedor",
        model.state.suppliers.map((s) => [
          s.id,
          `${s.name}${s.active ? "" : " (inactivo)"}`,
        ]),
        supplierId,
        "required",
      ),
      field: field(
        "invoiceNumber",
        "Número de factura del proveedor",
        "",
        "text",
        'required maxlength="500"',
      ),
      field3: field(
        "date",
        "Fecha de emisión",
        model.state.today,
        "date",
        `required min="${model.state.started}" max="${model.state.today}"`,
      ),
      select4: select(
        "status",
        "Estado de pago",
        ["Pagada", "Pendiente"],
        "Pagada",
      ),
      field5: field(
        "dueDate",
        "Fecha de vencimiento",
        "",
        "date",
        `min="${model.state.started}"`,
      ),
      field6: field("notes", "Observaciones"),
      button: button("Cancelar", "close"),
    }),
  );
  const form = $("#purchase-form");
  function totals() {
    const sum = purchaseTotals(items);
    $("#purchase-totals").innerHTML = view("new-purchase-invoice-2", {
      crc: crc(sum.subtotal),
      crc2: crc(sum.vat),
      crc3: crc(sum.total),
    });
  }
  function paintLines() {
    $("#purchase-lines").innerHTML = table(
      ["Producto", "Cantidad", "Costo sin IVA (₡)", "IVA %", "Desc. %", ""],
      items.map((l, i) => {
        const p = model.state.products.find((p) => p.id === l.productId);
        const input = (key, label, min, max, step) =>
          view("new-purchase-invoice-3", {
            esc: esc(l[key]),
            label: label,
            esc3: esc(p.name),
            i: i,
            key: key,
            min: min,
            max: max,
            step: step,
            slot9: orderId && key === "qty" ? "readonly" : "",
          });
        return tr([
          esc(p.name),
          input("qty", "Cantidad", 1, 1000000, 1),
          input("price", "Costo", 0.01, 100000000, 0.01),
          input("tax", "IVA", 0, 100, 0.01),
          input("discount", "Descuento", 0, 100, 0.01),
          orderId
            ? ""
            : view("new-purchase-invoice-4", { i: i, esc: esc(p.name) }),
        ]);
      }),
    );
    totals();
  }
  function source() {
    const orders = model.state.orders.filter(
      (o) =>
        o.supplierId === supplierId &&
        o.status === "Recibido" &&
        !model.state.purchaseInvoices.some((i) => i.orderId === o.id),
    );
    $("#purchase-source").innerHTML = select(
      "orderId",
      "Origen de la compra",
      [
        ["", "Compra directa: mercadería recibida sin pedido"],
        ...orders.map((o) => [
          o.id,
          `${idLabel("PED", o.id)} · Recibido ${date(o.received)}`,
        ]),
      ],
      orderId,
    );
    $('[name="orderId"]', form).onchange = (e) => {
      orderId = e.target.value;
      const order = model.state.orders.find((o) => o.id === Number(orderId));
      items = order
        ? order.items.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            price: l.price,
            tax: model.state.products.find((p) => p.id === l.productId).tax,
            discount: 0,
          }))
        : [];
      picker();
      paintLines();
    };
    picker();
    paintLines();
  }
  function picker() {
    $("#purchase-notice").textContent = orderId
      ? "Este pedido ya fue recibido. Guardar su factura no modifica existencias ni revaloriza los costos registrados en la recepción."
      : "Compra directa: confirma que esta mercadería ya llegó y aún no fue ingresada. Guardar la factura sumará estas cantidades al inventario.";
    const products = model.state.products.filter(
      (p) => p.active && p.offers.some((o) => o.supplierId === supplierId),
    );
    $("#purchase-picker").hidden = !!orderId;
    $("#purchase-picker").innerHTML = orderId
      ? ""
      : view("new-purchase-invoice-5", {
          select: select(
            "productId",
            "Producto",
            products.map((p) => [p.id, `${p.code} · ${p.name}`]),
          ),
          field: field(
            "qty",
            "Cantidad a agregar",
            1,
            "number",
            'min="1" step="1"',
          ),
        });
    if (!orderId)
      $("#add-purchase-line").onclick = () => {
        const p = model.state.products.find(
          (p) => p.id === Number($('[name="productId"]', form).value),
        );
        const qty = Number($('[name="qty"]', form).value);
        if (!p || !Number.isSafeInteger(qty) || qty <= 0)
          return ($(".error", form).textContent =
            "Selecciona un producto y una cantidad entera mayor que cero.");
        const old = items.find((l) => l.productId === p.id);
        if (old) old.qty = Number(old.qty) + qty;
        else
          items.push({
            productId: p.id,
            qty,
            price: p.offers.find((o) => o.supplierId === supplierId).cost,
            tax: p.tax,
            discount: 0,
          });
        $(".error", form).textContent = "";
        paintLines();
      };
  }
  $('[name="supplierId"]', form).onchange = (e) => {
    supplierId = Number(e.target.value);
    orderId = "";
    items = [];
    source();
  };
  $('[name="status"]', form).onchange = () => {
    const pending = $('[name="status"]', form).value === "Pendiente";
    $("#purchase-due").hidden = !pending;
    $('[name="dueDate"]', form).required = pending;
    if (!pending) $('[name="dueDate"]', form).value = "";
  };
  $('[name="status"]', form).onchange();
  $("#purchase-lines").oninput = (e) => {
    if (e.target.dataset.purchaseLine !== undefined) {
      items[Number(e.target.dataset.purchaseLine)][e.target.dataset.key] =
        e.target.value;
      totals();
    }
  };
  $("#purchase-lines").onclick = (e) => {
    const b = e.target.closest("[data-remove-purchase]");
    if (b) {
      items.splice(Number(b.dataset.removePurchase), 1);
      paintLines();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      await api("purchase-invoices", "POST", {
        ...Object.fromEntries(new FormData(form)),
        supplierId,
        orderId: orderId || null,
        items,
      });
      $("#modal").close();
      await reload();
      toast(
        orderId
          ? "Factura asociada al pedido. El inventario se conserva."
          : "Factura guardada y mercadería ingresada al inventario.",
      );
    } catch (error) {
      $(".error", form).textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
  source();
}

export function viewPurchaseInvoice(id) {
  const i = model.state.purchaseInvoices.find((i) => i.id === Number(id));
  openDialog(
    `Compra ${idLabel("COM", i.id)}`,
    view("view-purchase-invoice-1", {
      purchaseInvoiceContent: purchaseInvoiceContent(i),
      slot2:
        i.xml && isAdmin() ? view("view-purchase-invoice-2", { id: i.id }) : "",
      slot3:
        isAdmin() && i.status === "Pendiente"
          ? button("Marcar como pagada", "pay-purchase-invoice", i.id)
          : "",
      button: button(
        "Imprimir / guardar PDF",
        "print-purchase-invoice",
        i.id,
        "primary",
      ),
    }),
  );
}

export function confirmPurchasePayment(id) {
  const i = model.state.purchaseInvoices.find((i) => i.id === Number(id));
  openDialog(
    "Confirmar pago de factura",
    view("confirm-purchase-payment-1", {
      esc: esc(i.invoiceNumber),
      esc2: esc(i.supplier),
      crc: crc(i.total),
      button: button("Cancelar", "close"),
    }),
  );
  $("#confirm-purchase-payment").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api(`purchase-invoices/${i.id}/pay`, "POST");
      $("#modal").close();
      await reload();
      toast("Pago registrado.");
    } catch (error) {
      $("#modal .error").textContent = error.message;
      e.target.disabled = false;
    }
  };
}
