import { checkoutSale } from "./sales-checkout.js";
import { api, isAdmin, model } from "../models/app-model.js";
import { login } from "./auth.js";
import { modules } from "../config.js";
import { shell } from "../views/shell.js";
import { dashboard } from "./dashboard.js";
import {
  editProduct,
  editSupplier,
  productsPage,
  suppliersPage,
  viewProduct,
  viewSupplier,
} from "./catalog.js";
import { adjustStock, inventoryPage } from "./inventory.js";
import { editOrder, ordersPage, viewOrder } from "./orders.js";
import { recommendedOrders } from "./order-recommendations.js";
import {
  confirmPurchasePayment,
  importPurchaseXml,
  newPurchaseInvoice,
  purchaseInvoicesPage,
  viewPurchaseInvoice,
} from "./purchases.js";
import {
  invoiceHistory,
  invoicesPage,
  savedSalesPage,
  viewInvoice,
  voidInvoiceForm,
} from "./sales.js";
import { reportsPage } from "./reports.js";
import { editUser, usersPage } from "./users.js";
import {
  $,
  button,
  date,
  esc,
  idLabel,
  offerRow,
  purchaseInvoiceContent,
  table,
  tr,
} from "../views/components.js";
import {
  openDialog,
  printDocument,
  printTicket,
  toast,
} from "../views/feedback.js";
import { view } from "../views/template.js";

export function render() {
  if (!model.state) return login();
  model.currentPage =
    location.hash.slice(1) ||
    (location.pathname.endsWith("Facturar.html") ? "invoices" : "home");
  if (
    !modules.some((m) => m[0] === model.currentPage) ||
    (model.currentPage === "users" && !isAdmin())
  )
    model.currentPage = "home";
  document.body.dataset.page = model.currentPage;
  shell();
  ({
    home: dashboard,
    suppliers: suppliersPage,
    products: productsPage,
    inventory: inventoryPage,
    orders: ordersPage,
    "purchase-invoices": purchaseInvoicesPage,
    invoices: invoicesPage,
    "sales-history": savedSalesPage,
    reports: reportsPage,
    users: usersPage,
  })[model.currentPage]();
  const listing = $("#listing"),
    controls = $("#content > .filters");
  if (listing && controls) {
    const workspace = document.createElement("section");
    workspace.className = "register-workspace";
    controls.before(workspace);
    workspace.append(controls, listing);
  }
}

export async function reload() {
  model.state = await api("state");
  render();
}

export async function dispatch(action, id, element) {
  if (action === "close") return $("#modal").close();
  if (action === "focus-code") return $('[name="barcode"]')?.focus();
  if (action === "focus-product") return $('[name="productId"]')?.focus();
  if (action === "focus-payment") return checkoutSale();
  if (action === "logout") {
    await api("logout", "POST");
    model.state = null;
    model.cart = [];
    model.saleDraft = {
      customer: "Consumidor final",
      identification: "",
      discount: "0",
      payment: "Efectivo",
      paid: "",
      notes: "",
    };
    location.hash = "home";
    return login();
  }
  const handlers = {
    "recommended-orders": recommendedOrders,
    "edit-supplier": editSupplier,
    "view-supplier": viewSupplier,
    "edit-product": editProduct,
    "view-product": viewProduct,
    "edit-user": editUser,
    "adjust-stock": adjustStock,
    "edit-order": editOrder,
    "view-order": viewOrder,
    "new-purchase-invoice": newPurchaseInvoice,
    "import-purchase-xml": importPurchaseXml,
    "view-purchase-invoice": viewPurchaseInvoice,
    "pay-purchase-invoice": confirmPurchasePayment,
    "invoice-history": invoiceHistory,
    "view-invoice": viewInvoice,
    "void-invoice": voidInvoiceForm,
  };
  if (handlers[action]) return handlers[action](id);
  if (action === "add-offer") {
    if (!model.state.suppliers.length)
      return toast("Primero registra un proveedor.", true);
    return $("#offers").insertAdjacentHTML("beforeend", offerRow());
  }
  if (action === "remove-offer") return element.closest(".offer-row").remove();
  if (action === "receive-order") {
    element.disabled = true;
    try {
      await api(`orders/${id}/receive`, "POST");
      $("#modal").close();
      await reload();
      toast("Pedido recibido. Existencias actualizadas.");
    } catch (error) {
      $("#modal .error").textContent = error.message;
      element.disabled = false;
    }
    return;
  }
  if (action === "clear-sale") {
    if (!model.cart.length) return;
    openDialog(
      "Vaciar venta en curso",
      view("dispatch-1", {
        keepButton: button("Conservar", "close"),
        clearButton: button("Vaciar venta", "confirm-clear-sale", "", "danger"),
      }),
    );
    return;
  }
  if (action === "confirm-clear-sale") {
    model.cart = [];
    $("#modal").close();
    return invoicesPage();
  }
  if (action === "print-purchase-invoice") {
    const invoice = model.state.purchaseInvoices.find(
      (i) => i.id === Number(id),
    );
    return printDocument(
      `Registro de compra ${idLabel("COM", invoice.id)}`,
      purchaseInvoiceContent(invoice),
    );
  }
  if (action === "print-invoice") {
    const i = model.state.invoices.find((i) => i.id === Number(id));
    return printTicket(i);
  }
  if (action === "print-report" && model.currentReport) {
    return printDocument(
      model.currentReport.title,
      view("dispatch-3", {
        date: date(model.currentReport.from),
        date2: date(model.currentReport.to),
        table: table(
          model.currentReport.columns,
          model.currentReport.rows.map((row) => tr(row.map(esc))),
        ),
      }),
    );
  }
  if (action === "excel-report" && model.reportQuery) {
    const r = await fetch(`/api/reports?${model.reportQuery}&format=xls`);
    if (!r.ok) throw new Error((await r.json()).error);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `SIPRO-${model.currentReport.type}.xls`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

$("#modal").addEventListener("close", () => {
  if (!$("#modal").open) $("#modal").replaceChildren();
});

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el)
    dispatch(el.dataset.action, el.dataset.id, el).catch((error) =>
      toast(error.message, true),
    );
});

window.addEventListener("hashchange", () => {
  $("#modal").close();
  if (model.state) reload().catch((error) => toast(error.message, true));
  else login();
});

model.events.addEventListener("session-expired", login);

(async () => {
  try {
    model.state = await api("state");
    render();
  } catch {
    login();
  }
})();

document.addEventListener("keydown", (e) => {
  if (model.currentPage !== "invoices" || $("#modal").open || !model.state)
    return;
  const actions = {
    F2: "focus-code",
    F4: "focus-product",
    F8: "invoice-history",
    F9: "focus-payment",
  };
  if (actions[e.key]) {
    e.preventDefault();
    dispatch(actions[e.key]).catch((error) => toast(error.message, true));
  }
  if (e.key === "F10" && !$("#open-checkout")?.disabled) {
    e.preventDefault();
    $("#sale-form")?.requestSubmit();
  }
});

matchMedia("(min-width: 761px)").addEventListener("change", (e) => {
  const menu = $("#workspace-menu");
  if (menu) menu.open = e.matches;
});
