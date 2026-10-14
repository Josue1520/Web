import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server.js";
import { openStore, today } from "../src/models/store.js";
import { parsePurchaseXml } from "../src/models/purchase-xml.js";
import { invoiceXml, taxedInvoiceXml } from "./xml-fixture.js";

let app, base, cookie, dir;
async function call(path, method = "GET", body) {
  const res = await fetch(`${base}/api/${path}`, { method, headers: {
    Cookie: cookie ?? "", "Content-Type": "application/json", "X-Sipro-Request": "1",
  }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
  return { status: res.status, headers: res.headers,
    body: res.headers.get("content-type")?.startsWith("application/json") ? await res.json() : await res.text() };
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sipro-xml-"));
  app = createApp({ dbPath: join(dir, "test.sqlite") });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
  cookie = (await call("login", "POST", { username: "admin", password: "Admin123!" })).headers.get("set-cookie").split(";")[0];
});
afterEach(async () => {
  await new Promise((resolve) => app.server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});
const importBody = (xml) => ({ xml, mappings: [1], status: "Pendiente", dueDate: today() });

test("XML 4.3 y 4.4: namespace, entidades de texto, precisión, CABYS y códigos comerciales", () => {
  for (const version of ["4.3", "4.4"]) {
    const xml = invoiceXml({ version });
    const d = parsePurchaseXml(xml);
    assert.equal(d.version, version);
    assert.equal(d.items[0].price, 100.12345);
    assert.equal(d.items[0].name, "Artículo de prueba & presentación individual");
    assert.equal(d.items[0].cabys, "2431000000100");
    assert.equal(d.total, 214.7);
    const prefixed = xml.replace(/<(\/?)([A-Za-z][\w]*)(?=[ >])/g, "<$1fe:$2")
      .replace('xmlns="', 'xmlns:fe="');
    assert.deepEqual(parsePurchaseXml(prefixed).items, d.items);
  }
});

test("vista previa no escribe; importación conserva XML, importes, historia y stock después de reabrir", async () => {
  const xml = invoiceXml(), before = (await call("state")).body;
  const preview = await call("purchase-invoices/xml/preview", "POST", { xml });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.supplierId, 1);
  assert.equal(preview.body.items[0].productId, 1);
  assert.deepEqual((await call("state")).body, before);
  const saved = await call("purchase-invoices/xml", "POST", { ...importBody(xml), items: [], total: 1, supplierId: 2 });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.equal(saved.body.total, 214.7);
  assert.equal(saved.body.supplierId, 1);
  assert.equal(saved.body.items[0].price, 100.12345);
  const state = (await call("state")).body;
  assert.equal(state.products[0].stock, before.products[0].stock + 2);
  assert.deepEqual(saved.body.inventoryReceipt.entries[0], {
    productId: 1, code: before.products[0].code, name: before.products[0].name,
    before: before.products[0].stock, quantity: 2, after: before.products[0].stock + 2,
    movementId: state.movements.at(-1).id,
  });
  assert.equal(state.movements.at(-1).date, today());
  assert.equal(state.purchaseStart, "2026-01-15");
  assert.ok(!("purchaseInvoiceDocuments" in state));
  const download = await call(`purchase-invoices/${saved.body.id}/xml`);
  assert.equal(download.status, 200);
  assert.equal(download.body, xml);
  assert.equal(saved.body.xml.sha256, createHash("sha256").update(xml).digest("hex"));
  const report = await call("reports?type=purchase-invoices&from=2026-01-15");
  assert.equal(report.status, 200);
  assert.equal(report.body.rows.length, 1);
  const store = openStore(join(dir, "test.sqlite"));
  assert.equal(store.read().purchaseInvoiceDocuments[saved.body.id], xml);
  assert.deepEqual(store.read().purchaseInvoices[0].inventoryReceipt, saved.body.inventoryReceipt);
  store.close();
});

test("duplicados concurrentes: una sola compra y entrada; también detecta registro manual", async () => {
  const xml = invoiceXml();
  const results = await Promise.all([call("purchase-invoices/xml", "POST", importBody(xml)), call("purchase-invoices/xml", "POST", importBody(xml))]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await call("state")).body.purchaseInvoices.length, 1);
  assert.equal((await call("purchase-invoices/xml/preview", "POST", { xml })).status, 409);
  const other = invoiceXml({ sequence: 2, date: today() }), d = parsePurchaseXml(other);
  const manual = await call("purchase-invoices", "POST", { supplierId: 1, invoiceNumber: d.invoiceNumber,
    date: today(), status: "Pagada", items: [{ productId: 1, qty: 2, price: 95, tax: 13 }] });
  assert.equal(manual.status, 201);
  assert.equal((await call("purchase-invoices/xml", "POST", importBody(other))).status, 409);
});

