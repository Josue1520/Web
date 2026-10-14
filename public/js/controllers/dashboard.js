import { model } from "../models/app-model.js";
import { dashboardFilters, loadDashboard } from "../models/dashboard-model.js";
import {
  $,
  crc,
  date,
  esc,
  field,
  select,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";

const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const fullDays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const periodNames = { day: "Día", week: "Semana", month: "Mes" };

export function dashboard() {
  const filters = dashboardFilters();
  $("#content").innerHTML = view("dashboard-shell", {
    dayButton: periodButton("day", filters),
    weekButton: periodButton("week", filters),
    monthButton: periodButton("month", filters),
    dateField: field(
      "dashboardDate",
      "Fecha de referencia",
      filters.date,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
  });
  const root = $("#sales-dashboard");
  let request = 0;
  async function refresh(focusKey) {
    const revision = ++request;
    root.setAttribute("aria-busy", "true");
    $("#dashboard-error", root).textContent = "";
    $("#dashboard-feedback", root).textContent = "Actualizando estadísticas…";
    root
      .querySelectorAll("[data-dashboard-period]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.dashboardPeriod === filters.period),
        ),
      );
    try {
      const data = await loadDashboard(filters);
      if (!root.isConnected || revision !== request) return;
      $("#dashboard-results", root).innerHTML = dashboardContent(data);
      $("#dashboard-feedback", root).textContent =
        `Estadísticas actualizadas: ${data.selected.count} ventas en la selección.`;
      if (focusKey)
        root.querySelector(focusKey)?.focus({ preventScroll: true });
    } catch (error) {
      if (!root.isConnected || revision !== request) return;
      $("#dashboard-results", root).replaceChildren();
      $("#dashboard-error", root).textContent = error.message;
      $("#dashboard-feedback", root).textContent =
        "No se pudieron actualizar las estadísticas. Pulsa Actualizar para volver a intentar.";
    } finally {
      if (root.isConnected && revision === request)
        root.setAttribute("aria-busy", "false");
    }
  }
  root.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button)) return;
    if (button.dataset.dashboardPeriod) {
      filters.period = button.dataset.dashboardPeriod;
      refresh();
    } else if (button.id === "refresh-dashboard") {
      refresh();
    } else if (button.dataset.daysPreset) {
      filters.period = "week";
      filters.days = {
        all: [1, 2, 3, 4, 5, 6, 7],
        work: [1, 2, 3, 4, 5],
        weekend: [6, 7],
      }[button.dataset.daysPreset];
      refresh(`[data-days-preset="${button.dataset.daysPreset}"]`);
    } else if (button.dataset.chartDay) {
      const day = Number(button.dataset.chartDay);
      filters.days =
        filters.period !== "week"
          ? [day]
          : filters.days.includes(day)
            ? filters.days.filter((d) => d !== day)
            : [...filters.days, day].sort();
      filters.period = "week";
      refresh(`[data-chart-day="${day}"]`);
    }
  };
  root.onchange = (event) => {
    if (event.target.name === "dashboardDate") {
      if (!event.target.reportValidity()) return;
      filters.date = event.target.value;
      refresh();
    } else if (event.target.name === "dashboardDay") {
      const day = Number(event.target.value);
      filters.days = event.target.checked
        ? [...new Set([...filters.days, day])].sort()
        : filters.days.filter((d) => d !== day);
      refresh(`[name="dashboardDay"][value="${day}"]`);
    } else if (event.target.name === "dashboardSupplier") {
      filters.supplierId = event.target.value;
      refresh('[name="dashboardSupplier"]');
    }
  };
  refresh();
}

function periodButton(period, filters) {
  return view("dashboard-period", {
    period,
    label: periodNames[period],
    pressed: String(filters.period === period),
  });
}

