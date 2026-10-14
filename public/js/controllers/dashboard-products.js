import { model } from "../models/app-model.js";
import {
  productRankingFilters,
  loadProductRanking,
} from "../models/dashboard-model.js";
import {
  $,
  esc,
  crc,
  date,
  field,
  select,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";

export function productRanking(root) {
  const filters = productRankingFilters();
  root.innerHTML = view("dashboard-ranking-shell", {
    fromField: field(
      "rankingFrom",
      "Desde · Top 10",
      filters.from,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
    toField: field(
      "rankingTo",
      "Hasta · Top 10",
      filters.to,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
    supplierField: select(
      "rankingSupplier",
      "Vista del Top 10",
      [
        ["", "General · Todos los productos"],
        ...model.state.suppliers.map((s) => [s.id, s.name]),
      ],
      filters.supplierId,
    ),
  });
  const form = $("#ranking-filters", root);
  let revision = 0;
  async function refresh() {
    const current = ++revision;
    root.setAttribute("aria-busy", "true");
    $("#ranking-error", root).textContent = "";
    $("#ranking-status", root).textContent = "Consultando artículos…";
    try {
      const data = await loadProductRanking({ ...filters });
      if (!root.isConnected || current !== revision) return;
      $("#ranking-results", root).innerHTML = view("dashboard-ranking-result", {
        scope: esc(data.supplier || "General · Todos los productos"),
        range: `${date(data.from)} – ${date(data.to)}`,
        count: data.productCount,
        units: data.units,
        total: crc(data.total),
        leader: data.products.length
          ? `${esc(data.products[0].name)} · ${data.products[0].units} unidades`
          : "No hay ventas en este rango y proveedor.",
        other: data.otherUnits
          ? `${data.otherUnits} unidades corresponden a productos fuera del Top 10.`
          : "Se muestran todos los artículos vendidos en esta consulta.",
        rows: table(
          ["Artículo", "Unidades", "Ventas", "% de unidades"],
          data.products.map((p, i) =>
            tr([
              view("dashboard-product", {
                rank: i + 1,
                name: esc(p.name),
                code: esc(p.code),
              }),
              view("dashboard-ranking-units", {
                units: p.units,
                max: data.products[0].units,
                name: esc(p.name),
              }),
              crc(p.total),
              `${new Intl.NumberFormat("es-CR", { maximumFractionDigits: 1 }).format(p.share)}%`,
            ]),
          ),
          "No hay artículos vendidos para estas fechas y proveedor.",
        ),
      });
      $("#ranking-status", root).textContent =
        `Consulta actualizada: ${data.products.length} de ${data.productCount} artículos.`;
    } catch (error) {
      if (!root.isConnected || current !== revision) return;
      $("#ranking-results", root).replaceChildren();
      $("#ranking-error", root).textContent = error.message;
      $("#ranking-status", root).textContent =
        "No se pudo consultar el ranking. Revisa los filtros y vuelve a consultar.";
    } finally {
      if (root.isConnected && current === revision)
        root.setAttribute("aria-busy", "false");
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    const from = form.elements.rankingFrom.value,
      to = form.elements.rankingTo.value;
    if (from > to) {
      $("#ranking-error", root).textContent =
        "La fecha desde no puede ser posterior a la fecha hasta.";
      return;
    }
    Object.assign(filters, {
      from,
      to,
      supplierId: form.elements.rankingSupplier.value,
    });
    refresh();
  };
  form.onchange = () => {
    $("#ranking-status", root).textContent =
      "Filtros modificados. Pulsa Consultar Top 10 para aplicarlos.";
  };
  root.onclick = (event) => {
    const preset = event.target.closest("[data-ranking-preset]")?.dataset
      .rankingPreset;
    if (!preset) return;
    const now = model.state.today;
    let from = now.slice(0, 8) + "01",
      to = now;
    if (preset === "previous") {
      const end = new Date(`${from}T12:00:00Z`);
      end.setUTCDate(0);
      to = end.toISOString().slice(0, 10);
      from = to.slice(0, 8) + "01";
    } else if (preset === "30") {
      const start = new Date(`${now}T12:00:00Z`);
      start.setUTCDate(start.getUTCDate() - 29);
      from = start.toISOString().slice(0, 10);
    }
    if (to < model.state.started) {
      $("#ranking-error", root).textContent =
        "Ese período es anterior al inicio del sistema.";
      return;
    }
    form.elements.rankingFrom.value =
      from < model.state.started ? model.state.started : from;
    form.elements.rankingTo.value = to;
    form.requestSubmit();
  };
  refresh();
}
