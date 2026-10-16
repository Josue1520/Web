import { $, crc, field } from "../views/components.js";
import { view } from "../views/template.js";
import { openDialog, toast } from "../views/feedback.js";
import { api, model, receiptWidth } from "../models/app-model.js";
import { saleTotals, mixedPaymentTotals } from "../models/financial-model.js";
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
      cardPaid: field(
        "cardPaid",
        "Monto con tarjeta (₡)",
        model.saleDraft.cardPaid,
        "number",
        'min="0" step="0.01" inputmode="decimal"',
      ),
      sinpePaid: field(
        "sinpePaid",
        "Monto con SINPE (₡)",
        model.saleDraft.sinpePaid,
        "number",
        'min="0" step="0.01" inputmode="decimal"',
      ),
      total: crc(total),
      width: receiptWidth(),
      keys: ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "Borrar"]
        .map((key) =>
          view("pos-cash-key", { key, label: key === "." ? "Decimal" : key }),
        )
        .join(""),
      denominations: [1000, 2000, 5000, 10000, 20000, 50000]
        .map((value) =>
          view("pos-cash-denomination", { value, label: crc(value) }),
        )
        .join(""),
    }),
  );
  const form = $("#checkout-form"),
    modal = $("#modal"),
    input = $('[name="paid"]', form);
  let busy = false;
  // Keep a string for a trailing decimal point while using the keypad.
  let cashText = model.saleDraft.paid;
  function paintPayment() {
    const mixed = model.saleDraft.payment === "Mixto";
    const split = mixedPaymentTotals(total, model.saleDraft);
    const cash =
      model.saleDraft.payment === "Efectivo" || (mixed && split.cash > 0);
    $("#mixed-fields").hidden = !mixed;
    for (const name of ["cardPaid", "sinpePaid"]) {
      const field = form.elements[name];
      field.disabled = !mixed;
      field.required = mixed;
      field.setCustomValidity(mixed && !split.valid ? split.error : "");
    }
    $("#mixed-cash-amount").textContent = crc(split.cash);
    $("#cash-field").hidden = !cash;
    $("#cash-keyboard").hidden = !cash;
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
      model.saleDraft.payment === "Mixto"
        ? "Pago mixto"
        : `Pago con ${model.saleDraft.payment.toLowerCase()}`;
    const balance =
      Math.round(
        (Number(model.saleDraft.paid || 0) - (mixed ? split.cash : total)) *
          100,
      ) / 100;
    $("#change-label").textContent =
      balance < 0 ? "Falta por recibir" : "Vuelto";
    $("#change-amount").textContent = crc(Math.abs(balance));
    $("#change-amount").classList.toggle("pos-shortage", balance < 0);
    input.setCustomValidity(
      cash && balance < 0 ? "El efectivo recibido no cubre el total." : "",
    );
  }
  function setCash(value) {
    cashText = value;
    input.value = value.endsWith(".") ? value.slice(0, -1) : value;
    model.saleDraft.paid = input.value;
    paintPayment();
  }
  form.oninput = (e) => {
    if (e.target.name in model.saleDraft)
      model.saleDraft[e.target.name] = e.target.value;
    if (e.target === input) cashText = input.value;
    paintPayment();
  };
  form.onclick = (e) => {
    if (busy) return;
    const payment = e.target.closest("[data-payment]");
    if (payment) {
      model.saleDraft.payment = payment.dataset.payment;
      paintPayment();
    }
    const key = e.target.closest("[data-cash-key]")?.dataset.cashKey;
    if (key) {
      if (key === "Borrar") setCash(cashText.slice(0, -1));
      else if (key === ".") {
        if (!cashText.includes(".")) setCash((cashText || "0") + ".");
      } else if (
        cashText.length < 14 &&
        (!cashText.includes(".") || cashText.split(".")[1].length < 2)
      )
        setCash(cashText + key);
    }
    const denomination = e.target.closest("[data-cash-add]")?.dataset.cashAdd;
    if (denomination)
      setCash(
        String(
          Math.round((Number(cashText || 0) + Number(denomination)) * 100) /
            100,
        ),
      );
  };
  $("#exact-cash").onclick = () =>
    setCash(
      String(
        model.saleDraft.payment === "Mixto"
          ? mixedPaymentTotals(total, model.saleDraft).cash
          : total,
      ),
    );
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
        paid:
          model.saleDraft.payment === "Mixto" &&
          mixedPaymentTotals(total, model.saleDraft).cash === 0
            ? 0
            : model.saleDraft.paid,
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
      cardPaid: "0",
      sinpePaid: "0",
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
