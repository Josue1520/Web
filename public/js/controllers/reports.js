import { api, isAdmin, model } from "../models/app-model.js";
import {
  $,
  button,
  date,
  esc,
  field,
  head,
  options,
  select,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";

export function reportsPage() {
  const types = [
    ["orders", "Pedidos"],
    ["purchases", "Compras recibidas"],
    ["purchase-invoices", "Facturas de compra"],
    ["requested", "Productos solicitados"],
    ["sales", "Ventas"],
    ...(isAdmin()
      ? [
          ["inventory", "Inventario actual"],
          ["profit", "Utilidad bruta"],
        ]
      : []),
  ];
  model.currentReport = null;
  model.reportQuery = null;
  $("#content").innerHTML = view("reports-page-1", {
    head: head("Reportes", "Consulta la información registrada de tu negocio."),
    select: select("type", "Tipo de reporte", types),
    field: field(
      "from",
      "Desde",
      model.state.started,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
    field4: field(
      "to",
      "Hasta",
      model.state.today,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
    select5: select("supplierId", "Proveedor", [
      ["", "Todos"],
      ...model.state.suppliers.map((s) => [s.id, s.name]),
    ]),
    select6: select("status", "Estado", [
      ["", "Todos"],
      "Pendiente",
      "Recibido",
    ]),
  });
  const form = $("#report-form");
  $('[name="type"]', form).onchange = () => {
    const type = $('[name="type"]', form).value;
    const from = $('[name="from"]', form);
    from.min =
      type === "purchase-invoices"
        ? model.state.purchaseStart
        : model.state.started;
    from.value = from.min;
    $('[name="supplierId"]', form).disabled = ![
      "orders",
      "purchases",
      "purchase-invoices",
      "requested",
    ].includes(type);
    $('[name="status"]', form).innerHTML = options([
      ["", "Todos"],
      ...(type === "purchase-invoices"
        ? ["Pagada", "Pendiente"]
        : type === "sales"
          ? ["Emitida", "Anulada"]
          : ["Pendiente", "Recibido"]),
    ]);
    $('[name="status"]', form).disabled = [
      "inventory",
      "profit",
      "purchases",
    ].includes(type);
  };
  form.oninput = () => {
    model.currentReport = null;
    model.reportQuery = null;
    $("#report-result").innerHTML = view("reports-page-2");
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    $("#report-error").textContent = "";
    try {
      const params = new URLSearchParams(new FormData(form));
      const r = await api(`reports?${params}`);
      model.currentReport = r;
      model.reportQuery = params.toString();
      $("#report-result").innerHTML = view("reports-page-3", {
        esc: esc(r.title),
        slot2:
          r.type === "inventory"
            ? "Existencias actuales"
            : `${date(r.from)} — ${date(r.to)}`,
        length: r.rows.length,
        slot4: isAdmin()
          ? view("reports-page-4", {
              button: button("Imprimir / PDF", "print-report"),
              button2: button("Exportar Excel", "excel-report"),
            })
          : "",
        table: table(
          r.columns,
          r.rows.map((row) =>
            tr(
              row.map((v) =>
                typeof v === "number"
                  ? new Intl.NumberFormat("es-CR", {
                      maximumFractionDigits: 2,
                    }).format(v)
                  : esc(v),
              ),
            ),
          ),
          "No hay movimientos en el período seleccionado.",
        ),
        slot6:
          r.type === "profit"
            ? "Estimación sobre ventas vigentes: ingresos sin IVA menos costo promedio registrado al vender. No incluye gastos operativos."
            : "Información obtenida de los registros guardados. Los reportes no modifican los datos.",
      });
    } catch (error) {
      $("#report-error").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
}
