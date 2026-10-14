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

const validSales = (state, currentDate) =>
  state.invoices.filter(
    (i) =>
      i.status === "Emitida" &&
      i.date >= state.started &&
      i.date <= currentDate,
  );

function aggregateProducts(invoices, products) {
  const totals = new Map();
  for (const invoice of invoices)
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
  return ranked(
    [...totals.values()].map(({ cents, ...row }) => ({
      ...row,
      total: amount(cents),
    })),
  );
}

function supplierFilter(state, query) {
  const id = query.get("supplierId") || "";
  ensure(
    !id ||
      (/^\d+$/.test(id) && state.suppliers.some((s) => s.id === Number(id))),
    "Proveedor no encontrado.",
  );
  return id;
}

function dateRange(state, from, to, currentDate) {
  ensure(
    validDate(from) && validDate(to),
    "Selecciona fechas válidas desde y hasta.",
  );
  ensure(from <= to, "La fecha desde no puede ser posterior a la fecha hasta.");
  ensure(
    from >= state.started && to <= currentDate,
    `El rango debe estar entre ${state.started} y ${currentDate}.`,
  );
  return { from, to };
}

export function dashboardProducts(
  state,
  query = new URLSearchParams(),
  currentDate = today(),
) {
  const monthStart = currentDate.slice(0, 8) + "01";
  const { from, to } = dateRange(
    state,
    query.get("from") ||
      (monthStart < state.started ? state.started : monthStart),
    query.get("to") || currentDate,
    currentDate,
  );
  const supplierId = supplierFilter(state, query);
  const products = new Map(state.products.map((p) => [p.id, p]));
  const all = aggregateProducts(
    validSales(state, currentDate).filter(
      (i) => i.date >= from && i.date <= to,
    ),
    products,
  ).filter(
    (p) =>
      !supplierId ||
      products
        .get(p.productId)
        ?.offers.some((o) => o.supplierId === Number(supplierId)),
  );
  const units = all.reduce((sum, p) => sum + p.units, 0);
  return {
    from,
    to,
    supplierId,
    supplier: supplierId
      ? state.suppliers.find((s) => s.id === Number(supplierId)).name
      : null,
    productCount: all.length,
    units,
    total: amount(all.reduce((sum, p) => sum + cents(p.total), 0)),
    products: all
      .slice(0, 10)
      .map((p) => ({ ...p, share: units ? (p.units / units) * 100 : 0 })),
    otherUnits: all.slice(10).reduce((sum, p) => sum + p.units, 0),
  };
}

export function salesDashboard(
  state,
  query = new URLSearchParams(),
  currentDate = today(),
  { includeProfit = false } = {},
) {
  const anchor = query.get("date") || currentDate;
  const period = query.get("period") || "week";
  ensure(
    ["day", "week", "month", "range"].includes(period),
    "Selecciona día, semana, mes o rango.",
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
  const supplierId = supplierFilter(state, query);
  const year = query.get("year") || anchor.slice(0, 4);
  ensure(
    /^\d{4}$/.test(year) &&
      year >= state.started.slice(0, 4) &&
      year <= currentDate.slice(0, 4),
    "Selecciona un año disponible.",
  );

  const monday = shift(anchor, 1 - weekday(anchor));
  const endOfMonth = dateOf(anchor);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  const ranges = {
    day: { from: anchor, to: anchor },
    week: { from: monday, to: shift(monday, 6) },
    month: { from: anchor.slice(0, 8) + "01", to: iso(endOfMonth) },
    year: {
      from: anchor.slice(0, 4) + "-01-01",
      to: anchor.slice(0, 4) + "-12-31",
    },
  };
  const sales = validSales(state, currentDate);
  const within = (invoice, range) =>
    invoice.date >= range.from && invoice.date <= range.to;
  const summaries = Object.fromEntries(
    Object.entries(ranges).map(([key, range]) => [
      key,
      { ...range, ...summary(sales.filter((i) => within(i, range))) },
    ]),
  );
  const range =
    period === "range"
      ? dateRange(
          state,
          query.get("from") || anchor,
          query.get("to") || anchor,
          currentDate,
        )
      : ranges[period];
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
  const allProducts = aggregateProducts(selected, products);
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
    const daySales = sales.filter((i) => i.date === date);
    return {
      date,
      weekday: index + 1,
      ...summary(daySales),
      units: daySales.reduce(
        (sum, i) => sum + i.items.reduce((sum, l) => sum + l.qty, 0),
        0,
      ),
      available: date >= state.started && date <= currentDate,
      selected:
        period === "week"
          ? selectedDays.includes(index + 1)
          : period === "day"
            ? date === anchor
            : true,
    };
  });
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const invoices = sales.filter((i) => i.date.startsWith(month));
    const missingCosts = invoices.filter(
      (i) =>
        !Number.isFinite(i.subtotal) ||
        i.items.some((l) => !Number.isFinite(l.cost)),
    ).length;
    return {
      month,
      ...summary(invoices),
      available:
        month >= state.started.slice(0, 7) && month <= currentDate.slice(0, 7),
      ...(includeProfit
        ? {
            profit: missingCosts
              ? null
              : amount(
                  invoices.reduce(
                    (sum, i) =>
                      sum +
                      cents(i.subtotal) -
                      cents(i.items.reduce((s, l) => s + l.cost * l.qty, 0)),
                    0,
                  ),
                ),
            missingCosts,
          }
        : {}),
    };
  });
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    total: 0,
  }));
  const hourFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Costa_Rica",
    hour: "2-digit",
    hourCycle: "h23",
  });
  let unknownTime = 0;
  for (const invoice of selected) {
    const timestamp = invoice.issuedAt ? new Date(invoice.issuedAt) : null;
    if (!timestamp || !Number.isFinite(timestamp.getTime())) {
      unknownTime++;
      continue;
    }
    const hour = Number(hourFormat.format(timestamp));
    hours[hour].count++;
    hours[hour].total += cents(invoice.total);
  }
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
    annual: { year, months },
    hourly: {
      unknownTime,
      hours: hours.map((h) => ({ ...h, total: amount(h.total) })),
    },
    week: { ...ranges.week, days: weekDays },
    topProducts: allProducts.slice(0, 10),
    productCount: allProducts.length,
    supplierId,
    supplierRanking,
    supplierGroupCount: supplierGroups.length,
    supplierOptions: state.suppliers.map((s) => ({ id: s.id, name: s.name })),
  };
}
