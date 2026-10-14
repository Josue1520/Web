import { api, model } from "./app-model.js";

export function dashboardFilters() {
  model.dashboardFilters ??= {
    period: "week",
    date: model.state.today,
    days: [1, 2, 3, 4, 5, 6, 7],
    supplierId: "",
    from: model.state.today,
    to: model.state.today,
    year: model.state.today.slice(0, 4),
    weekMetric: "total",
    hourRange: "24",
  };
  return model.dashboardFilters;
}

export function loadDashboard(filters) {
  const params = new URLSearchParams({
    period: filters.period,
    date: filters.date,
    days: filters.days.join(","),
    supplierId: filters.supplierId,
    from: filters.from,
    to: filters.to,
    year: filters.year,
  });
  return api(`dashboard?${params}`);
}

export function productRankingFilters() {
  const monthStart = model.state.today.slice(0, 8) + "01";
  model.productRankingFilters ??= {
    from: monthStart < model.state.started ? model.state.started : monthStart,
    to: model.state.today,
    supplierId: "",
  };
  return model.productRankingFilters;
}

export function loadProductRanking(filters) {
  return api(`dashboard/products?${new URLSearchParams(filters)}`);
}
