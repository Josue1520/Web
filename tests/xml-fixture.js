// Datos sintéticos para pruebas, sin firma ni validez fiscal.
export function invoiceXml({ version = "4.4", date = "2026-01-15", identification = "3101000001", code = "74010020", sequence = 1 } = {}) {
  const consecutive = `0010000101${String(sequence).padStart(10, "0")}`;
  const key = `506${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(2, 4)}${identification.padStart(12, "0")}${consecutive}100000001`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v${version}/facturaElectronica">
  <Clave>${key}</Clave><CodigoActividadEmisor>471101</CodigoActividadEmisor>
  <NumeroConsecutivo>${consecutive}</NumeroConsecutivo><FechaEmision>${date}T10:30:00-06:00</FechaEmision>
  <Emisor><Nombre>Proveedor XML de prueba</Nombre><Identificacion><Tipo>02</Tipo><Numero>${identification}</Numero></Identificacion>
    <Ubicacion><Provincia>6</Provincia><Canton>01</Canton><Distrito>01</Distrito><OtrasSenas>Puntarenas</OtrasSenas></Ubicacion>
    <Telefono><CodigoPais>506</CodigoPais><NumTelefono>26610000</NumTelefono></Telefono><CorreoElectronico>xml@example.com</CorreoElectronico></Emisor>
  <Receptor><Nombre>Comercio de prueba</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101000099</Numero></Identificacion></Receptor>
  <CondicionVenta>02</CondicionVenta><PlazoCredito>30</PlazoCredito>
  <DetalleServicio><LineaDetalle><NumeroLinea>1</NumeroLinea>
    <${version === "4.4" ? "CodigoCABYS" : "Codigo"}>2431000000100</${version === "4.4" ? "CodigoCABYS" : "Codigo"}>
    <CodigoComercial><Tipo>01</Tipo><Codigo>${code}</Codigo></CodigoComercial><Cantidad>2</Cantidad><UnidadMedida>Unid</UnidadMedida>
    <Detalle>Artículo de prueba &amp; presentación individual</Detalle><PrecioUnitario>100.12345</PrecioUnitario><MontoTotal>200.24690</MontoTotal>
    <Descuento><MontoDescuento>10.24690</MontoDescuento><CodigoDescuento>07</CodigoDescuento><NaturalezaDescuento>Comercial</NaturalezaDescuento></Descuento>
    <SubTotal>190</SubTotal><BaseImponible>190</BaseImponible><Impuesto><Codigo>01</Codigo><CodigoTarifaIVA>08</CodigoTarifaIVA><Tarifa>13</Tarifa><Monto>24.7</Monto></Impuesto>
    <ImpuestoAsumidoEmisorFabrica>0</ImpuestoAsumidoEmisorFabrica><ImpuestoNeto>24.7</ImpuestoNeto><MontoTotalLinea>214.7</MontoTotalLinea>
  </LineaDetalle></DetalleServicio>
  <ResumenFactura><CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda><TipoCambio>1</TipoCambio></CodigoTipoMoneda>
    <TotalMercanciasGravadas>200.24690</TotalMercanciasGravadas><TotalGravado>200.24690</TotalGravado><TotalVenta>200.24690</TotalVenta>
    <TotalDescuentos>10.24690</TotalDescuentos><TotalVentaNeta>190</TotalVentaNeta><TotalImpuesto>24.7</TotalImpuesto><TotalComprobante>214.7</TotalComprobante>
  </ResumenFactura>
</FacturaElectronica>`;
}

export function taxedInvoiceXml(options = {}) {
  return invoiceXml(options)
    .replace("</Impuesto>", `<Exoneracion><TipoDocumentoEX1>01</TipoDocumentoEX1><NumeroDocumento>PRUEBA-EX-01</NumeroDocumento><NombreInstitucion>01</NombreInstitucion><FechaEmision>2025-01-01T00:00:00-06:00</FechaEmision><MontoExoneracion>4.7</MontoExoneracion></Exoneracion></Impuesto><Impuesto><Codigo>04</Codigo><DatosImpuestoEspecifico><CantidadUnidadMedida>2</CantidadUnidadMedida><ImpuestoUnidad>2.5</ImpuestoUnidad></DatosImpuestoEspecifico><Monto>5</Monto></Impuesto>`)
    .replace("<ImpuestoAsumidoEmisorFabrica>0", "<ImpuestoAsumidoEmisorFabrica>3")
    .replace("<ImpuestoNeto>24.7", "<ImpuestoNeto>22")
    .replace("<MontoTotalLinea>214.7", "<MontoTotalLinea>212")
    .replace("<ResumenFactura>", `<OtrosCargos><TipoDocumentoOC>99</TipoDocumentoOC><Detalle>Transporte de mercadería</Detalle><MontoCargo>10</MontoCargo></OtrosCargos><ResumenFactura>`)
    .replace("<TotalImpuesto>24.7", "<TotalImpuesto>22")
    .replace("<TotalComprobante>214.7", "<TotalImpAsumEmisorFabrica>3</TotalImpAsumEmisorFabrica><TotalIVADevuelto>2</TotalIVADevuelto><TotalOtrosCargos>10</TotalOtrosCargos><TotalComprobante>220");
}
