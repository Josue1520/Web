import { $, button } from "../views/components.js";
import { openDialog, toast } from "../views/feedback.js";
import { view } from "../views/template.js";
import { reload } from "./application.js";

export function attachFilter(renderRows) {
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

export function editForm(title, content, submit, afterSave) {
  openDialog(
    title,
    view("edit-form-1", {
      content: content,
      button: button("Cancelar", "close"),
    }),
  );
  $("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      const saved = await submit(Object.fromEntries(new FormData(form)), form);
      $("#modal").close();
      await reload();
      toast("Cambios guardados correctamente.");
      if (afterSave) await afterSave(saved);
    } catch (error) {
      $(".error", form).textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  };
}
