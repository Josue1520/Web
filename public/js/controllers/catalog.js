import {
  $,
  button,
  crc,
  esc,
  field,
  filters,
  head,
  offerRow,
  select,
  statusBadge,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";
import { api, isAdmin, matches, model } from "../models/app-model.js";
import { activeOptions } from "../config.js";
import { attachFilter, editForm } from "./forms.js";
import { openDialog } from "../views/feedback.js";

export function suppliersPage() {
  $("#content").innerHTML = view("suppliers-page-1", {
    head: head(
      "Proveedores",
      "Contactos, catálogos y condiciones comerciales.",
      isAdmin()
        ? button("＋ Nuevo proveedor", "edit-supplier", "", "primary")
        : "",
    ),
    filters: filters(
      select("active", "Estado", [["", "Todos"], ...activeOptions]),
    ),
  });
  attachFilter((f) => {
    const rows = model.state.suppliers.filter(
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
          view("suppliers-page-2", {
            esc: esc(s.name),
            esc2: esc(s.idType),
            esc3: esc(s.identification),
          }),
          view("suppliers-page-3", {
            esc: esc(s.contact),
            esc2: esc(s.phone),
            esc3: esc(s.email),
          }),
          view("suppliers-page-4", {
            esc: esc(s.terms),
            days: s.days,
            crc: crc(s.minimum),
          }),
          `${s.delivery} días`,
          statusBadge(s.active ? "Activo" : "Inactivo"),
          view("suppliers-page-5", {
            button: button("Catálogo", "view-supplier", s.id, "small"),
            slot2: isAdmin()
              ? button("Editar", "edit-supplier", s.id, "small")
              : "",
          }),
        ]),
      ),
    );
  });
}

export function productsPage() {
  $("#content").innerHTML = view("products-page-1", {
    head: head(
      "Catálogo de productos",
      "Precios de venta con IVA incluido y proveedores asociados.",
      isAdmin()
        ? button("＋ Nuevo producto", "edit-product", "", "primary")
        : "",
    ),
    filters: filters(
      select("category", "Categoría", [
        ["", "Todas"],
        ...new Set(model.state.products.map((p) => p.category)),
      ]) + select("active", "Estado", [["", "Todos"], ...activeOptions]),
    ),
  });
  attachFilter((f) => {
    const rows = model.state.products.filter(
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
          view("products-page-2", {
            esc: esc(p.name),
            esc2: esc(p.code),
            esc3: esc(p.presentation),
          }),
          esc(p.category),
          crc(p.price),
          p.stock,
          statusBadge(p.active ? "Activo" : "Inactivo"),
          view("products-page-3", {
            button: button("Detalle", "view-product", p.id, "small"),
            slot2: isAdmin()
              ? button("Editar", "edit-product", p.id, "small")
              : "",
          }),
        ]),
      ),
    );
  });
}

export function editSupplier(id, defaults = {}, afterSave) {
  const s = model.state.suppliers.find((s) => s.id === Number(id)) || {
    active: true,
    days: 0,
    delivery: 1,
    minimum: 0,
    terms: "Contado",
    idType: "Jurídica",
    ...defaults,
  };
  editForm(
    s.id ? "Editar proveedor" : "Nuevo proveedor",
    `${field("name", "Nombre o razón social", s.name, "text", "required")}${select("idType", "Tipo de identificación", ["Física", "Jurídica", "DIMEX", "NITE"], s.idType, s.id ? "disabled" : "")}${field("identification", "Identificación", s.identification, "text", s.id ? "disabled" : "required")}${field("contact", "Contacto principal", s.contact, "text", "required")}${field("phone", "Teléfono", s.phone, "tel", "required")}${field("email", "Correo electrónico", s.email, "email", "required")}${field("address", "Dirección", s.address, "text", "required")}${select("terms", "Condición de pago", ["Contado", "Crédito"], s.terms)}${field("days", "Plazo de pago (días)", s.days, "number", 'required min="0" max="365"')}${field("delivery", "Entrega (días)", s.delivery, "number", 'required min="0" max="365"')}${field("minimum", "Pedido mínimo (₡)", s.minimum, "number", 'required min="0" step="0.01"')}${select("active", "Estado", activeOptions, s.active)}`,
    (b) =>
      api(`suppliers${s.id ? `/${s.id}` : ""}`, s.id ? "PUT" : "POST", {
        ...b,
        idType: s.idType,
        active: b.active === "true",
        ...(!s.id ? { idType: b.idType } : {}),
      }),
    afterSave,
  );
}

