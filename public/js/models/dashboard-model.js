import { api, model } from "./app-model.js";

export function dashboardFilters() {
  model.dashboardFilters ??= {
    period: "week",
    date: model.state.today,
    days: [1, 2, 3, 4, 5, 6, 7],
    supplierId: "",
  };
  return model.dashboardFilters;
}

export function loadDashboard(filters) {
  const params = new URLSearchParams({
    period: filters.period,
    date: filters.date,
    days: filters.days.join(","),
    supplierId: filters.supplierId,
  });
  return api(`dashboard?${params}`);
}
