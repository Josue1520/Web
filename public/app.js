"use strict";
const $ = (s, root = document) => root.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const crc = (n) =>
  new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" }).format(
    n,
  );
const date = (s) =>
  s
    ? new Intl.DateTimeFormat("es-CR", {
        dateStyle: "medium",
        timeZone: "America/Costa_Rica",
      }).format(new Date(`${s}T12:00:00Z`))
    : "—";
const idLabel = (prefix, id) => `${prefix}-${String(id).padStart(5, "0")}`;
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  products:
    '<path d="m3 7 9-4 9 4v12l-9 4-9-4zM3 7l9 4 9-4M12 11v12M7 5l10 4"/>',
  suppliers:
    '<path d="M3 21V6h11v15M14 11h7v10M1 21h22M6 10h2M10 10h1M6 14h2M6 18h2M17 15h1M17 18h1"/>',
  inventory: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  orders: '<path d="M6 5h12v17H6zM9 2h6v6H9zM9 12h6M9 16h6"/>',
  invoices: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2zM8 7h8M8 11h8M8 15h5"/>',
  reports: '<path d="M4 3v18h18M8 17v-5M13 17V7M18 17V3"/>',
  users:
    '<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M19 15a6 6 0 0 1 3 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
  logout: '<path d="M9 3H3v18h6M9 12h12m-5-5 5 5-5 5"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.products}</svg>`;
const modules = [
  ["home", "Resumen"],
  ["suppliers", "Proveedores"],
  ["products", "Productos"],
  ["inventory", "Inventario"],
  ["orders", "Pedidos"],
  ["invoices", "Facturación"],
  ["reports", "Reportes"],
  ["users", "Usuarios"],
];
let state,
  currentPage = "home",
  cart = [],
  toastTimer,
  currentReport,
  reportQuery;
