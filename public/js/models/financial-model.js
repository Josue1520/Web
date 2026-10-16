import { model } from "./app-model.js";

// Totales provisionales de pantalla. El servidor valida y recalcula al guardar.
export function saleTotals() {
  const discount = Number(model.saleDraft.discount) || 0;
  let gross = 0,
    net = 0,
    vat = 0,
    total = 0;
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  for (const l of model.cart) {
    const p = model.state.products.find((p) => p.id === l.productId);
    const g = round(p.price * l.qty),
      line = round(g - round((g * discount) / 100)),
      n = round(line / (1 + p.tax / 100));
    gross += g;
    total += line;
    net += n;
    vat += round(line - n);
  }
  return {
    gross: round(gross),
    net: round(net),
    vat: round(vat),
    total: round(total),
    discount: round(gross - total),
  };
}

export function purchaseTotals(items) {
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const sum = items.reduce(
    (r, line) => {
      const gross = round(Number(line.qty) * Number(line.price));
      const net = round(gross - round((gross * Number(line.discount)) / 100));
      return {
        subtotal: round(r.subtotal + net),
        vat: round(r.vat + round((net * Number(line.tax)) / 100)),
      };
    },
    { subtotal: 0, vat: 0 },
  );
  return { ...sum, total: round(sum.subtotal + sum.vat) };
}

// Proyección de cobro; el servidor vuelve a validar el reparto al emitir.
export function mixedPaymentTotals(total, draft) {
  const card = Math.round(Number(draft.cardPaid || 0) * 100);
  const sinpe = Math.round(Number(draft.sinpePaid || 0) * 100);
  const cash = Math.round(total * 100) - card - sinpe;
  return {
    cash: Math.max(0, cash) / 100,
    electronic: (card + sinpe) / 100,
    valid:
      Number.isFinite(card) &&
      Number.isFinite(sinpe) &&
      card >= 0 &&
      sinpe >= 0 &&
      cash >= 0 &&
      [cash, card, sinpe].filter((v) => v > 0).length >= 2,
    error:
      cash < 0
        ? "Tarjeta y SINPE no pueden superar el total."
        : "Indica importes para combinar al menos dos medios de pago.",
  };
}
