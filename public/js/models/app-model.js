export const model = {
  state: null,
  currentPage: "home",
  cart: [],
  currentReport: null,
  reportQuery: null,
  saleDraft: {
    customer: "Consumidor final",
    identification: "",
    discount: "0",
    payment: "Efectivo",
    paid: "",
    cardPaid: "0",
    sinpePaid: "0",
    notes: "",
  },
  events: new EventTarget(),
};

export const isAdmin = () => model.state?.me.role === "Administrador";

export async function api(path, method = "GET", body) {
  const r = await fetch(`/api/${path}`, {
    method,
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-Sipro-Request": "1" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const value = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path !== "login") {
      model.state = null;
      model.cart = [];
      model.events.dispatchEvent(new Event("session-expired"));
    }
    throw new Error(value.error || "No se pudo completar la operación.");
  }
  return value;
}

export const matches = (q, ...values) =>
  !q ||
  values.join(" ").toLocaleLowerCase("es").includes(q.toLocaleLowerCase("es"));

export function receiptWidth() {
  try {
    return localStorage.getItem("sipro-ticket-width") === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}