export function editProduct(id, defaults = {}, afterSave) {
  const p = model.state.products.find((p) => p.id === Number(id)) || {
    active: true,
    minimum: 5,
    stock: 0,
    cost: 0,
    tax: 13,
    offers: [],
    ...defaults,
  };
  editForm(
    p.id ? "Editar producto" : "Nuevo producto",
    view("edit-product-1", {
      field: field("code", "Código", p.code, "text", "required"),
      field2: field("name", "Nombre", p.name, "text", "required"),
      field3: field(
        "category",
        "Categoría",
        p.category,
        "text",
        'required list="categories"',
      ),
      slot4: [...new Set(model.state.products.map((p) => p.category))]
        .map((c) => view("edit-product-2", { esc: esc(c) }))
        .join(""),
      field5: field(
        "presentation",
        "Presentación / unidad",
        p.presentation,
        "text",
        "required",
      ),
      field6: field(
        "price",
        "Precio de venta, IVA incluido (₡)",
        p.price,
        "number",
        'required min="0.01" step="0.01"',
      ),
      field7: field(
        "tax",
        "IVA (%)",
        p.tax,
        "number",
        'required min="0" max="100" step="0.01"',
      ),
      field8: field(
        "minimum",
        "Stock mínimo",
        p.minimum,
        "number",
        'required min="0" step="1"',
      ),
      select: select("active", "Estado", activeOptions, p.active),
      slot10: !p.id
        ? field(
            "stock",
            "Existencia inicial",
            p.stock,
            "number",
            'required min="0" step="1"',
          ) +
          field(
            "cost",
            "Costo unitario inicial (₡)",
            p.cost,
            "number",
            'required min="0" step="0.01"',
          )
        : "",
      field11: field("description", "Descripción", p.description),
      button: button("＋ Asociar", "add-offer", "", "small"),
      slot13: p.offers.map(offerRow).join(""),
    }),
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
    afterSave,
  );
}

export function viewProduct(id) {
  const p = model.state.products.find((p) => p.id === Number(id));
  openDialog(
    esc(p.name),
    view("view-product-1", {
      esc: esc(p.code),
      esc2: esc(p.category),
      esc3: esc(p.presentation),
      crc: crc(p.price),
      tax: p.tax,
      stock: p.stock,
      minimum: p.minimum,
      statusBadge: statusBadge(p.active ? "Activo" : "Inactivo"),
      esc9: esc(p.description),
      table: table(
        ["Proveedor", "Costo de compra", "Entrega", "Estado"],
        p.offers.map((o) => {
          const s = model.state.suppliers.find((s) => s.id === o.supplierId);
          return tr([
            esc(s.name),
            crc(o.cost),
            `${o.delivery} días`,
            statusBadge(s.active ? "Activo" : "Inactivo"),
          ]);
        }),
        "Este producto todavía no tiene proveedores asociados.",
      ),
    }),
  );
}

export function viewSupplier(id) {
  const s = model.state.suppliers.find((s) => s.id === Number(id));
  openDialog(
    esc(s.name),
    view("view-supplier-1", {
      esc: esc(s.idType),
      esc2: esc(s.identification),
      esc3: esc(s.contact),
      esc4: esc(s.phone),
      esc5: esc(s.email),
      esc6: esc(s.address),
      esc7: esc(s.terms),
      days: s.days,
      delivery: s.delivery,
      crc: crc(s.minimum),
      table: table(
        ["Producto", "Presentación", "Costo de compra", "Disponible"],
        model.state.products
          .filter((p) => p.offers.some((o) => o.supplierId === s.id))
          .map((p) =>
            tr([
              view("view-supplier-2", { esc: esc(p.name), esc2: esc(p.code) }),
              esc(p.presentation),
              crc(p.offers.find((o) => o.supplierId === s.id).cost),
              statusBadge(p.active && s.active ? "Activo" : "Inactivo"),
            ]),
          ),
      ),
    }),
  );
}
