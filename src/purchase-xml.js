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
  const equals = (a, b, label, tolerance = 0.01) => ensure(Math.abs(a - b) <= tolerance,
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
  const charges = children(root, "OtrosCargos").map((charge) => ({
    code: value(charge, "TipoDocumentoOC", false) || value(charge, "TipoDocumento", false),
    description: value(charge, "Detalle"), amount: amount(charge, "MontoCargo"),
    percentage: value(charge, "Porcentaje", false),
    thirdParty: value(charge, "NombreTercero", false),
  }));
  const chargesTotal = amount(summary, "TotalOtrosCargos", false);
  equals(chargesTotal, charges.reduce((n, c) => n + c.amount, 0), "TotalOtrosCargos");
  const vatRefund = amount(summary, "TotalIVADevuelto", false);
  const lines = children(one(root, "DetalleServicio"), "LineaDetalle");
  ensure(lines.length > 0 && lines.length <= 100, "Se admiten entre 1 y 100 líneas de mercadería.");
  const items = lines.map((line) => {
    const lineNumber = amount(line, "NumeroLinea"), qty = amount(line, "Cantidad");
    ensure(Number.isSafeInteger(lineNumber) && lineNumber > 0, "XML: número de línea inválido.");
    ensure(Number.isSafeInteger(qty) && qty > 0 && qty <= 1000000,
      `Línea ${lineNumber}: el inventario actual requiere cantidades enteras. Registra esta compra manualmente con una unidad compatible.`);
    ensure(!children(line, "DetalleSurtido").length, `Línea ${lineNumber}: los surtidos requieren desglosar sus productos antes de ingresarlos al inventario.`);
    const factoryVat = value(line, "IVACobradoFabrica", false);
    const assumedTax = amount(line, "ImpuestoAsumidoEmisorFabrica", false);
    const price = amount(line, "PrecioUnitario"), gross = amount(line, "MontoTotal"), net = amount(line, "SubTotal");
    ensure(price > 0, `Línea ${lineNumber}: el costo debe ser mayor que cero.`);
    const discountAmount = children(line, "Descuento").reduce((sum, d) => sum + amount(d, "MontoDescuento"), 0);
    ensure(discountAmount <= gross, `Línea ${lineNumber}: descuento superior al importe.`);
    equals(gross, qty * price, `el importe de la línea ${lineNumber}`);
    equals(net, gross - discountAmount, `el subtotal de la línea ${lineNumber}`);
    // Se importan los montos declarados: impuestos específicos y bases compuestas
    // no se pueden reconstruir aplicando un porcentaje único sobre SubTotal.
    const taxes = children(line, "Impuesto").map((t) => {
      const code = value(t, "Codigo"), taxAmount = amount(t, "Monto");
      ensure(/^\d{2}$/.test(code), `Línea ${lineNumber}: código de impuesto inválido.`);
      const exemption = one(t, "Exoneracion", false);
      const exonerated = exemption ? amount(exemption, "MontoExoneracion") : 0;
      ensure(exonerated <= taxAmount, `Línea ${lineNumber}: la exoneración supera el impuesto.`);
      const rateText = value(t, "Tarifa", false);
      return { code, description: value(t, "CodigoImpuestoOTRO", false),
        rate: rateText ? amount(t, "Tarifa") : null,
        amount: taxAmount, exonerated, net: Math.max(0, taxAmount - exonerated),
        factor: value(t, "FactorCalculoIVA", false),
        exemption: exemption ? {
          document: value(exemption, "NumeroDocumento", false),
          institution: value(exemption, "NombreInstitucion", false),
          date: value(exemption, "FechaEmision", false),
          rate: value(exemption, "TarifaExonerada", false) || value(exemption, "PorcentajeExoneracion", false),
        } : null,
      };
    });
    const isVat = (t) => ["01", "07", "08"].includes(t.code);
    const vat = taxes.filter(isVat).reduce((n, t) => n + t.net, 0);
    const otherTaxes = taxes.filter((t) => !isVat(t)).reduce((n, t) => n + t.net, 0);
    const tax = taxes.find(isVat)?.rate ?? 0;
    const calculatedTax = vat + otherTaxes - assumedTax;
    ensure(calculatedTax >= -0.00001, `Línea ${lineNumber}: el impuesto asumido supera los impuestos netos.`);
    const taxTotal = one(line, "ImpuestoNeto", false) ? amount(line, "ImpuestoNeto") : Math.max(0, calculatedTax);
    equals(taxTotal, calculatedTax, `el impuesto neto de la línea ${lineNumber}`);
    const taxableBase = one(line, "BaseImponible", false) ? amount(line, "BaseImponible") : net;
    const total = amount(line, "MontoTotalLinea");
    equals(total, net + taxTotal, `el total de la línea ${lineNumber}`);
    const codes = children(line, "CodigoComercial").map((c) => value(c, "Codigo"));
    return { lineNumber, name: value(line, "Detalle"), codes, unit: value(line, "UnidadMedida"),
      cabys: value(line, namespaces.get(ns) === "4.4" ? "CodigoCABYS" : "Codigo", false),
      qty, price, gross, discountAmount, discount: gross ? discountAmount / gross * 100 : 0,
      net, tax, vat, otherTaxes, taxes, assumedTax, factoryVat, taxableBase, taxTotal, total };
  });
  ensure(new Set(items.map((i) => i.lineNumber)).size === items.length, "XML: números de línea repetidos.");
  const subtotal = amount(summary, "TotalVentaNeta"), taxTotal = amount(summary, "TotalImpuesto", false), total = amount(summary, "TotalComprobante");
  const sum = (key) => items.reduce((n, l) => n + l[key], 0);
  equals(amount(summary, "TotalVenta"), sum("gross"), "TotalVenta", 0.01);
  equals(amount(summary, "TotalDescuentos", false), sum("discountAmount"), "TotalDescuentos", 0.01);
  equals(subtotal, sum("net"), "TotalVentaNeta", 0.01);
  const vat = sum("vat"), otherTaxes = sum("otherTaxes"), assumedTax = sum("assumedTax");
  equals(taxTotal, sum("taxTotal"), "TotalImpuesto");
  if (one(summary, "TotalImpAsumEmisorFabrica", false))
    equals(amount(summary, "TotalImpAsumEmisorFabrica"), assumedTax, "TotalImpAsumEmisorFabrica");
  ensure(vatRefund <= vat + 0.01, "XML: el IVA devuelto supera el IVA del detalle.");
  equals(total, subtotal + taxTotal + chargesTotal - vatRefund, "TotalComprobante");
  const groupedTaxes = new Map();
  for (const item of items) for (const t of item.taxes) {
    const key = `${t.code}:${t.rate ?? ""}:${t.description}`;
    const row = groupedTaxes.get(key) ?? { code: t.code, rate: t.rate, description: t.description, amount: 0, exonerated: 0, net: 0 };
    row.amount += t.amount; row.exonerated += t.exonerated; row.net += t.net;
    groupedTaxes.set(key, row);
  }
  const taxBreakdown = [...groupedTaxes.values()];
  const creditDays = amount(root, "PlazoCredito", false);
  ensure(Number.isSafeInteger(creditDays) && creditDays <= 365, "XML: plazo de crédito fuera del rango de 0 a 365 días.");
  const due = new Date(`${date}T12:00:00Z`); due.setUTCDate(due.getUTCDate() + creditDays);
  return { key, invoiceNumber, date, version: namespaces.get(ns), supplier, receiver: receiverInfo,
    items, subtotal, vat, otherTaxes, taxTotal, assumedTax, taxBreakdown, charges, chargesTotal, vatRefund, total, creditDays, dueDate: due.toISOString().slice(0, 10),
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
    subtotal: document.subtotal, vat: document.vat, taxTotal: document.taxTotal, total: document.total };
  s.purchaseInvoiceDocuments ??= {};
  s.purchaseInvoiceDocuments[invoice.id] = b.xml;
  return invoice;
}
