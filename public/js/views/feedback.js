import { $, date, esc, ticketContent } from "./components.js";
import { view } from "./template.js";
import { model, receiptWidth } from "../models/app-model.js";

let toastTimer;

export function toast(message, failure = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `show${failure ? " failure" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 5000);
}

export function openDialog(title, content) {
  const modal = $("#modal");
  modal.innerHTML = view("open-dialog-1", { title: title, content: content });
  if (!modal.open) modal.showModal();
}

export function printDocument(title, content) {
  document.body.removeAttribute("data-print-format");
  $("#ticket-page-style")?.remove();
  $("#print-area").innerHTML = view("print-document-1", {
    esc: esc(title),
    date: date(model.state.today),
    content: content,
  });
  window.print();
}

export async function printTicket(invoice) {
  const width = Number($('[name="ticketWidth"]')?.value || receiptWidth());
  const area = $("#print-area");
  area.innerHTML = ticketContent(invoice, width);
  document.body.dataset.printFormat = "ticket";
  area.classList.add("measure-ticket");
  const height = Math.max(
    60,
    Math.min(
      2000,
      Math.ceil(
        (area.firstElementChild.getBoundingClientRect().height * 25.4) / 96,
      ) + 10,
    ),
  );
  area.classList.remove("measure-ticket");
  $("#ticket-page-style")?.remove();
  const stylesheet = document.createElement("link");
  stylesheet.id = "ticket-page-style";
  stylesheet.rel = "stylesheet";
  stylesheet.href = `/ticket-page.css?width=${width}&height=${height}`;
  await new Promise((resolve, reject) => {
    stylesheet.onload = resolve;
    stylesheet.onerror = () =>
      reject(
        new Error(
          "No se pudo preparar el tamaño del ticket. Intenta imprimir nuevamente.",
        ),
      );
    document.head.append(stylesheet);
  });
  window.print();
}
