import { $, crc, field } from "../views/components.js";
import { view } from "../views/template.js";
import { openDialog, toast } from "../views/feedback.js";
import { api, model, receiptWidth } from "../models/app-model.js";
import { saleTotals } from "../models/financial-model.js";
import { reload } from "./application.js";
import { viewInvoice } from "./sales.js";

export function checkoutSale() {
  if (!model.cart.length || $("#modal").open) return;
  if (!$("#sale-form").reportValidity()) return;
  const total = saleTotals().total;
  openDialog(
    "Pago",
    view("pos-checkout", {
      customer: field(
        "customer",
        "Nombre del cliente",
        model.saleDraft.customer,
        "text",
        "required",
      ),
      identification: field(
        "identification",
        "Identificación (opcional)",
        model.saleDraft.identification,
      ),
      notes: field("notes", "Observaciones", model.saleDraft.notes),
      paid: field(
        "paid",
        "Efectivo recibido (₡)",
        model.saleDraft.paid,
        "number",
        'min="0" step="0.01" inputmode="decimal"',
      ),
      total: crc(total),
      width: receiptWidth(),
    }),
  );
  const form = $("#checkout-form"),
    modal = $("#modal"),
    input = $('[name="paid"]', form);
  let busy = false;
  function paintPayment() {
    const cash = model.saleDraft.payment === "Efectivo";
    $("#cash-field").hidden = !cash;
    input.required = cash;
    input.disabled = !cash;
    $("#electronic-payment").hidden = cash;
    form
      .querySelectorAll("[data-payment]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.payment === model.saleDraft.payment),
        ),
      );
    $("#payment-label").textContent =
      `Pago con ${model.saleDraft.payment.toLowerCase()}`;
    const balance =
      Math.round((Number(model.saleDraft.paid || 0) - total) * 100) / 100;
    $("#change-label").textContent =
      balance < 0 ? "Falta por recibir" : "Vuelto";
    $("#change-amount").textContent = crc(Math.abs(balance));
    $("#change-amount").classList.toggle("pos-shortage", balance < 0);
    input.setCustomValidity(
      cash && balance < 0 ? "El efectivo recibido no cubre el total." : "",
    );
  }
  form.oninput = (e) => {
    if (e.target.name in model.saleDraft)
      model.saleDraft[e.target.name] = e.target.value;
    paintPayment();
  };
  form.onclick = (e) => {
    if (busy) return;
    const payment = e.target.closest("[data-payment]");
    if (payment) {
      model.saleDraft.payment = payment.dataset.payment;
      paintPayment();
    }
  };
  // Block closing while the server confirms the sale, so another checkout cannot submit it again.
  const guardCancel = (e) => {
    if (busy) e.preventDefault();
  };
  modal.addEventListener("cancel", guardCancel);
  modal.addEventListener(
    "close",
    () => modal.removeEventListener("cancel", guardCancel),
    { once: true },
  );
  form.onkeydown = (e) => {
    if (e.key === "F10") {
      e.preventDefault();
      if (!busy) form.requestSubmit();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    $(".error", form).textContent = "";
    const controls = [...modal.querySelectorAll("button, input")];
    controls.forEach((el) => (el.disabled = true));
    let invoice;
    try {
      invoice = await api("invoices", "POST", {
        ...model.saleDraft,
        items: model.cart,
      });
    } catch (error) {
      busy = false;
      controls.forEach((el) => (el.disabled = false));
      paintPayment();
      $(".error", form).textContent = error.message;
      return;
    }
    // Once saved, never expose a retry of the same sale if refreshing fails.
    model.cart = [];
    model.saleDraft = {
      customer: "Consumidor final",
      identification: "",
      discount: "0",
      payment: "Efectivo",
      paid: "",
      notes: "",
    };
    modal.close();
    try {
      await reload();
      viewInvoice(invoice.id);
      toast("Factura guardada e inventario actualizado.");
    } catch {
      location.reload();
    }
  };
  paintPayment();
  if (model.saleDraft.payment === "Efectivo") input.focus();
}