test("XML vinculado a pedido recibido conserva existencias, movimientos y costo", async () => {
  // Producto 2 alcanza el mínimo del proveedor con dos unidades.
  const order = await call("orders", "POST", { supplierId: 1, items: [{ productId: 2, qty: 2 }] });
  assert.equal(order.status, 201);
  assert.equal((await call(`orders/${order.body.id}/receive`, "POST")).status, 201);
  const before = (await call("state")).body;
  const result = await call("purchase-invoices/xml", "POST", { ...importBody(invoiceXml({ code: "74034412" })), mappings: [2], orderId: order.body.id });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const after = (await call("state")).body;
  assert.deepEqual(result.body.inventoryReceipt, { kind: "received-order", orderId: order.body.id, entries: [] });
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.movements, before.movements);
});

test("líneas repetidas conservan importes y generan una sola entrada por producto", async () => {
  let xml = invoiceXml();
  const line = xml.match(/<LineaDetalle>[\s\S]*?<\/LineaDetalle>/)[0].replace("<NumeroLinea>1", "<NumeroLinea>2");
  xml = xml.replace("</DetalleServicio>", `${line}</DetalleServicio>`)
    .replace("<TotalVenta>200.24690", "<TotalVenta>400.49380")
    .replace("<TotalDescuentos>10.24690", "<TotalDescuentos>20.49380")
    .replace("<TotalVentaNeta>190", "<TotalVentaNeta>380")
    .replace("<TotalImpuesto>24.7", "<TotalImpuesto>49.4")
    .replace("<TotalComprobante>214.7", "<TotalComprobante>429.4");
  const before = (await call("state")).body;
  const result = await call("purchase-invoices/xml", "POST", { ...importBody(xml), mappings: [1, 1] });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.items.length, 2);
  assert.equal(result.body.total, 429.4);
  const after = (await call("state")).body;
  assert.equal(after.products[0].stock, before.products[0].stock + 4);
  assert.equal(after.movements.length, before.movements.length + 1);
  assert.equal(after.movements.at(-1).delta, 4);
});

test("XML rechaza archivos dañados, DTD, importes incompatibles y formatos no admitidos sin mutar", async () => {
  const xml = invoiceXml(), before = (await call("state")).body;
  const invalid = [
    "<a>", xml.replace("</FacturaElectronica>", ""),
    '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml,
    xml.replace("&amp;", "&unknown;"),
    xml.replace("FacturaElectronica", "MensajeHacienda"),
    xml.replace("v4.4/", "v9.9/"),
    xml.replace("<Cantidad>2</Cantidad>", "<Cantidad>1.5</Cantidad>"),
    xml.replace("<TotalComprobante>214.7", "<TotalComprobante>214.8"),
    xml.replace("<SubTotal>190", "<SubTotal>191"),
    xml.replace("<CodigoMoneda>CRC", "<CodigoMoneda>USD"),
    xml.replace("<Codigo>01</Codigo><CodigoTarifaIVA>", "<Codigo>XYZ</Codigo><CodigoTarifaIVA>"),
    xml.replace("</Impuesto>", "<Exoneracion/></Impuesto>"),
    xml.replace("</ResumenFactura>", "<TotalOtrosCargos>50</TotalOtrosCargos></ResumenFactura>"),
    xml.replace("</TotalComprobante>", "</TotalComprobante><TotalComprobante>214.7</TotalComprobante>"),
    xml.replace("</Emisor>", "</Emisor><Emisor/>"),
    xml.replace("UTF-8", "ISO-8859-1"),
    invoiceXml({ date: "2099-01-01" }),
    xml + " ".repeat(1024 * 1024),
    "<a>".repeat(60) + "</a>".repeat(60),
  ];
  for (const bad of invalid) {
    const result = await call("purchase-invoices/xml", "POST", importBody(bad));
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  assert.deepEqual((await call("state")).body, before);
});

test("asociación exige proveedor identificado, producto asociado, cantidad compatible y rol administrador", async () => {
  const xml = invoiceXml(), before = (await call("state")).body;
  for (const body of [
    { ...importBody(xml), mappings: [] },
    { ...importBody(xml), mappings: [3] },
    { ...importBody(xml), status: "Pendiente", dueDate: "" },
    importBody(invoiceXml({ identification: "3101999999" })),
  ]) assert.equal((await call("purchase-invoices/xml", "POST", body)).status, 400);
  const unknownCode = (await call("purchase-invoices/xml/preview", "POST", { xml: invoiceXml({ code: "CABYS-ONLY" }) })).body;
  assert.equal(unknownCode.items[0].productId, null);
  assert.deepEqual((await call("state")).body, before);
  await call("purchase-invoices/xml", "POST", importBody(xml));
  cookie = (await call("login", "POST", { username: "dependiente", password: "Caja123!" })).headers.get("set-cookie").split(";")[0];
  assert.equal((await call("purchase-invoices/xml/preview", "POST", { xml })).status, 403);
  assert.equal((await call("purchase-invoices/xml", "POST", importBody(xml))).status, 403);
  assert.equal((await call("purchase-invoices/1/xml")).status, 403);
});

test("impuestos múltiples, exoneración, asumidos, cargos e IVA devuelto se conservan y cuadran en reportes", async () => {
  const xml = taxedInvoiceXml(), before = (await call("state")).body;
  const preview = await call("purchase-invoices/xml/preview", "POST", { xml });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.vat, 20);
  assert.equal(preview.body.otherTaxes, 5);
  assert.equal(preview.body.assumedTax, 3);
  assert.equal(preview.body.taxTotal, 22);
  assert.equal(preview.body.chargesTotal, 10);
  assert.equal(preview.body.vatRefund, 2);
  assert.equal(preview.body.total, 220);
  assert.equal(preview.body.items[0].taxes[0].exemption.document, "PRUEBA-EX-01");
  assert.equal(preview.body.taxBreakdown[1].code, "04");
  const saved = await call("purchase-invoices/xml", "POST", { ...importBody(xml), taxTotal: 0, chargesTotal: 0 });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.equal(saved.body.total, 220);
  assert.equal(saved.body.charges[0].description, "Transporte de mercadería");
  const after = (await call("state")).body;
  assert.equal(after.products[0].stock, before.products[0].stock + 2);
  assert.equal(after.products[0].cost, Math.round((before.products[0].cost * before.products[0].stock + 190) / after.products[0].stock * 100) / 100);
  const report = (await call("reports?type=purchase-invoices")).body;
  for (const [column, expected] of [["IVA tras exoneración", 20], ["Otros impuestos", 5], ["Impuestos asumidos", 3], ["Impuestos netos", 22], ["Otros cargos", 10], ["IVA devuelto", 2], ["Total", 220]])
    assert.equal(report.rows[0][report.columns.indexOf(column)], expected);
  assert.equal((await call(`purchase-invoices/${saved.body.id}/xml`)).body, xml);
  const store = openStore(join(dir, "test.sqlite"));
  assert.deepEqual(store.read().purchaseInvoices[0].taxBreakdown, saved.body.taxBreakdown);
  store.close();
});

