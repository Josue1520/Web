import { DOMParser } from "@xmldom/xmldom";
import { createHash } from "node:crypto";
import { admin, ensure, find, createPurchaseInvoice } from "./domain.js";

export const XML_LIMIT = 1024 * 1024;
const digits = (s) => s.replace(/[\s.-]/g, "");
const namespaces = new Map(["4.3", "4.4"].map((v) => [
  `https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v${v}/facturaElectronica`, v,
]));

// Parseo local: nunca resuelve DTD, entidades ni recursos remotos. No valida firmas.
export function parsePurchaseXml(xml) {
  ensure(typeof xml === "string" && Buffer.byteLength(xml) <= XML_LIMIT,
    "Selecciona un XML de hasta 1 MB.");
  ensure(!/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml), "El XML no puede contener DTD ni entidades externas.");
  ensure(!xml.includes("\uFFFD") && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(xml), "El XML debe estar codificado en UTF-8.");
  const encoding = xml.match(/<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)/i)?.[1];
  ensure(!encoding || /^utf-8$/i.test(encoding), "Exporta la factura como XML UTF-8.");
  // Limitar profundidad antes del parser, además del límite de tamaño.
  let depth = 0, count = 0;
  for (const token of xml.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>/g)) {
    if (/^<\//.test(token[0])) depth--;
    else if (/^<[^!?/]/.test(token[0])) {
      count++;
      if (!/\/>$/.test(token[0])) depth++;
    }
    ensure(depth <= 40 && count <= 15000, "El XML contiene demasiados elementos o niveles.");
  }
  let doc;
  try {
    doc = new DOMParser({ onError: () => { throw new Error("XML inválido"); } }).parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  } catch {
    ensure(false, "El archivo no es un XML bien formado. Solicita el original al proveedor.");
  }
  const root = doc.documentElement, ns = root?.namespaceURI;
  ensure(root?.localName === "FacturaElectronica" && namespaces.has(ns),
    "Se admite FacturaElectronica de Costa Rica, versión 4.3 o 4.4. No cargues respuestas de Hacienda, tiquetes ni notas de crédito.");
  const children = (node, name) => Array.from(node?.childNodes ?? []).filter((n) => n.nodeType === 1 && n.localName === name && n.namespaceURI === ns);
  const one = (node, name, required = true) => {
    const list = children(node, name);
    ensure(list.length <= 1 && (!required || list.length === 1), `XML: falta ${name} o está repetido.`);
    return list[0];
  };
  const value = (node, name, required = true) => {
    const el = one(node, name, required);
    ensure(!el || !Array.from(el.childNodes).some((n) => n.nodeType === 1), `XML: ${name} debe contener texto.`);
    const text = el?.textContent.trim() ?? "";
    ensure(text.length <= 500 && (!required || text.length), `XML: revisa ${name}.`);
    return text;
  };
  const amount = (node, name, required = true) => {
    const v = value(node, name, required);
    if (!v && !required) return 0;
    ensure(/^\d+(?:\.\d{1,5})?$/.test(v) && Number(v) <= 100000000,
      `XML: ${name} debe ser un número positivo con hasta cinco decimales.`);
    return Number(v);
  };
  const equals = (a, b, label, tolerance = 0.00006) => ensure(Math.abs(a - b) <= tolerance,
    `XML: ${label} no coincide con el detalle. Solicita una factura corregida al proveedor.`);
  const key = value(root, "Clave"), invoiceNumber = value(root, "NumeroConsecutivo");
  ensure(/^\d{50}$/.test(key) && /^\d{20}$/.test(invoiceNumber) && key.slice(21, 41) === invoiceNumber,
    "XML: la clave de 50 dígitos no coincide con el consecutivo de 20 dígitos.");
  const timestamp = value(root, "FechaEmision"), date = timestamp.slice(0, 10);
  ensure(/^\d{4}-\d{2}-\d{2}T/.test(timestamp) && Number.isFinite(Date.parse(timestamp)) &&
    new Date(date).toISOString().slice(0, 10) === date, "XML: fecha de emisión inválida.");
  const issuer = one(root, "Emisor"), identification = one(issuer, "Identificacion");
  const supplier = {
    name: value(issuer, "Nombre"), identification: value(identification, "Numero"),
    idType: ({ "01": "Física", "02": "Jurídica", "03": "DIMEX", "04": "NITE" })[value(identification, "Tipo")],
    email: value(issuer, "CorreoElectronico", false),
    phone: value(one(issuer, "Telefono", false), "NumTelefono", false),
    address: value(one(issuer, "Ubicacion", false), "OtrasSenas", false),
  };
  ensure(supplier.idType && /^\d{9,12}$/.test(supplier.identification), "XML: identificación del emisor inválida.");
  ensure(key.slice(9, 21) === supplier.identification.padStart(12, "0"), "XML: la clave no corresponde al emisor.");
  const receiver = one(root, "Receptor", false);
  const receiverInfo = receiver ? {
    name: value(receiver, "Nombre"), identification: value(one(receiver, "Identificacion", false), "Numero", false),
  } : null;
  const summary = one(root, "ResumenFactura"), currency = one(summary, "CodigoTipoMoneda");
  ensure(value(currency, "CodigoMoneda") === "CRC", "Solo se importan facturas en colones (CRC). Registra las otras monedas manualmente después de convertir sus importes.");
  equals(amount(currency, "TipoCambio"), 1, "el tipo de cambio");
  ensure(!children(root, "OtrosCargos").length && !amount(summary, "TotalOtrosCargos", false) &&
    !amount(summary, "TotalIVADevuelto", false) && !amount(summary, "TotalImpAsumEmisorFabrica", false),
    "Esta factura incluye cargos, IVA devuelto o impuestos asumidos que requieren registro manual.");
  const lines = children(one(root, "DetalleServicio"), "LineaDetalle");
  ensure(lines.length > 0 && lines.length <= 100, "Se admiten entre 1 y 100 líneas de mercadería.");
  const items = lines.map((line) => {
    const lineNumber = amount(line, "NumeroLinea"), qty = amount(line, "Cantidad");
    ensure(Number.isSafeInteger(lineNumber) && lineNumber > 0, "XML: número de línea inválido.");
    ensure(Number.isSafeInteger(qty) && qty > 0 && qty <= 1000000,
      `Línea ${lineNumber}: el inventario actual requiere cantidades enteras. Registra esta compra manualmente con una unidad compatible.`);
    ensure(!children(line, "DetalleSurtido").length && !children(line, "IVACobradoFabrica").length &&
      !amount(line, "ImpuestoAsumidoEmisorFabrica", false), `Línea ${lineNumber}: surtidos o impuestos de fábrica requieren registro manual.`);
    const price = amount(line, "PrecioUnitario"), gross = amount(line, "MontoTotal"), net = amount(line, "SubTotal");
    ensure(price > 0, `Línea ${lineNumber}: el costo debe ser mayor que cero.`);
    const discountAmount = children(line, "Descuento").reduce((sum, d) => sum + amount(d, "MontoDescuento"), 0);
    ensure(discountAmount <= gross, `Línea ${lineNumber}: descuento superior al importe.`);
    equals(gross, qty * price, `el importe de la línea ${lineNumber}`);
    equals(net, gross - discountAmount, `el subtotal de la línea ${lineNumber}`);
    const taxes = children(line, "Impuesto");
    ensure(taxes.length <= 1, `Línea ${lineNumber}: varios impuestos requieren registro manual.`);
    let tax = 0, vat = 0;
    if (taxes.length) {
      const t = taxes[0];
      ensure(value(t, "Codigo") === "01" && !children(t, "Exoneracion").length,
        `Línea ${lineNumber}: solo se admite IVA sin exoneración; registra otros impuestos manualmente.`);
      tax = amount(t, "Tarifa"); vat = amount(t, "Monto");
      ensure([0, 0.5, 1, 2, 4, 8, 13].includes(tax), `Línea ${lineNumber}: tarifa de IVA no admitida.`);
      equals(vat, net * tax / 100, `el IVA de la línea ${lineNumber}`);
    }
    if (one(line, "BaseImponible", false)) equals(amount(line, "BaseImponible"), net, `la base imponible de la línea ${lineNumber}`);
    if (one(line, "ImpuestoNeto", false)) equals(amount(line, "ImpuestoNeto"), vat, `el impuesto neto de la línea ${lineNumber}`);
    const total = amount(line, "MontoTotalLinea");
    equals(total, net + vat, `el total de la línea ${lineNumber}`);
    const codes = children(line, "CodigoComercial").map((c) => value(c, "Codigo"));
    return { lineNumber, name: value(line, "Detalle"), codes, unit: value(line, "UnidadMedida"),
      cabys: value(line, namespaces.get(ns) === "4.4" ? "CodigoCABYS" : "Codigo", false),
      qty, price, gross, discountAmount, discount: gross ? discountAmount / gross * 100 : 0, net, tax, vat, total };
  });
  ensure(new Set(items.map((i) => i.lineNumber)).size === items.length, "XML: números de línea repetidos.");
  const subtotal = amount(summary, "TotalVentaNeta"), vat = amount(summary, "TotalImpuesto", false), total = amount(summary, "TotalComprobante");
  const sum = (key) => items.reduce((n, l) => n + l[key], 0);
  equals(amount(summary, "TotalVenta"), sum("gross"), "TotalVenta", 0.01);
  equals(amount(summary, "TotalDescuentos", false), sum("discountAmount"), "TotalDescuentos", 0.01);
  equals(subtotal, sum("net"), "TotalVentaNeta", 0.01);
  equals(vat, sum("vat"), "TotalImpuesto", 0.01);
  equals(total, subtotal + vat, "TotalComprobante", 0.01);
  const creditDays = amount(root, "PlazoCredito", false);
  ensure(Number.isSafeInteger(creditDays) && creditDays <= 365, "XML: plazo de crédito fuera del rango de 0 a 365 días.");
  const due = new Date(`${date}T12:00:00Z`); due.setUTCDate(due.getUTCDate() + creditDays);
  return { key, invoiceNumber, date, version: namespaces.get(ns), supplier, receiver: receiverInfo,
    items, subtotal, vat, total, creditDays, dueDate: due.toISOString().slice(0, 10),
    sha256: createHash("sha256").update(xml, "utf8").digest("hex") };
}

