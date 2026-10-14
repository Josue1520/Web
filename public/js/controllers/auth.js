import { $, brand, field, icon } from "../views/components.js";
import { view } from "../views/template.js";
import { api, model } from "../models/app-model.js";
import { render } from "./application.js";

export function login() {
  delete document.body.dataset.page;
  $("#modal").close();
  $("#app").innerHTML = view("login-1", {
    brand: brand,
    field: field(
      "username",
      "Usuario",
      "",
      "text",
      'required autocomplete="username" autofocus',
    ),
    field3: field(
      "password",
      "Contraseña",
      "",
      "password",
      'required autocomplete="current-password"',
    ),
    icon: icon("arrow"),
  });
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = $("button", form);
    btn.disabled = true;
    try {
      await api("login", "POST", Object.fromEntries(new FormData(form)));
      model.state = await api("state");
      render();
    } catch (error) {
      $(".error", form).textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
}
