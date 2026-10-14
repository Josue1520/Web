import { esc, crc, table, tr } from "./components.js";
import { view } from "./template.js";

// SVG con escala común y valores reales; null interrumpe la serie, no inventa ceros.
export function lineChart(series, label, currency = true) {
  const format = currency
    ? crc
    : (n) =>
        new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(n);
  const values = series.filter((p) => p.value !== null).map((p) => p.value);
  const low = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const high = currency ? maximum : Math.ceil(maximum / 4) * 4;
  const x = (i) => 95 + (i * 830) / Math.max(1, series.length - 1);
  const y = (value) => 200 - ((value - low) / (high - low)) * 165;
  const base = y(0);
  let segment = [],
    paths = [];
  const finish = () => {
    if (!segment.length) return;
    const line = segment
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
    paths.push(
      view("dashboard-line-path", {
        line,
        area: `${line} L${segment.at(-1).x.toFixed(2)},${base.toFixed(2)} L${segment[0].x.toFixed(2)},${base.toFixed(2)} Z`,
      }),
    );
    segment = [];
  };
  series.forEach((p, i) => {
    if (p.value === null) finish();
    else segment.push({ x: x(i), y: y(p.value) });
  });
  finish();
  return view("dashboard-line-chart", {
    label: esc(label),
    grid: [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const value = low + (high - low) * f;
        return view("dashboard-line-grid", {
          y: y(value).toFixed(2),
          amount: esc(format(!values.some((n) => n !== 0) ? 0 : value)),
        });
      })
      .join(""),
    paths: paths.join(""),
    points: series
      .map((p, i) =>
        view("dashboard-line-point", {
          x: x(i).toFixed(2),
          y: y(p.value ?? 0).toFixed(2),
          hidden: p.value === null ? "hidden" : "",
          label: esc(p.label),
          title: esc(
            `${p.label}: ${p.value === null ? "Sin datos disponibles" : format(p.value)}`,
          ),
        }),
      )
      .join(""),
    dataTable: table(
      ["Período", currency ? "Ventas / importe" : "Cantidad de ventas"],
      series.map((p) =>
        tr([
          esc(p.label),
          p.value === null ? "No disponible" : format(p.value),
        ]),
      ),
    ),
  });
}
