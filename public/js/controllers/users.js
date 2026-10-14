import {
  $,
  button,
  esc,
  field,
  filters,
  head,
  select,
  statusBadge,
  table,
  tr,
} from "../views/components.js";
import { view } from "../views/template.js";
import { attachFilter, editForm } from "./forms.js";
import { api, matches, model } from "../models/app-model.js";
import { activeOptions } from "../config.js";

export function usersPage() {
  $("#content").innerHTML = view("users-page-1", {
    head: head(
      "Usuarios y permisos",
      "Controla quién puede acceder al sistema.",
      button("＋ Nuevo usuario", "edit-user", "", "primary"),
    ),
    filters: filters(),
  });
  attachFilter((f) => {
    $("#listing").innerHTML = table(
      ["Nombre", "Usuario", "Correo", "Rol", "Estado", "Acciones"],
      model.state.users
        .filter((u) =>
          matches(f.search, u.name, u.surname, u.username, u.identification),
        )
        .map((u) =>
          tr([
            view("users-page-2", {
              esc: esc(u.name),
              esc2: esc(u.surname),
              esc3: esc(u.identification),
            }),
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

export function editUser(id) {
  const u = model.state.users.find((u) => u.id === Number(id)) || {
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