export function previewPurchaseXml(s, user, xml) {
  admin(user);
  const document = parsePurchaseXml(xml);
  const supplierMatches = s.suppliers.filter((v) => digits(v.identification) === document.supplier.identification);
  ensure(supplierMatches.length <= 1, "Hay varios proveedores con esta identificación. Corrige el catálogo antes de importar.");
  const supplierId = supplierMatches[0]?.id ?? null;
  const duplicate = s.purchaseInvoices.find((i) => i.xml?.key === document.key ||
    (i.supplierId === supplierId && i.invoiceNumber === document.invoiceNumber));
  ensure(!duplicate, "Esta factura XML ya está registrada. Búscala en Facturas de compra.", 409);
  return { ...document, supplierId, items: document.items.map((line) => {
    const matches = s.products.filter((p) => p.active && p.offers.some((o) => o.supplierId === supplierId) &&
      line.codes.some((code) => code.toLowerCase() === p.code.toLowerCase()));
    return { ...line, productId: matches.length === 1 ? matches[0].id : null };
  }) };
}

export function importPurchaseXml(s, user, b) {
  const document = previewPurchaseXml(s, user, b.xml);
  ensure(document.supplierId, "Registra primero al proveedor con la identificación del XML.");
  ensure(Array.isArray(b.mappings) && b.mappings.length === document.items.length, "Asocia todas las líneas a productos del catálogo.");
  const supplier = find(s.suppliers, document.supplierId);
  ensure(supplier.active, "El proveedor está inactivo.");
  const items = document.items.map((line, index) => {
    const p = find(s.products, b.mappings[index]);
    ensure(p.active && p.offers.some((o) => o.supplierId === supplier.id), `${p.name} debe estar activo y asociado al proveedor.`);
    return { ...line, productId: p.id };
  });
  const invoice = createPurchaseInvoice(s, user, {
    supplierId: supplier.id, invoiceNumber: document.invoiceNumber, date: document.date,
    orderId: b.orderId, status: b.status, dueDate: b.dueDate, notes: b.notes, items,
  }, document);
  invoice.xml = { key: document.key, version: document.version, sha256: document.sha256,
    receiver: document.receiver, supplierName: document.supplier.name,
    subtotal: document.subtotal, vat: document.vat, total: document.total };
  s.purchaseInvoiceDocuments ??= {};
  s.purchaseInvoiceDocuments[invoice.id] = b.xml;
  return invoice;
}
