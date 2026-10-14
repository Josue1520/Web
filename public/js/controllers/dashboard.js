import { model } from "../models/app-model.js";
import { dashboardFilters, loadDashboard } from "../models/dashboard-model.js";
import { $, crc, date, esc, field, select } from "../views/components.js";
import { view } from "../views/template.js";
import { lineChart } from "../views/dashboard-charts.js";
import { productRanking } from "./dashboard-products.js";

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
const periodNames = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  range: "Rango",
};

export function dashboard() {
  const filters = dashboardFilters();
  $("#content").innerHTML = view("dashboard-shell", {
    dayButton: periodButton("day", filters),
    weekButton: periodButton("week", filters),
    monthButton: periodButton("month", filters),
    rangeButton: periodButton("range", filters),
    rangeHidden: filters.period === "range" ? "" : "hidden",
    fromField: field(
      "salesFrom",
      "Desde · Ventas y pagos",
      filters.from,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
    toField: field(
      "salesTo",
      "Hasta · Ventas y pagos",
      filters.to,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
    dateField: field(
      "dashboardDate",
      "Fecha de referencia",
      filters.date,
      "date",
      `required min="${model.state.started}" max="${model.state.today}"`,
    ),
  });
  const root = $("#sales-dashboard");
  productRanking($("#dashboard-product-ranking", root));
  let lastData;
  let request = 0;
  async function refresh(focusKey) {
    const revision = ++request;
    root.setAttribute("aria-busy", "true");
    $("#dashboard-range-form", root).hidden = filters.period !== "range";
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
      lastData = data;
      $("#dashboard-results", root).innerHTML = dashboardContent(data, filters);
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
    if (button.id === "jump-top-products") {
      $("#top-products-title", root).focus({ preventScroll: true });
      $("#dashboard-product-ranking", root).scrollIntoView({ block: "start" });
    } else if (button.dataset.dashboardPeriod) {
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
      filters.year = filters.date.slice(0, 4);
      refresh();
    } else if (event.target.name === "dashboardDay") {
      const day = Number(event.target.value);
      filters.days = event.target.checked
        ? [...new Set([...filters.days, day])].sort()
        : filters.days.filter((d) => d !== day);
      refresh(`[name="dashboardDay"][value="${day}"]`);
    } else if (
      ["weekMetric", "hourRange"].includes(event.target.name) &&
      lastData
    ) {
      filters[event.target.name] = event.target.value;
      $("#dashboard-results", root).innerHTML = dashboardContent(
        lastData,
        filters,
      );
      root
        .querySelector(`[name="${event.target.name}"]`)
        ?.focus({ preventScroll: true });
    }
  };
  root.onsubmit = (event) => {
    if (event.target.id === "dashboard-year-form") {
      event.preventDefault();
      filters.year = event.target.elements.dashboardYear.value;
      refresh('[name="dashboardYear"]');
    } else if (event.target.id === "dashboard-range-form") {
      event.preventDefault();
      const from = event.target.elements.salesFrom.value,
        to = event.target.elements.salesTo.value;
      if (from > to) {
        $("#dashboard-error", root).textContent =
          "La fecha desde no puede ser posterior a la fecha hasta.";
        return;
      }
      filters.from = from;
      filters.to = to;
      refresh();
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

function dashboardContent(data, filters) {
  const metric = filters.weekMetric;
  const weeklyFormat =
    metric === "total"
      ? crc
      : (n) =>
          new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(
            n,
          );
  const totalMax = Math.max(1, ...data.week.days.map((day) => day[metric]));
  const low = model.state.products.filter(
    (p) => p.active && p.stock <= p.minimum,
  ).length;
  const pending = model.state.orders.filter(
    (o) => o.status === "Pendiente",
  ).length;
  return view("dashboard-content", {
    summaryCards: ["day", "week", "month", "year"]
      .map((period) => {
        const item = data.summaries[period];
        return view("dashboard-metric", {
          period,
          label: `Ventas ${period === "day" ? "del día" : period === "week" ? "de la semana" : period === "month" ? "del mes" : "del año"}`,
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
    weekMetric: select(
      "weekMetric",
      "Mostrar ventas semanales en",
      [
        ["total", "Colones · IVA incluido"],
        ["units", "Unidades vendidas"],
        ["count", "Cantidad de facturas"],
      ],
      metric,
    ),
    yearField: field(
      "dashboardYear",
      "Año de los gráficos mensuales",
      data.annual.year,
      "number",
      `required min="${model.state.started.slice(0, 4)}" max="${model.state.today.slice(0, 4)}" step="1"`,
    ),
    annualSales: lineChart(
      data.annual.months.map((m) => ({
        label: new Intl.DateTimeFormat("es-CR", {
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${m.month}-01T12:00:00Z`)),
        value: m.available ? m.total : null,
      })),
      `Ventas de ${data.annual.year} por mes`,
    ),
    annualProfit: Object.hasOwn(data.annual.months[0], "profit")
      ? view("dashboard-profit", {
          chart: lineChart(
            data.annual.months.map((m) => ({
              label: new Intl.DateTimeFormat("es-CR", {
                month: "short",
                timeZone: "UTC",
              }).format(new Date(`${m.month}-01T12:00:00Z`)),
              value: m.available ? m.profit : null,
            })),
            `Utilidad bruta estimada de ${data.annual.year}`,
          ),
        })
      : "",
    hourRange: select(
      "hourRange",
      "Horas que deseas visualizar",
      [
        ["24", "Todo el día · 00:00–23:59"],
        ["day", "Diurno · 06:00–17:59"],
        ["night", "Nocturno · 18:00–05:59"],
      ],
      filters.hourRange,
    ),
    hourlyChart: lineChart(
      (filters.hourRange === "day"
        ? data.hourly.hours.slice(6, 18)
        : filters.hourRange === "night"
          ? [...data.hourly.hours.slice(18), ...data.hourly.hours.slice(0, 6)]
          : data.hourly.hours
      ).map((h) => ({
        label: `${String(h.hour).padStart(2, "0")}:00`,
        value: h.count,
      })),
      "Cantidad de ventas por hora de Costa Rica en el período seleccionado",
      false,
    ),
    unknownTime: data.hourly.unknownTime,
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
          amount: weeklyFormat(
            totalMax === 1 && !data.week.days.some((d) => d[metric])
              ? 0
              : totalMax * fraction,
          ),
        }),
      )
      .join(""),
    bars: data.week.days
      .map((day, index) => {
        const height = (day[metric] / totalMax) * 150;
        return view("dashboard-bar", {
          weekday: day.weekday,
          amount: weeklyFormat(day[metric]),
          short: days[index],
          dayNumber: Number(day.date.slice(-2)),
          height: height.toFixed(3),
          y: (150 - height).toFixed(3),
          pressed: String(day.selected && day.available),
          disabled: day.available ? "" : "disabled",
          label: esc(
            `${fullDays[index]}, ${date(day.date)}: ${crc(day.total)}, ${day.count} ventas, ${day.units} unidades${day.available ? "" : ". Fuera del período disponible"}`,
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
    low,
    pending,
  });
}
