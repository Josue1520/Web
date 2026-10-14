import { ensure } from "./domain.js";
import { today } from "./store.js";

const iso = (date) => date.toISOString().slice(0, 10);
const dateOf = (value) => new Date(`${value}T12:00:00Z`);
const weekday = (value) => dateOf(value).getUTCDay() || 7;
const shift = (value, days) => {
  const date = dateOf(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(dateOf(value).getTime()) &&
  iso(dateOf(value)) === value;
const cents = (value) => Math.round(value * 100);
const amount = (value) => value / 100;
const sumTotal = (invoices) =>
  amount(invoices.reduce((sum, i) => sum + cents(i.total), 0));
const summary = (invoices) => ({
  total: sumTotal(invoices),
  count: invoices.length,
});
const ranked = (rows) =>
  rows.sort(
    (a, b) =>
      b.units - a.units || b.total - a.total || a.productId - b.productId,
  );

export function salesDashboard(
  state,
  query = new URLSearchParams(),
  currentDate = today(),
) {
  const anchor = query.get("date") || currentDate;
  const period = query.get("period") || "week";
  ensure(
    ["day", "week", "month"].includes(period),
    "Selecciona día, semana o mes.",
  );
  ensure(
    validDate(anchor) && anchor >= state.started && anchor <= currentDate,
    `La fecha debe estar entre ${state.started} y ${currentDate}.`,
  );
  const rawDays = query.get("days");
  ensure(
    rawDays === null || rawDays === "" || /^[1-7](,[1-7]){0,6}$/.test(rawDays),
    "Selecciona días de lunes a domingo.",
  );
  const selectedDays =
    rawDays === null
      ? [1, 2, 3, 4, 5, 6, 7]
      : rawDays === ""
        ? []
        : rawDays.split(",").map(Number);
  ensure(
    new Set(selectedDays).size === selectedDays.length,
    "No repitas días de la semana.",
  );
  const supplierId = query.get("supplierId") || "";
  ensure(
    !supplierId ||
      (/^\d+$/.test(supplierId) &&
        state.suppliers.some((s) => s.id === Number(supplierId))),
    "Proveedor no encontrado.",
  );

  const monday = shift(anchor, 1 - weekday(anchor));
  const endOfMonth = dateOf(anchor);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  const ranges = {
    day: { from: anchor, to: anchor },
    week: { from: monday, to: shift(monday, 6) },
    month: { from: anchor.slice(0, 8) + "01", to: iso(endOfMonth) },
  };
  const sales = state.invoices.filter(
    (i) =>
      i.status === "Emitida" &&
      i.date >= state.started &&
      i.date <= currentDate,
  );
  const within = (invoice, range) =>
    invoice.date >= range.from && invoice.date <= range.to;
  const summaries = Object.fromEntries(
    Object.entries(ranges).map(([key, range]) => [
      key,
      { ...range, ...summary(sales.filter((i) => within(i, range))) },
    ]),
  );
  const range = ranges[period];
  const from = range.from < state.started ? state.started : range.from;
  const to = range.to > currentDate ? currentDate : range.to;
  const selected = sales.filter(
    (i) =>
      within(i, { from, to }) &&
      (period !== "week" || selectedDays.includes(weekday(i.date))),
  );
  let eligibleDays = 0;
  for (let day = from; day <= to; day = shift(day, 1))
    if (period !== "week" || selectedDays.includes(weekday(day)))
      eligibleDays++;

  const products = new Map(state.products.map((p) => [p.id, p]));
  const totals = new Map();
  for (const invoice of selected) {
    for (const line of invoice.items) {
      const product = products.get(line.productId);
      if (!totals.has(line.productId))
        totals.set(line.productId, {
          productId: line.productId,
          name: product?.name ?? line.name,
          code: product?.code ?? line.code,
          units: 0,
          cents: 0,
        });
      const row = totals.get(line.productId);
      row.units += line.qty;
      row.cents += cents(line.total);
    }
  }
  const allProducts = ranked(
    [...totals.values()].map(({ cents, ...row }) => ({
      ...row,
      total: amount(cents),
    })),
  );
  const supplierGroups = state.suppliers
    .map((supplier) => {
      const items = allProducts.filter((row) =>
        products
          .get(row.productId)
          ?.offers.some((offer) => offer.supplierId === supplier.id),
      );
      return {
        supplierId: supplier.id,
        supplier: supplier.name,
        units: items.reduce((sum, p) => sum + p.units, 0),
        total: amount(items.reduce((sum, p) => sum + cents(p.total), 0)),
        productCount: items.length,
        products: items,
      };
    })
    .filter((group) => group.products.length)
    .sort(
      (a, b) =>
        b.units - a.units || b.total - a.total || a.supplierId - b.supplierId,
    );
  const supplierRanking = (
    supplierId
      ? supplierGroups.filter((g) => g.supplierId === Number(supplierId))
      : supplierGroups.slice(0, 5)
  ).map((group) => ({
    ...group,
    products: group.products.slice(0, supplierId ? 10 : 3),
  }));

  const selectedSummary = summary(selected);
  const payments = ["Efectivo", "Tarjeta", "SINPE"].map((name) => {
    const result = summary(selected.filter((i) => i.payment === name));
    return {
      name,
      ...result,
      share: selectedSummary.total
        ? (result.total / selectedSummary.total) * 100
        : 0,
    };
  });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = shift(monday, index);
    return {
      date,
      weekday: index + 1,
      ...summary(sales.filter((i) => i.date === date)),
      available: date >= state.started && date <= currentDate,
      selected:
        period === "week"
          ? selectedDays.includes(index + 1)
          : period === "day"
            ? date === anchor
            : true,
    };
  });
  return {
    period,
    anchor,
    from,
    to,
    selectedDays,
    eligibleDays,
    summaries,
    selected: {
      ...selectedSummary,
      units: allProducts.reduce((sum, p) => sum + p.units, 0),
      averageTicket: selected.length
        ? Math.round((selectedSummary.total * 100) / selected.length) / 100
        : 0,
      dailyAverage: eligibleDays
        ? Math.round((selectedSummary.total * 100) / eligibleDays) / 100
        : 0,
      vat: amount(selected.reduce((sum, i) => sum + cents(i.vat), 0)),
    },
    payments,
    week: { ...ranges.week, days: weekDays },
    topProducts: allProducts.slice(0, 10),
    productCount: allProducts.length,
    supplierId,
    supplierRanking,
    supplierGroupCount: supplierGroups.length,
    supplierOptions: state.suppliers.map((s) => ({ id: s.id, name: s.name })),
  };
}
