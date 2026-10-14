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
