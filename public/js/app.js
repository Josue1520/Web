import { loadTemplates } from "./views/template.js";

try {
  await loadTemplates([
    "components",
    "feedback",
    "shell",
    "application",
    "auth",
    "dashboard",
    "catalog",
    "inventory",
    "orders",
    "users",
    "purchases",
    "sales",
    "reports",
    "forms",
  ]);
  await import("./controllers/application.js");
} catch (error) {
  console.error(error);
  document.querySelector("#app").textContent =
    "No se pudo cargar SIPRO. Recarga la página o reinicia el servidor.";
}
