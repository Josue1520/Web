import { view } from "./template.js";
import { isAdmin, model } from "../models/app-model.js";
import { $, brand, button, date, esc, icon } from "./components.js";
import { modules } from "../config.js";

export function shell() {
  const navigation = [
    ["Operación", ["home", "invoices", "sales-history"]],
    ["Abastecimiento", ["orders", "purchase-invoices", "suppliers"]],
    ["Catálogo", ["products", "inventory"]],
    ["Administración", ["reports", "users"]],
  ]
    .map(([group, keys]) =>
      view("shell-1", {
        group: group,
        slot2: keys
          .filter((key) => key !== "users" || isAdmin())
          .map((key) =>
            view("shell-2", {
              key: key,
              slot2: model.currentPage === key ? "active" : "",
              slot3: model.currentPage === key ? 'aria-current="page"' : "",
              icon: icon(key),
              slot5: modules.find((m) => m[0] === key)[1],
            }),
          )
          .join(""),
      }),
    )
    .join("");
  const label =
    modules.find((m) => m[0] === model.currentPage)?.[1] || "Resumen";
  $("#app").innerHTML = view("shell-3", {
    brand: brand,
    slot2: matchMedia("(min-width: 761px)").matches ? "open" : "",
    navigation: navigation,
    esc: esc(label),
    esc5: esc(model.state.me.name[0]),
    esc6: esc(model.state.me.surname[0]),
    esc7: esc(model.state.me.name),
    esc8: esc(model.state.me.role),
    button: button(`${icon("logout")} Salir`, "logout", "", "plain small"),
    date: date(model.state.today),
  });
}