test("impuestos específicos y base compuesta se importan sin recalcularlos como IVA simple", () => {
  const xml = invoiceXml()
    .replace("<BaseImponible>190", "<BaseImponible>195")
    .replace("<Monto>24.7", "<Monto>25.35")
    .replace("</Impuesto>", "</Impuesto><Impuesto><Codigo>05</Codigo><Monto>5</Monto></Impuesto>")
    .replace("<ImpuestoNeto>24.7", "<ImpuestoNeto>30.35")
    .replace("<MontoTotalLinea>214.7", "<MontoTotalLinea>220.35")
    .replace("<TotalImpuesto>24.7", "<TotalImpuesto>30.35")
    .replace("<TotalComprobante>214.7", "<TotalComprobante>220.35");
  const parsed = parsePurchaseXml(xml);
  assert.equal(parsed.vat, 25.35);
  assert.equal(parsed.otherTaxes, 5);
  assert.equal(parsed.items[0].taxableBase, 195);
  assert.equal(parsed.total, 220.35);
  const factory = invoiceXml().replace("<ImpuestoAsumidoEmisorFabrica>", "<IVACobradoFabrica>01</IVACobradoFabrica><ImpuestoAsumidoEmisorFabrica>");
  assert.equal(parsePurchaseXml(factory).items[0].factoryVat, "01");
});

test("rechaza exoneraciones, cargos y ajustes incongruentes sin inventario parcial", async () => {
  const xml = taxedInvoiceXml(), before = (await call("state")).body;
  for (const invalid of [
    xml.replace("<MontoExoneracion>4.7", "<MontoExoneracion>100"),
    xml.replace("<MontoCargo>10", "<MontoCargo>11"),
    xml.replace("<ImpuestoAsumidoEmisorFabrica>3", "<ImpuestoAsumidoEmisorFabrica>100"),
    xml.replace("<TotalImpAsumEmisorFabrica>3", "<TotalImpAsumEmisorFabrica>4"),
    xml.replace("<TotalIVADevuelto>2", "<TotalIVADevuelto>99"),
    xml.replace("<ImpuestoNeto>22", "<ImpuestoNeto>21"),
  ]) assert.equal((await call("purchase-invoices/xml", "POST", importBody(invalid))).status, 400);
  assert.deepEqual((await call("state")).body, before);
});