function dashboardContent(data) {
  const totalMax = Math.max(1, ...data.week.days.map((day) => day.total));
  const low = model.state.products.filter(
    (p) => p.active && p.stock <= p.minimum,
  ).length;
  const pending = model.state.orders.filter(
    (o) => o.status === "Pendiente",
  ).length;
  return view("dashboard-content", {
    summaryCards: ["day", "week", "month"]
      .map((period) => {
        const item = data.summaries[period];
        return view("dashboard-metric", {
          period,
          label: `Ventas ${period === "day" ? "del día" : period === "week" ? "de la semana" : "del mes"}`,
          total: crc(item.total),
          count: item.count,
          range:
            period === "day"
              ? date(item.from)
              : `${date(item.from)} – ${date(item.to)}`,
        });
      })
      .join(""),
    selectedLabel: `${periodNames[data.period]} · ${date(data.from)}${data.from === data.to ? "" : ` – ${date(data.to)}`}`,
    selectedTotal: crc(data.selected.total),
    selectedCount: data.selected.count,
    units: data.selected.units,
    averageTicket: crc(data.selected.averageTicket),
    dailyAverage: crc(data.selected.dailyAverage),
    eligibleDays: data.eligibleDays,
    weekRange: `${date(data.week.from)} – ${date(data.week.to)}`,
    dayControls:
      data.period === "week"
        ? view("dashboard-day-filters", {
            days: data.week.days
              .map((day, index) =>
                view("dashboard-day-option", {
                  day: day.weekday,
                  label: fullDays[index],
                  short: days[index],
                  checked: data.selectedDays.includes(day.weekday)
                    ? "checked"
                    : "",
                  disabled: day.available ? "" : "disabled",
                }),
              )
              .join(""),
          })
        : view("dashboard-week-context"),
    axis: [1, 0.75, 0.5, 0.25, 0]
      .map((fraction) =>
        view("dashboard-axis-tick", {
          amount: crc(
            totalMax === 1 && !data.week.days.some((d) => d.total)
              ? 0
              : totalMax * fraction,
          ),
        }),
      )
      .join(""),
    bars: data.week.days
      .map((day, index) => {
        const height = (day.total / totalMax) * 150;
        return view("dashboard-bar", {
          weekday: day.weekday,
          amount: crc(day.total),
          short: days[index],
          dayNumber: Number(day.date.slice(-2)),
          height: height.toFixed(3),
          y: (150 - height).toFixed(3),
          pressed: String(day.selected && day.available),
          disabled: day.available ? "" : "disabled",
          label: esc(
            `${fullDays[index]}, ${date(day.date)}: ${crc(day.total)}, ${day.count} ventas${day.available ? "" : ". Fuera del período disponible"}`,
          ),
        });
      })
      .join(""),
    selectionNotice: data.eligibleDays === 0 ? view("dashboard-no-days") : "",
    payments: data.payments
      .map((payment, index) =>
        view("dashboard-payment", {
          name: esc(payment.name),
          key: ["cash", "card", "sinpe"][index],
          symbol: ["₡", "T", "S"][index],
          total: crc(payment.total),
          count: payment.count,
          share: payment.share.toFixed(1),
          percentage: new Intl.NumberFormat("es-CR", {
            maximumFractionDigits: 1,
          }).format(payment.share),
        }),
      )
      .join(""),
    productTable: productTable(data.topProducts),
    productCount: data.productCount,
    supplierSelect: select(
      "dashboardSupplier",
      "Proveedor del catálogo",
      [
        ["", "Todos · 5 proveedores con más unidades"],
        ...data.supplierOptions.map((s) => [s.id, s.name]),
      ],
      data.supplierId,
    ),
    supplierRanking: data.supplierRanking.length
      ? data.supplierRanking
          .map((group) =>
            view("dashboard-supplier", {
              name: esc(group.supplier),
              units: group.units,
              detail: productTable(group.products),
            }),
          )
          .join("")
      : view("dashboard-no-supplier-sales"),
    low,
    pending,
  });
}

function productTable(products) {
  return table(
    ["Artículo", "Unidades", "Ventas"],
    products.map((product, index) =>
      tr([
        view("dashboard-product", {
          rank: index + 1,
          name: esc(product.name),
          code: esc(product.code),
        }),
        product.units,
        crc(product.total),
      ]),
    ),
    "No hay artículos vendidos en esta selección.",
  );
}