let saleDraft = {
  customer: "Consumidor final",
  identification: "",
  discount: "0",
  payment: "Efectivo",
  paid: "",
  notes: "",
};
const isAdmin = () => state?.me.role === "Administrador";
async function api(path, method = "GET", body) {
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
      state = null;
      cart = [];
      login();
    }
    throw new Error(value.error || "No se pudo completar la operación.");
  }
  return value;
}
function toast(message, failure = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `show${failure ? " failure" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 5000);
}
const statusBadge = (s) =>
  `<span class="badge ${["Activo", "Emitida", "Recibido", "Normal"].includes(s) ? "green" : ["Pendiente", "Bajo"].includes(s) ? "amber" : ["Agotado", "Anulada"].includes(s) ? "red" : "gray"}">${esc(s)}</span>`;
const button = (label, action, id = "", style = "") =>
  `<button type="button" class="btn ${style}" data-action="${action}" data-id="${id}">${label}</button>`;
const table = (heads, rows, empty = "No hay registros para mostrar.") =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${heads.length}" class="empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const options = (items, value) =>
  items
    .map((i) => {
      const [v, label] = Array.isArray(i) ? i : [i, i];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
function field(name, label, value = "", type = "text", extra = "") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function select(name, label, items, value = "", extra = "") {
  return `<label class="field">${label}<select name="${name}" aria-label="${esc(label)}" ${extra}>${options(items, value)}</select></label>`;
}
const activeOptions = [
  ["true", "Activo"],
  ["false", "Inactivo"],
];
const head = (title, subtitle, action = "") =>
  `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
const brand = `<div class="brand"><img src="/favicon.svg" alt=""><div>SIPRO<small>Gestión del negocio</small></div></div>`;
const filters = (extra) =>
  `<div class="filters">${field("search", "Buscar", "", "search", 'placeholder="Nombre, código o identificación…" class="filter-control"')}${extra || ""}</div>`;
function login() {
  $("#modal").close();
  $("#app").innerHTML =
    `<div class="login-layout"><section class="login-story">${brand}<div class="eyebrow story-label">Mini súper · Licorera</div><h1>Tu negocio,<br>en orden.</h1><p>Conecta tus proveedores, pedidos e inventario en un solo lugar.</p><div class="login-features"><span>Compras organizadas</span><span>Existencias al día</span><span>Decisiones con información</span></div></section><main class="login-panel"><div class="login-card"><div class="eyebrow">Bienvenido a SIPRO</div><h1>Iniciar sesión</h1><p class="muted">Ingresa tus credenciales para continuar.</p><form id="login-form" class="stack">${field("username", "Usuario", "", "text", 'required autocomplete="username" autofocus')}${field("password", "Contraseña", "", "password", 'required autocomplete="current-password"')}<div class="error" role="alert"></div><button class="btn primary block">Ingresar al sistema ${icon("arrow")}</button></form><div class="demo-box"><strong>Accesos de demostración</strong>Administrador: <b>admin</b> / <b>Admin123!</b><br>Dependiente: <b>dependiente</b> / <b>Caja123!</b></div><p class="login-footer">Proyecto académico · Los datos se conservan en este servidor.</p></div></main></div>`;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = $("button", form);
    btn.disabled = true;
    try {
      await api("login", "POST", Object.fromEntries(new FormData(form)));
      state = await api("state");
      render();
    } catch (error) {
      $(".error", form).textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
}
function shell() {
  const label = modules.find((m) => m[0] === currentPage)?.[1] || "Resumen";
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar">${brand}<div class="nav-caption">ESPACIO DE TRABAJO</div><nav class="nav-links" aria-label="Módulos">${modules
      .filter((m) => m[0] !== "users" || isAdmin())
      .map(
        ([key, label]) =>
          `<a href="#${key}" class="${currentPage === key ? "active" : ""}" ${currentPage === key ? 'aria-current="page"' : ""}>${icon(key)}${label}</a>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><b>Sistema de pedidos a proveedores</b><br>Mini súper / Licorera<br>Versión académica · 1.0</div></aside><div class="main-wrap"><header class="topbar"><div class="breadcrumb">Mi negocio &nbsp; / &nbsp; <strong>${label}</strong></div><div class="user-info"><div class="avatar">${esc(state.me.name[0])}${esc(state.me.surname[0])}</div><div><b>${esc(state.me.name)}</b><small>${esc(state.me.role)}</small></div>${button(`${icon("logout")} Salir`, "logout", "", "plain small")}</div></header><main class="content" id="content"></main></div></div>`;
}
function render() {
  if (!state) return login();
  currentPage =
    location.hash.slice(1) ||
    (location.pathname.endsWith("Facturar.html") ? "invoices" : "home");
  if (
    !modules.some((m) => m[0] === currentPage) ||
    (currentPage === "users" && !isAdmin())
  )
    currentPage = "home";
  shell();
  ({
    home: dashboard,
    suppliers: suppliersPage,
    products: productsPage,
    inventory: inventoryPage,
    orders: ordersPage,
    invoices: invoicesPage,
    reports: reportsPage,
    users: usersPage,
  })[currentPage]();
}
async function reload() {
  state = await api("state");
  render();
}
function dashboard() {
  const low = state.products.filter((p) => p.active && p.stock <= p.minimum);
  const pending = state.orders.filter((o) => o.status === "Pendiente");
  const sales = state.invoices.filter(
    (i) => i.date === state.today && i.status === "Emitida",
  );
  const stats = [
    [
      "Ventas de hoy",
      crc(sales.reduce((n, i) => n + i.total, 0)),
      `${sales.length} facturas emitidas`,
      "invoices",
    ],
    [
      "Pedidos pendientes",
      pending.length,
      "Por recibir de tus proveedores",
      "orders",
    ],
    [
      "Productos activos",
      state.products.filter((p) => p.active).length,
      "En tu catálogo unificado",
      "products",
    ],
    [
      "Existencias bajas",
      low.length,
      "Productos que necesitan atención",
      "alert",
    ],
  ];
  $("#content").innerHTML =
    `${head("Resumen del negocio", `${date(state.today)} · Así va tu operación hoy.`, `<a href="#invoices" class="btn primary">＋ Nueva factura</a>`)}<div class="stats">${stats.map(([label, value, note, ico]) => `<article class="stat ${ico === "alert" ? "warn" : ""}"><div class="stat-top">${label}${icon(ico)}</div><strong>${value}</strong><small>${note}</small></article>`).join("")}</div>${low.length ? `<div class="notice">${icon("alert")}<div><b>Es momento de reabastecer.</b> Hay ${low.length} productos en su nivel mínimo o por debajo. <a href="#orders">Crear un pedido →</a></div></div>` : ""}<div class="dashboard-grid"><div><section class="card"><div class="card-header"><h2>Atención al inventario</h2><a href="#inventory">Ver inventario →</a></div>${table(
      ["Producto", "Disponible", "Mínimo", "Nivel"],
      low
        .slice(0, 5)
        .map((p) =>
          tr([
            `<div class="row-title"><span class="product-icon">${icon("products")}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.presentation)}</small></div></div>`,
            p.stock,
            p.minimum,
            statusBadge(p.stock ? "Bajo" : "Agotado"),
          ]),
        ),
      "Todo está en orden. No hay productos con existencias bajas.",
    )}</section><section class="card"><div class="card-header"><h2>Actividad reciente</h2><span class="badge">Inventario</span></div><div class="card-body">${state.movements
      .slice(-4)
      .reverse()
      .map(
        (m) =>
          `<div class="activity"><div><strong>${esc(m.product)}</strong><p>${esc(m.reason)} · ${date(m.date)}</p></div><b>${m.delta > 0 ? "+" : ""}${m.delta}</b></div>`,
      )
      .join(
        "",
      )}</div></section></div><div><section class="card"><div class="card-header"><h2>Accesos rápidos</h2></div><div class="card-body quick-actions">${[
      ["invoices", "Registrar venta"],
      ["orders", "Crear pedido"],
      ["products", "Consultar catálogo"],
      ["reports", "Ver reportes"],
    ]
      .map(
        ([key, label]) =>
          `<a class="quick-action" href="#${key}">${icon(key)}${label}</a>`,
      )
      .join(
        "",
      )}</div></section><section class="card"><div class="card-header"><h2>Pedidos por recibir</h2><span class="badge amber">${pending.length}</span></div><div class="card-body">${
      pending.length
        ? pending
            .slice(-4)
            .reverse()
            .map(
              (o) =>
                `<div class="activity"><div><strong>${esc(o.supplier)}</strong><p>${idLabel("PED", o.id)} · ${date(o.date)}</p></div>${button("Ver", "view-order", o.id, "small")}</div>`,
            )
            .join("")
        : `<p class="muted">No tienes pedidos pendientes.</p><a href="#orders">Preparar el primer pedido →</a>`
    }</div></section></div></div><p class="welcome-note">SIPRO · Proveedores, compras y ventas conectados.</p>`;
}
function attachFilter(renderRows) {
  const controls = $("#content .filters");
  controls?.addEventListener("input", () =>
    renderRows(
      Object.fromEntries(
        [...controls.querySelectorAll("[name]")].map((e) => [e.name, e.value]),
      ),
    ),
  );
  renderRows({});
}
const matches = (q, ...values) =>
  !q ||
  values.join(" ").toLocaleLowerCase("es").includes(q.toLocaleLowerCase("es"));
function suppliersPage() {
  $("#content").innerHTML =
    `${head("Proveedores", "Contactos, catálogos y condiciones comerciales.", isAdmin() ? button("＋ Nuevo proveedor", "edit-supplier", "", "primary") : "")}${filters(select("active", "Estado", [["", "Todos"], ...activeOptions]))}<div class="card" id="listing"></div>`;
  attachFilter((f) => {
    const rows = state.suppliers.filter(
      (s) =>
        matches(f.search, s.name, s.identification, s.contact) &&
        (!f.active || String(s.active) === f.active),
    );
    $("#listing").innerHTML = table(
      [
        "Proveedor",
        "Contacto",
        "Condición de pago",
        "Entrega",
        "Estado",
        "Acciones",
      ],
      rows.map((s) =>
        tr([
          `<strong>${esc(s.name)}</strong><small>${esc(s.idType)} · ${esc(s.identification)}</small>`,
          `${esc(s.contact)}<small>${esc(s.phone)} · ${esc(s.email)}</small>`,
          `${esc(s.terms)}<small>${s.days} días · Mínimo ${crc(s.minimum)}</small>`,
          `${s.delivery} días`,
          statusBadge(s.active ? "Activo" : "Inactivo"),
          `<div class="actions">${button("Catálogo", "view-supplier", s.id, "small")}${isAdmin() ? button("Editar", "edit-supplier", s.id, "small") : ""}</div>`,
        ]),
      ),
    );
  });
}
function productsPage() {
  $("#content").innerHTML =
    `${head("Catálogo de productos", "Precios de venta con IVA incluido y proveedores asociados.", isAdmin() ? button("＋ Nuevo producto", "edit-product", "", "primary") : "")}${filters(select("category", "Categoría", [["", "Todas"], ...new Set(state.products.map((p) => p.category))]) + select("active", "Estado", [["", "Todos"], ...activeOptions]))}<div class="card" id="listing"></div>`;
  attachFilter((f) => {
    const rows = state.products.filter(
      (p) =>
        matches(f.search, p.code, p.name) &&
        (!f.category || p.category === f.category) &&
        (!f.active || String(p.active) === f.active),
    );
    $("#listing").innerHTML = table(
      [
        "Producto",
        "Categoría",
        "Precio de venta",
        "Existencia",
        "Estado",
        "Acciones",
      ],
      rows.map((p) =>
        tr([
          `<strong>${esc(p.name)}</strong><small>${esc(p.code)} · ${esc(p.presentation)}</small>`,
          esc(p.category),
          crc(p.price),
          p.stock,
          statusBadge(p.active ? "Activo" : "Inactivo"),
          `<div class="actions">${button("Detalle", "view-product", p.id, "small")}${isAdmin() ? button("Editar", "edit-product", p.id, "small") : ""}</div>`,
        ]),
      ),
    );
  });
}
function inventoryPage() {
  const low = state.products.filter(
    (p) => p.active && p.stock <= p.minimum,
  ).length;
  $("#content").innerHTML =
    `${head("Inventario", "Existencias y trazabilidad de entradas y salidas.", isAdmin() ? button("＋ Registrar movimiento", "adjust-stock", "", "primary") : "")}${low ? `<div class="notice">${icon("alert")} ${low} productos activos necesitan reabastecimiento.</div>` : ""}${filters(
      select("level", "Nivel", [
        ["", "Todos"],
        ["low", "Bajo o agotado"],
        ["normal", "Normal"],
      ]),
    )}<div class="card" id="listing"></div><section class="card"><div class="card-header"><h2>Movimientos recientes</h2><small>Últimos 50 movimientos</small></div>${table(
      ["Fecha", "Producto", "Movimiento", "Saldo", "Motivo", "Usuario"],
      state.movements
        .slice(-50)
        .reverse()
        .map((m) =>
          tr([
            date(m.date),
            esc(m.product),
            `${m.delta > 0 ? "+" : ""}${m.delta}`,
            m.balance,
            esc(m.reason),
            esc(m.user),
          ]),
        ),
    )}</section>`;
  attachFilter((f) => {
    const rows = state.products.filter(
      (p) =>
        matches(f.search, p.code, p.name) &&
        (!f.level ||
          (f.level === "low" ? p.stock <= p.minimum : p.stock > p.minimum)),
    );
    $("#listing").innerHTML = table(
      ["Producto", "Categoría", "Existencia", "Mínimo", "Nivel", "Acciones"],
      rows.map((p) =>
        tr([
          `<strong>${esc(p.name)}</strong><small>${esc(p.code)} · ${esc(p.presentation)}</small>`,
          esc(p.category),
          p.stock,
          p.minimum,
          statusBadge(
            p.stock === 0
              ? "Agotado"
              : p.stock <= p.minimum
                ? "Bajo"
                : "Normal",
          ),
          `${button("Proveedores", "view-product", p.id, "small")} ${isAdmin() ? button("Editar mínimo", "edit-product", p.id, "small") : ""}`,
        ]),
      ),
    );
  });
}
function ordersPage() {
  $("#content").innerHTML =
    `${head("Pedidos a proveedores", "Prepara tus compras y registra su recepción.", button("＋ Nuevo pedido", "edit-order", "", "primary"))}${filters(select("status", "Estado", [["", "Todos"], "Pendiente", "Recibido"]) + select("supplier", "Proveedor", [["", "Todos"], ...state.suppliers.map((s) => [s.id, s.name])]) + field("from", "Desde", "", "date", `min="${state.started}" max="${state.today}"`) + field("to", "Hasta", "", "date", `min="${state.started}" max="${state.today}"`))}<div class="card" id="listing"></div>`;
  attachFilter((f) => {
    const rows = state.orders.filter(
      (o) =>
        matches(f.search, idLabel("PED", o.id), o.supplier) &&
        (!f.status || o.status === f.status) &&
        (!f.supplier || String(o.supplierId) === f.supplier) &&
        (!f.from || o.date >= f.from) &&
        (!f.to || o.date <= f.to),
    );
    $("#listing").innerHTML = table(
      ["Pedido", "Proveedor", "Fecha", "Total", "Estado", "Acciones"],
      rows
        .slice()
        .reverse()
        .map((o) =>
          tr([
            idLabel("PED", o.id),
            esc(o.supplier),
            date(o.date),
            crc(o.total),
            statusBadge(o.status),
            `<div class="actions">${button("Ver", "view-order", o.id, "small")}${o.status === "Pendiente" ? button("Editar", "edit-order", o.id, "small") : ""}</div>`,
          ]),
        ),
      "Aún no hay pedidos. Crea uno para comenzar a abastecer tu negocio.",
    );
  });
}
function usersPage() {
  $("#content").innerHTML =
    `${head("Usuarios y permisos", "Controla quién puede acceder al sistema.", button("＋ Nuevo usuario", "edit-user", "", "primary"))}<div class="notice info"><div><b>Administrador:</b> gestiona usuarios, proveedores, productos e inventario; recibe pedidos, anula facturas y exporta reportes.<br><b>Dependiente:</b> consulta catálogos y existencias, prepara pedidos, factura y consulta reportes operativos.</div></div>${filters()}<div class="card" id="listing"></div>`;
  attachFilter((f) => {
    $("#listing").innerHTML = table(
      ["Nombre", "Usuario", "Correo", "Rol", "Estado", "Acciones"],
      state.users
        .filter((u) =>
          matches(f.search, u.name, u.surname, u.username, u.identification),
        )
        .map((u) =>
          tr([
            `${esc(u.name)} ${esc(u.surname)}<small>${esc(u.identification)}</small>`,
            esc(u.username),
            esc(u.email),
            esc(u.role),
            statusBadge(u.active ? "Activo" : "Inactivo"),
            button("Editar", "edit-user", u.id, "small"),
          ]),
        ),
    );
  });
}
function openDialog(title, content) {
  const modal = $("#modal");
  modal.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="close" type="button" data-action="close" aria-label="Cerrar">×</button></div><div class="dialog-body">${content}</div>`;
  if (!modal.open) modal.showModal();
}
function editForm(title, content, submit) {
  openDialog(
    title,
    `<form id="edit-form"><div class="form-grid">${content}</div><p class="error" role="alert"></p><div class="dialog-footer">${button("Cancelar", "close")}<button class="btn primary" type="submit">Guardar</button></div></form>`,
  );
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      await submit(Object.fromEntries(new FormData(form)), form);
      $("#modal").close();
      await reload();
      toast("Cambios guardados correctamente.");
    } catch (error) {
      $(".error", form).textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
}
function editSupplier(id) {
  const s = state.suppliers.find((s) => s.id === Number(id)) || {
    active: true,
    days: 0,
    delivery: 1,
    minimum: 0,
    terms: "Contado",
    idType: "Jurídica",
  };
  editForm(
    s.id ? "Editar proveedor" : "Nuevo proveedor",
    `${field("name", "Nombre o razón social", s.name, "text", "required")}${select("idType", "Tipo de identificación", ["Física", "Jurídica", "DIMEX"], s.idType, s.id ? "disabled" : "")}${field("identification", "Identificación", s.identification, "text", s.id ? "disabled" : "required")}${field("contact", "Contacto principal", s.contact, "text", "required")}${field("phone", "Teléfono", s.phone, "tel", "required")}${field("email", "Correo electrónico", s.email, "email", "required")}${field("address", "Dirección", s.address, "text", "required")}${select("terms", "Condición de pago", ["Contado", "Crédito"], s.terms)}${field("days", "Plazo de pago (días)", s.days, "number", 'required min="0" max="365"')}${field("delivery", "Entrega (días)", s.delivery, "number", 'required min="0" max="365"')}${field("minimum", "Pedido mínimo (₡)", s.minimum, "number", 'required min="0" step="0.01"')}${select("active", "Estado", activeOptions, s.active)}`,
    (b) =>
      api(`suppliers${s.id ? `/${s.id}` : ""}`, s.id ? "PUT" : "POST", {
        ...b,
        idType: s.idType,
        active: b.active === "true",
        ...(!s.id ? { idType: b.idType } : {}),
      }),
  );
}
function offerRow(o = {}) {
  return `<div class="offer-row">${select(
    "offerSupplier",
    "Proveedor",
    state.suppliers.map((s) => [
      s.id,
      `${s.name}${s.active ? "" : " (inactivo)"}`,
    ]),
    o.supplierId,
  )}${field("offerCost", "Costo (₡)", o.cost ?? "", "number", 'required min="0.01" step="0.01"')}${field("offerDelivery", "Entrega (días)", o.delivery ?? 1, "number", 'required min="0" max="365"')}${button("×", "remove-offer", "", "small danger")}</div>`;
}
function editProduct(id) {
  const p = state.products.find((p) => p.id === Number(id)) || {
    active: true,
    minimum: 5,
    stock: 0,
    cost: 0,
    tax: 13,
    offers: [],
  };
  editForm(
    p.id ? "Editar producto" : "Nuevo producto",
    `${field("code", "Código", p.code, "text", "required")}${field("name", "Nombre", p.name, "text", "required")}${field("category", "Categoría", p.category, "text", 'required list="categories"')}<datalist id="categories">${[...new Set(state.products.map((p) => p.category))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>${field("presentation", "Presentación / unidad", p.presentation, "text", "required")}${field("price", "Precio de venta, IVA incluido (₡)", p.price, "number", 'required min="0.01" step="0.01"')}${field("tax", "IVA (%)", p.tax, "number", 'required min="0" max="100" step="0.01"')}${field("minimum", "Stock mínimo", p.minimum, "number", 'required min="0" step="1"')}${select("active", "Estado", activeOptions, p.active)}${!p.id ? field("stock", "Existencia inicial", p.stock, "number", 'required min="0" step="1"') + field("cost", "Costo unitario inicial (₡)", p.cost, "number", 'required min="0" step="0.01"') : ""}<div class="wide">${field("description", "Descripción", p.description)}<div class="offer-title"><h3>Proveedores asociados</h3>${button("＋ Asociar", "add-offer", "", "small")}</div><div id="offers">${p.offers.map(offerRow).join("")}</div><p class="form-help">Asocia un proveedor y su precio de compra para poder incluir el producto en nuevos pedidos.</p></div>`,
    (b, form) =>
      api(`products${p.id ? `/${p.id}` : ""}`, p.id ? "PUT" : "POST", {
        ...b,
        active: b.active === "true",
        offers: [...form.querySelectorAll(".offer-row")].map((row) => ({
          supplierId: $('[name="offerSupplier"]', row).value,
          cost: $('[name="offerCost"]', row).value,
          delivery: $('[name="offerDelivery"]', row).value,
        })),
      }),
  );
}
function editUser(id) {
  const u = state.users.find((u) => u.id === Number(id)) || {
    active: true,
    role: "Dependiente",
  };
  editForm(
    u.id ? "Editar usuario" : "Nuevo usuario",
    `${field("identification", "Identificación", u.identification, "text", u.id ? "disabled" : "required")}${field("name", "Nombre", u.name, "text", "required")}${field("surname", "Apellidos", u.surname, "text", "required")}${field("email", "Correo electrónico", u.email, "email", "required")}${field("username", "Nombre de usuario", u.username, "text", 'required autocomplete="off"')}${field("password", u.id ? "Nueva contraseña (opcional)" : "Contraseña", "", "password", `${u.id ? "" : "required"} minlength="8" autocomplete="new-password"`)}${select("role", "Rol", ["Administrador", "Dependiente"], u.role)}${select("active", "Estado", activeOptions, u.active)}`,
    (b) =>
      api(`users${u.id ? `/${u.id}` : ""}`, u.id ? "PUT" : "POST", {
        ...b,
        active: b.active === "true",
      }),
  );
}
function adjustStock() {
  editForm(
    "Registrar movimiento de inventario",
    `${select(
      "productId",
      "Producto",
      state.products.map((p) => [p.id, `${p.name} · ${p.stock} disponibles`]),
    )}${field("delta", "Cantidad (+ entrada / − salida)", "", "number", 'required step="1"')}<div class="wide">${field("reason", "Motivo del movimiento", "", "text", 'required placeholder="Por ejemplo: ajuste por conteo físico"')}<p class="form-help">Las ventas y recepciones de pedidos registran sus movimientos automáticamente.</p></div>`,
    (b) => api("stock", "POST", b),
  );
}
function viewProduct(id) {
  const p = state.products.find((p) => p.id === Number(id));
  openDialog(
    esc(p.name),
    `<div class="detail-grid"><div><small>Código</small>${esc(p.code)}</div><div><small>Categoría</small>${esc(p.category)}</div><div><small>Presentación</small>${esc(p.presentation)}</div><div><small>Precio de venta</small>${crc(p.price)} · IVA ${p.tax}% incluido</div><div><small>Existencias / mínimo</small>${p.stock} / ${p.minimum}</div><div><small>Estado</small>${statusBadge(p.active ? "Activo" : "Inactivo")}</div></div><p>${esc(p.description)}</p><h3>Proveedores asociados</h3>${table(
      ["Proveedor", "Costo de compra", "Entrega", "Estado"],
      p.offers.map((o) => {
        const s = state.suppliers.find((s) => s.id === o.supplierId);
        return tr([
          esc(s.name),
          crc(o.cost),
          `${o.delivery} días`,
          statusBadge(s.active ? "Activo" : "Inactivo"),
        ]);
      }),
      "Este producto todavía no tiene proveedores asociados.",
    )}`,
  );
}
function viewSupplier(id) {
  const s = state.suppliers.find((s) => s.id === Number(id));
  openDialog(
    esc(s.name),
    `<div class="detail-grid"><div><small>Identificación</small>${esc(s.idType)} · ${esc(s.identification)}</div><div><small>Contacto</small>${esc(s.contact)}</div><div><small>Teléfono y correo</small>${esc(s.phone)}<br>${esc(s.email)}</div><div><small>Dirección</small>${esc(s.address)}</div><div><small>Condición de pago</small>${esc(s.terms)} · ${s.days} días</div><div><small>Entrega / pedido mínimo</small>${s.delivery} días · ${crc(s.minimum)}</div></div><h3>Catálogo del proveedor</h3>${table(
      ["Producto", "Presentación", "Costo de compra", "Disponible"],
      state.products
        .filter((p) => p.offers.some((o) => o.supplierId === s.id))
        .map((p) =>
          tr([
            `${esc(p.name)}<small>${esc(p.code)}</small>`,
            esc(p.presentation),
            crc(p.offers.find((o) => o.supplierId === s.id).cost),
            statusBadge(p.active && s.active ? "Activo" : "Inactivo"),
          ]),
        ),
    )}`,
  );
}
function editOrder(id) {
  const order = state.orders.find((o) => o.id === Number(id));
  let supplierId =
    order?.supplierId ?? state.suppliers.find((s) => s.active)?.id;
  let items = order
    ? order.items.map((l) => ({ productId: l.productId, qty: l.qty }))
    : [];
  openDialog(
    order ? `Editar ${idLabel("PED", order.id)}` : "Nuevo pedido a proveedor",
    `<form id="order-form" class="stack-gap">${select(
      "supplierId",
      "Proveedor",
      state.suppliers.filter((s) => s.active).map((s) => [s.id, s.name]),
      supplierId,
      "required",
    )}<div id="order-terms" class="notice info"></div><div id="order-picker" class="line-add"></div><div id="order-lines"></div>${field("notes", "Observaciones", order?.notes)}<p class="error" role="alert"></p><div class="dialog-footer">${button("Cancelar", "close")}<button class="btn primary" type="submit">Revisar pedido</button></div></form>`,
  );
  const form = $("#order-form");
  function paint() {
    const s = state.suppliers.find((s) => s.id === Number(supplierId));
    $("#order-terms").textContent = s
      ? `${s.terms} · Plazo de pago: ${s.days} días · Entrega: ${s.delivery} días · Pedido mínimo: ${crc(s.minimum)}`
      : "Primero registra un proveedor activo.";
    const products = state.products.filter(
      (p) =>
        p.active && p.offers.some((o) => o.supplierId === Number(supplierId)),
    );
    $("#order-picker").innerHTML = `${select(
      "productId",
      "Producto",
      products.map((p) => [
        p.id,
        `${p.name} · ${crc(p.offers.find((o) => o.supplierId === Number(supplierId)).cost)}`,
      ]),
    )}${field("qty", "Cantidad", 1, "number", 'min="1" step="1"')}<button class="btn" type="button" id="add-order-line">Agregar</button>`;
    let total = 0;
    $("#order-lines").innerHTML =
      table(
        ["Producto", "Cantidad", "Costo unitario", "Total", ""],
        items.map((l, i) => {
          const p = state.products.find((p) => p.id === l.productId),
            cost =
              p.offers.find((o) => o.supplierId === Number(supplierId))?.cost ??
              0;
          total += cost * l.qty;
          return tr([
            esc(p.name),
            `<input class="cart-input" aria-label="Cantidad de ${esc(p.name)}" type="number" min="1" step="1" value="${l.qty}" data-order-line="${i}">`,
            crc(cost),
            crc(cost * l.qty),
            `<button class="btn small danger" type="button" data-remove-order="${i}" aria-label="Quitar ${esc(p.name)}">×</button>`,
          ]);
        }),
      ) +
      `<div class="total-line"><strong>Total estimado</strong><strong>${crc(total)}</strong></div>`;
    $("#add-order-line").onclick = () => {
      const productId = Number($('[name="productId"]', form).value),
        qty = Number($('[name="qty"]', form).value);
      if (!productId || !Number.isSafeInteger(qty) || qty < 1)
        return ($(".error", form).textContent =
          "Selecciona un producto y una cantidad entera mayor que cero.");
      const line = items.find((l) => l.productId === productId);
      if (line) line.qty += qty;
      else items.push({ productId, qty });
      $(".error", form).textContent = "";
      paint();
    };
    $("#order-lines").onchange = (e) => {
      if (e.target.dataset.orderLine !== undefined) {
        const qty = Number(e.target.value);
        if (Number.isSafeInteger(qty) && qty > 0)
          items[Number(e.target.dataset.orderLine)].qty = qty;
        paint();
      }
    };
    $("#order-lines").onclick = (e) => {
      const b = e.target.closest("[data-remove-order]");
      if (b) {
        items.splice(Number(b.dataset.removeOrder), 1);
        paint();
      }
    };
  }
  $('[name="supplierId"]', form).onchange = (e) => {
    supplierId = Number(e.target.value);
    items = [];
    paint();
  };
  paint();
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!items.length)
      return ($(".error", form).textContent =
        "Agrega al menos un producto al pedido.");
    const b = { supplierId, items, notes: $('[name="notes"]', form).value };
    const review = $("#order-lines")
      .innerHTML.replace(/<input[^>]*value="(\d+)"[^>]*>/g, "$1")
      .replace(/<button[\s\S]*?<\/button>/g, "");
    openDialog(
      "Revisar y registrar pedido",
      `<p>Proveedor: <b>${esc(state.suppliers.find((s) => s.id === Number(supplierId))?.name)}</b></p>${review}<p>${esc(b.notes)}</p><p class="error" role="alert"></p><div class="dialog-footer"><button class="btn" id="back-order">Volver a editar</button><button class="btn primary" id="confirm-order">Confirmar pedido</button></div>`,
    );
    // Conservar el formulario y sus eventos permite volver sin perder el borrador.
    $("#back-order").onclick = () => {
      openDialog(order ? "Editar pedido" : "Nuevo pedido", "");
      $(".dialog-body").append(form);
    };
    $("#confirm-order").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await api(
          `orders${order ? `/${order.id}` : ""}`,
          order ? "PUT" : "POST",
          b,
        );
        $("#modal").close();
        await reload();
        toast("Pedido registrado. El inventario cambiará al recibirlo.");
      } catch (error) {
        $("#modal .error").textContent = error.message;
        e.target.disabled = false;
      }
    };
  };
}
function viewOrder(id) {
  const o = state.orders.find((o) => o.id === Number(id));
  openDialog(
    idLabel("PED", o.id),
    `<div class="detail-grid"><div><small>Proveedor</small>${esc(o.supplier)}</div><div><small>Estado</small>${statusBadge(o.status)}</div><div><small>Fecha</small>${date(o.date)}</div><div><small>Recibido</small>${date(o.received)}</div></div>${table(
      ["Producto", "Cantidad", "Costo unitario", "Total"],
      o.items.map((l) => tr([esc(l.name), l.qty, crc(l.price), crc(l.total)])),
    )}<div class="total-line grand"><span>Total</span><span>${crc(o.total)}</span></div><p>${esc(o.notes)}</p>${isAdmin() && o.status === "Pendiente" ? `<p class="form-help">Confirma la recepción cuando hayas recibido todos los productos. Esta acción suma las cantidades al inventario una sola vez.</p><p class="error" role="alert"></p><div class="dialog-footer">${button("Confirmar recepción completa", "receive-order", o.id, "primary")}</div>` : ""}`,
  );
}
function saleTotals() {
  const discount = Number(saleDraft.discount) || 0;
  let gross = 0,
    net = 0,
    vat = 0,
    total = 0;
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  for (const l of cart) {
    const p = state.products.find((p) => p.id === l.productId);
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
function invoicesPage() {
  $("#content").innerHTML =
    `${head("Facturación", "Registra ventas, consulta comprobantes y controla las existencias.", button("Ver historial", "invoice-history"))}<form id="sale-form"><div class="sale-layout"><div><section class="card"><div class="card-header"><h2>01 · Datos de la venta</h2><span class="badge">Nueva factura</span></div><div class="card-body form-grid">${field("customer", "Nombre del cliente", saleDraft.customer, "text", "required")}${field("identification", "Identificación (opcional)", saleDraft.identification)}<div class="wide">${field("notes", "Observaciones", saleDraft.notes)}</div></div></section><section class="card"><div class="card-header"><h2>02 · Productos</h2>${button("Vaciar", "clear-sale", "", "small")}</div><div class="card-body"><div class="line-add">${select(
      "productId",
      "Buscar producto",
      state.products
        .filter((p) => p.active && p.stock > 0)
        .map((p) => [p.id, `${p.code} · ${p.name} · ${crc(p.price)}`]),
    )}${field("qty", "Cantidad", 1, "number", 'min="1" step="1"')}<button id="add-sale-line" type="button" class="btn primary">Agregar</button></div><p class="form-help">Los precios incluyen el IVA configurado para cada producto.</p></div><div id="cart-table"></div></section></div><aside class="card sale-summary"><div class="card-header"><h2>03 · Resumen y cobro</h2></div><div class="card-body"><div class="stack-gap">${field("discount", "Descuento (%)", saleDraft.discount, "number", 'required min="0" max="100" step="0.01"')}${select("payment", "Medio de pago", ["Efectivo", "Tarjeta", "SINPE"], saleDraft.payment)}<div id="cash-field">${field("paid", "Efectivo recibido (₡)", saleDraft.paid, "number", 'min="0" step="0.01"')}</div></div><div id="sale-totals"></div><p class="error" role="alert"></p><button type="submit" class="btn primary block" id="issue-invoice">Emitir factura ${icon("arrow")}</button><p class="form-help">Al emitir, la venta se guarda y las existencias se actualizan.</p></div></aside></div></form>`;
  const form = $("#sale-form");
  function paintCart() {
    $("#cart-table").innerHTML = table(
      ["Producto", "Cantidad", "Precio", "Total", ""],
      cart.map((l, i) => {
        const p = state.products.find((p) => p.id === l.productId);
        return tr([
          `<strong>${esc(p.name)}</strong><small>${esc(p.code)} · ${p.stock} disponibles</small>`,
          `<input class="cart-input" type="number" min="1" max="${p.stock}" step="1" value="${l.qty}" data-sale-line="${i}" aria-label="Cantidad de ${esc(p.name)}">`,
          crc(p.price),
          crc(p.price * l.qty),
          `<button class="btn small danger" type="button" data-remove-sale="${i}" aria-label="Quitar ${esc(p.name)}">×</button>`,
        ]);
      }),
      "Agrega productos para comenzar la venta.",
    );
    paintTotals();
  }
  function paintTotals() {
    const t = saleTotals();
    $("#sale-totals").innerHTML =
      `<div class="total-line"><span>Importe con IVA</span><b>${crc(t.gross)}</b></div><div class="total-line"><span>Descuento</span><span>− ${crc(t.discount)}</span></div><div class="total-line"><span>Subtotal sin IVA</span><span>${crc(t.net)}</span></div><div class="total-line"><span>IVA</span><span>${crc(t.vat)}</span></div><div class="total-line grand"><span>Total</span><span>${crc(t.total)}</span></div>${saleDraft.payment === "Efectivo" ? `<div class="total-line"><span>Vuelto</span><b>${crc(Math.max(0, Number(saleDraft.paid) - t.total))}</b></div>` : ""}`;
    $("#cash-field").hidden = saleDraft.payment !== "Efectivo";
    $('[name="paid"]').required = saleDraft.payment === "Efectivo";
    $("#issue-invoice").disabled = !cart.length;
  }
  form.addEventListener("input", (e) => {
    if (e.target.name in saleDraft) {
      saleDraft[e.target.name] = e.target.value;
      paintTotals();
    }
  });
  $("#add-sale-line").onclick = () => {
    const p = state.products.find(
      (p) => p.id === Number($('[name="productId"]', form).value),
    );
    const qty = Number($('[name="qty"]', form).value),
      old = cart.find((l) => l.productId === p?.id);
    if (
      !p ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty + (old?.qty ?? 0) > p.stock
    )
      return ($(".error", form).textContent =
        "Revisa el producto, la cantidad y la existencia disponible.");
    if (old) old.qty += qty;
    else cart.push({ productId: p.id, qty });
    $(".error", form).textContent = "";
    paintCart();
  };
  $("#cart-table").onchange = (e) => {
    if (e.target.dataset.saleLine !== undefined) {
      const i = Number(e.target.dataset.saleLine),
        qty = Number(e.target.value);
      if (Number.isSafeInteger(qty) && qty > 0) cart[i].qty = qty;
      paintCart();
    }
  };
  $("#cart-table").onclick = (e) => {
    const b = e.target.closest("[data-remove-sale]");
    if (b) {
      cart.splice(Number(b.dataset.removeSale), 1);
      paintCart();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#issue-invoice");
    btn.disabled = true;
    try {
      const invoice = await api("invoices", "POST", {
        ...saleDraft,
        items: cart,
      });
      cart = [];
      saleDraft = {
        customer: "Consumidor final",
        identification: "",
        discount: "0",
        payment: "Efectivo",
        paid: "",
        notes: "",
      };
      await reload();
      viewInvoice(invoice.id);
      toast("Factura guardada e inventario actualizado.");
    } catch (error) {
      if ($("#sale-form .error"))
        $("#sale-form .error").textContent = error.message;
      btn.disabled = false;
    }
  };
  paintCart();
}
function invoiceHistory() {
  openDialog(
    "Historial de facturas",
    `${filters(select("status", "Estado", [["", "Todos"], "Emitida", "Anulada"]) + field("from", "Desde", "", "date", `min="${state.started}" max="${state.today}"`) + field("to", "Hasta", "", "date", `min="${state.started}" max="${state.today}"`))}<div id="invoice-list"></div>`,
  );
  const paint = () => {
    const f = Object.fromEntries(
      [...$("#modal").querySelectorAll("[name]")].map((e) => [e.name, e.value]),
    );
    $("#invoice-list").innerHTML = table(
      ["Factura / fecha", "Cliente", "Total", "Estado", ""],
      state.invoices
        .filter(
          (i) =>
            matches(f.search, idLabel("FAC", i.id), i.customer) &&
            (!f.status || i.status === f.status) &&
            (!f.from || i.date >= f.from) &&
            (!f.to || i.date <= f.to),
        )
        .reverse()
        .map((i) =>
          tr([
            `${idLabel("FAC", i.id)}<small>${date(i.date)}</small>`,
            esc(i.customer),
            crc(i.total),
            statusBadge(i.status),
            button("Ver", "view-invoice", i.id, "small"),
          ]),
        ),
    );
  };
  $("#modal .filters").oninput = paint;
  paint();
}
function invoiceContent(i) {
  return `<div class="detail-grid"><div><small>Cliente</small>${esc(i.customer)}<br>${esc(i.identification)}</div><div><small>Fecha y estado</small>${date(i.date)} · ${esc(i.status)}</div></div>${table(
    ["Código / producto", "Cant.", "Precio con IVA", "Desc.", "IVA", "Total"],
    i.items.map((l) =>
      tr([
        `${esc(l.name)}<small>${esc(l.code)}</small>`,
        l.qty,
        crc(l.price),
        crc(l.discount),
        crc(l.vat),
        crc(l.total),
      ]),
    ),
  )}<div class="total-line"><span>Subtotal sin IVA</span><b>${crc(i.subtotal)}</b></div><div class="total-line"><span>IVA</span><b>${crc(i.vat)}</b></div><div class="total-line grand"><span>Total</span><span>${crc(i.total)}</span></div><p>Pago: ${esc(i.payment)} · Recibido: ${crc(i.paid)} · Vuelto: ${crc(i.change)}</p><p>${esc(i.notes)}</p>${i.status === "Anulada" ? `<div class="notice">Anulada el ${date(i.voidDate)} por ${esc(i.voidUser)}. Motivo: ${esc(i.reason)}</div>` : ""}`;
}
function viewInvoice(id) {
  const i = state.invoices.find((i) => i.id === Number(id));
  openDialog(
    idLabel("FAC", i.id),
    `${invoiceContent(i)}<p class="form-help">Comprobante académico de venta. No es una factura electrónica de Hacienda.</p><div class="dialog-footer">${isAdmin() && i.status === "Emitida" ? button("Anular factura", "void-invoice", i.id, "danger") : ""}${button("Imprimir / guardar PDF", "print-invoice", i.id, "primary")}</div>`,
  );
}
function voidInvoiceForm(id) {
  editForm(
    `Anular ${idLabel("FAC", id)}`,
    `<div class="wide"><p>Se conservará la factura y se devolverán sus cantidades al inventario. Esta operación solo puede realizarse una vez.</p>${field("reason", "Justificación obligatoria", "", "text", "required")}</div>`,
    (b) => api(`invoices/${id}/void`, "POST", b),
  );
}
function printDocument(title, content) {
  $("#print-area").innerHTML =
    `<div class="print-heading"><div><h1>SIPRO</h1><p>Mini súper / Licorera</p></div><div><h2>${esc(title)}</h2><p>${date(state.today)}</p></div></div>${content}<p class="print-note">SIPRO · Demostración académica. Comprobante interno sin validez de factura electrónica.</p>`;
  window.print();
}
function reportsPage() {
  const types = [
    ["orders", "Pedidos"],
    ["purchases", "Compras recibidas"],
    ["requested", "Productos solicitados"],
    ["sales", "Ventas"],
    ...(isAdmin()
      ? [
          ["inventory", "Inventario actual"],
          ["profit", "Utilidad bruta"],
        ]
      : []),
  ];
  currentReport = null;
  reportQuery = null;
  $("#content").innerHTML =
    `${head("Reportes", "Consulta la información registrada de tu negocio.")}<section class="card"><div class="card-body"><form id="report-form" class="filters">${select("type", "Tipo de reporte", types)}${field("from", "Desde", state.started, "date", `required min="${state.started}" max="${state.today}"`)}${field("to", "Hasta", state.today, "date", `required min="${state.started}" max="${state.today}"`)}${select("supplierId", "Proveedor", [["", "Todos"], ...state.suppliers.map((s) => [s.id, s.name])])}${select("status", "Estado", [["", "Todos"], "Pendiente", "Recibido"])}<button class="btn primary" type="submit">Consultar</button></form><div class="error" id="report-error" role="alert"></div></div></section><div id="report-result"><div class="card empty">Selecciona un reporte y consulta los resultados.</div></div>`;
  const form = $("#report-form");
  $('[name="type"]', form).onchange = () => {
    const type = $('[name="type"]', form).value;
    $('[name="supplierId"]', form).disabled = ![
      "orders",
      "purchases",
      "requested",
    ].includes(type);
    $('[name="status"]', form).innerHTML = options([
      ["", "Todos"],
      ...(type === "sales"
        ? ["Emitida", "Anulada"]
        : ["Pendiente", "Recibido"]),
    ]);
    $('[name="status"]', form).disabled = [
      "inventory",
      "profit",
      "purchases",
    ].includes(type);
  };
  form.oninput = () => {
    currentReport = null;
    reportQuery = null;
    $("#report-result").innerHTML =
      '<div class="card empty">Los filtros cambiaron. Pulsa Consultar para actualizar el reporte.</div>';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    $("#report-error").textContent = "";
    try {
      const params = new URLSearchParams(new FormData(form));
      const r = await api(`reports?${params}`);
      currentReport = r;
      reportQuery = params.toString();
      $("#report-result").innerHTML =
        `<div class="report-toolbar"><div><h2>${esc(r.title)}</h2><small>${r.type === "inventory" ? "Existencias actuales" : `${date(r.from)} — ${date(r.to)}`} · ${r.rows.length} registros</small></div>${isAdmin() ? `<div class="actions">${button("Imprimir / PDF", "print-report")}${button("Exportar Excel", "excel-report")}</div>` : ""}</div><div class="card">${table(
          r.columns,
          r.rows.map((row) =>
            tr(
              row.map((v) =>
                typeof v === "number"
                  ? new Intl.NumberFormat("es-CR", {
                      maximumFractionDigits: 2,
                    }).format(v)
                  : esc(v),
              ),
            ),
          ),
          "No hay movimientos en el período seleccionado.",
        )}<div class="report-footnote">${r.type === "profit" ? "Estimación sobre ventas vigentes: ingresos sin IVA menos costo promedio registrado al vender. No incluye gastos operativos." : "Información obtenida de los registros guardados. Los reportes no modifican los datos."}</div></div>`;
    } catch (error) {
      $("#report-error").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
}
async function dispatch(action, id, element) {
  if (action === "close") return $("#modal").close();
  if (action === "logout") {
    await api("logout", "POST");
    state = null;
    cart = [];
    saleDraft = {
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
    "edit-supplier": editSupplier,
    "view-supplier": viewSupplier,
    "edit-product": editProduct,
    "view-product": viewProduct,
    "edit-user": editUser,
    "adjust-stock": adjustStock,
    "edit-order": editOrder,
    "view-order": viewOrder,
    "invoice-history": invoiceHistory,
    "view-invoice": viewInvoice,
    "void-invoice": voidInvoiceForm,
  };
  if (handlers[action]) return handlers[action](id);
  if (action === "add-offer") {
    if (!state.suppliers.length)
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
    if (!cart.length) return;
    openDialog(
      "Vaciar venta en curso",
      '<p>Se quitarán los productos de esta venta sin generar una factura.</p><div class="dialog-footer">' +
        button("Conservar", "close") +
        button("Vaciar venta", "confirm-clear-sale", "", "danger") +
        "</div>",
    );
    return;
  }
  if (action === "confirm-clear-sale") {
    cart = [];
    $("#modal").close();
    return invoicesPage();
  }
  if (action === "print-invoice") {
    const i = state.invoices.find((i) => i.id === Number(id));
    return printDocument(idLabel("FAC", i.id), invoiceContent(i));
  }
  if (action === "print-report" && currentReport) {
    return printDocument(
      currentReport.title,
      `<p>Período: ${date(currentReport.from)} a ${date(currentReport.to)}</p>${table(
        currentReport.columns,
        currentReport.rows.map((row) => tr(row.map(esc))),
      )}`,
    );
  }
  if (action === "excel-report" && reportQuery) {
    const r = await fetch(`/api/reports?${reportQuery}&format=xls`);
    if (!r.ok) throw new Error((await r.json()).error);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `SIPRO-${currentReport.type}.xls`;
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
  if (state) reload().catch((error) => toast(error.message, true));
  else login();
});
(async () => {
  try {
    state = await api("state");
    render();
  } catch {
    login();
  }
})();
