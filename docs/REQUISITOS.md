# Correspondencia entre SIPRO y el PDF

Referencia: **Proyecto de Sistemas.pdf**, documento adjunto por el usuario, etapa 3. Se utiliza como especificación funcional para la demostración solicitada. Las tres pantallas del ZIP eran la base visual, con navegación incompleta y facturación en memoria.

| Subsistema / referencia | Implementación                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-SS-01                | Autenticación, cierre de sesión, alta/consulta/edición de usuarios, Administrador/Dependiente, validación de permisos en API.                                                                  |
| RF-SP-01                | Registro con identificación única, consulta, actualización y activación/desactivación de proveedores; contacto, condiciones de pago, entrega y mínimo; catálogo asociado.                      |
| RF-SCP-01               | Alta, consulta, búsqueda por nombre/código, filtros por categoría/estado, edición, asociación/desasociación de proveedores con costo y entrega, estado sin borrar el historial.                |
| RF-SI-01                | Existencia inicial, movimientos de venta/recepción/anulación y ajustes justificados; mínimos y alertas al alcanzar o bajar del mínimo; inventario crítico y reporte imprimible.                |
| RF-SF-01                | Facturas de venta con cliente, cantidades, precio, descuento e IVA; consecutivo; historial por fechas/número/cliente/estado; anulación justificada con reintegro; impresión y reimpresión/PDF. |
| RF-SPE-01               | Proveedor y productos asociados, cantidades, pantalla de revisión, registro, modificación pendiente, consulta por número/proveedor/fecha/estado; recepción completa.                           |
| RF-SR-01                | Reportes de pedidos, compras recibidas y productos solicitados por período/proveedor/estado, además de ventas, inventario y utilidad estimada; impresión/PDF y Excel.                          |

## Reglas aplicadas

- Un dependiente puede consultar proveedores, productos y existencias, crear/modificar pedidos pendientes, emitir/consultar/imprimir facturas y consultar reportes operativos.
- Solo un administrador modifica catálogos, usuarios o inventario, recibe pedidos, anula facturas, consulta utilidad e inventario como reporte y exporta reportes. No se puede desactivar o degradar al último administrador activo.
- Productos y proveedores desactivados permanecen en el sistema; no se usan para nuevas compras. Las operaciones históricas conservan nombres, cantidades y precios originales.
- No se permite vender más de la existencia disponible. Las transacciones evitan operaciones parciales y descuentos concurrentes por debajo de cero.
- Pedidos recibidos y facturas anuladas no repiten sus movimientos de inventario.
- Consultas de reportes limitadas desde el inicio de operaciones hasta la fecha actual de Costa Rica; las facturas de compra permiten consultar desde el XML importado más antiguo. Las operaciones usan la fecha del servidor, no una fecha futura enviada por el cliente.
- Los reportes se generan al solicitarlos, no se guardan en la base y no permiten editar los registros de origen.
- Precio de venta **con IVA incluido**, como en el prototipo original; IVA configurable por producto. El descuento porcentual se aplica antes de separar base e impuesto. El 13% es únicamente el valor inicial de demostración: no representa una clasificación tributaria de cada producto.
- Costo promedio ponderado al recibir mercadería. La factura conserva el costo unitario de ese momento. La utilidad excluye facturas anuladas y compara ingreso sin IVA contra esos costos; no descuenta gastos operativos.

## Ambigüedades resueltas y límites

1. El PDF menciona «cliente» en algunos reportes de pedidos; se muestra **proveedor**, porque esos pedidos son de abastecimiento. Los datos de cliente aparecen en las ventas.
2. El PDF menciona PDF en los RF y PDF/Excel en el alcance: se incluyen ambos mediante impresión a PDF del navegador y archivo SpreadsheetML `.xls`.
3. El PDF no define un protocolo para enviar pedidos a suplidores. La demostración registra y sigue pedidos **internos**; no simula un envío externo.
4. «Recibido» corresponde a recepción completa, sin recepciones parciales ni devoluciones a proveedores. El rol administrador confirma la recepción porque modifica existencias.
5. El inventario es el saldo **actual**, no una reconstrucción histórica para la fecha del filtro.
6. La facturación registra un medio de pago por factura; tarjeta y SINPE son registros manuales, sin integración bancaria. No hay integración con Hacienda.
7. El reporte de utilidad permite consultar distintos períodos; la comparación entre períodos se realiza consultando/exportando cada uno. No se incluye una gráfica comparativa automática.
8. La información se conserva en SQLite mediante un documento transaccional, suficiente para la demostración. Para producción se requiere diseño relacional, migraciones, controles operativos, copias de seguridad y pruebas de carga. No se afirma cumplimiento del límite de cinco segundos para cualquier volumen de datos.
9. Una pantalla abierta no recibe actualizaciones en tiempo real desde otras cajas. Cada operación se valida contra la base actual; navegar/recargar permite consultar cambios, y el servidor impide sobreventa aunque una pantalla muestre existencias antiguas.
10. Las cuentas iniciales son públicas para pruebas locales. No se incluye recuperación de contraseñas por correo ni conexión a un servicio externo de identidad.

## Evidencia de validación

`npm test` verifica autenticación, roles, CRUD, duplicados, mínimos de compra, ciclo pedido/recepción/venta/anulación, inventario concurrente, transacciones fallidas, persistencia SQLite, filtros de reportes y exportación Excel.

`npm run test:browser` recorre los formularios reales, revisa permisos visibles, guarda PDF y Excel, y comprueba que la pantalla de resumen no desborde un ancho móvil de 390 píxeles. Utiliza una base temporal; las pruebas no introducen operaciones en la base de demostración del usuario.

## Ampliación solicitada: facturas de proveedores

Se incorpora el apartado **Facturas de compra** como extensión de compras/facturación:

- Registro del número externo único por proveedor, fecha, líneas con costo sin IVA, descuento e impuesto, subtotal, total y observaciones.
- Compra directa recibida: entrada de inventario y costo promedio ponderado, sin IVA, con descuentos. Los mínimos comerciales restringen nuevos pedidos, no el registro de un comprobante de una compra ya realizada.
- Factura de pedido recibido: asociación única, con comprobación de proveedor, productos y cantidades. Mantiene el inventario y la valoración ya registrada; no corrige retroactivamente costos ni utilidades si el precio facturado difiere del pedido.
- Estado pagada/pendiente, vencimiento y registro posterior del pago completo; consulta y filtro de historial.
- Reporte independiente de facturas de compra, impresión/PDF y Excel.
- Administrador registra y marca pagos; dependiente consulta. Sin edición/anulación, recepción parcial, facturación parcial ni pagos parciales. La ampliación XML descrita abajo permite conservar el archivo original.
- Las bases existentes conservan todos sus datos; la colección de facturas de compra se incorpora automáticamente, sin reinicialización.

Las pruebas comprueban cálculo de importes, entradas directas, ausencia de movimientos duplicados por asociación a pedidos, duplicados concurrentes, permisos, pagos, reportes y compatibilidad con la base anterior. El recorrido del navegador registra ambos tipos de compra, imprime el detalle, registra el pago y exporta el reporte.

## Ampliación solicitada: interfaz de caja e impresión de tickets

- Presentación compacta de punto de venta, entrada por código/lector de teclado y atajos F2/F4/F8/F9/F10.
- Apartado permanente **Ventas guardadas** con filtros y acceso al comprobante persistido.
- Vista previa, impresión y reimpresión térmica de **80 mm o 58 mm**, con ancho seleccionable y largo del PDF calculado según el contenido.
- Las facturas nuevas conservan fecha/hora de emisión. Las anteriores siguen siendo compatibles y muestran su fecha original.
- La reimpresión no escribe operaciones ni modifica existencias; los tickets anulados muestran el estado y la justificación.
- Reportes y registros de compras se imprimen en A4. No se integran funciones propietarias de Qupos, periféricos ESC/POS ni facturación fiscal.


## Ampliación solicitada: diseño e importación XML

- Navegación superior por operación, abastecimiento, catálogo y administración; se recuperan el azul y blanco originales con una distribución nueva de caja, indicadores, tablas, acceso y formularios.
- XML costarricense 4.3/4.4 con revisión previa, asociación por identificación del emisor y códigos comerciales; alta asistida de proveedor y productos faltantes.
- Datos e importes reparsados por el servidor al guardar, prevención de duplicados por clave/consecutivo, transacción atómica y recuperación del XML original con hash SHA-256.
- Las líneas repetidas del mismo producto conservan sus importes de origen; la entrada se agrupa por producto y se comprueban las cantidades totales al vincular un pedido.
- Importación solo por administrador. XML de hasta 1 MB, CRC, cantidades enteras, IVA e impuestos específicos, exoneraciones, impuestos asumidos, cargos e IVA devuelto; rechazo de DTD/entidades, documentos dañados, formatos no admitidos e importes inconsistentes.
- No se valida la firma, el XSD completo ni la respuesta de Hacienda, y no se emite aceptación fiscal. [Fuentes, decisiones y límites](DISENO-IMPORTACION-XML.md).
- Pruebas de API y navegador con datos sintéticos, sin firma fiscal, que verifican precisión, permisos, duplicados concurrentes, inventario, descarga idéntica del original UTF-8 (incluido BOM), persistencia y formularios móviles.

- Los impuestos se conservan por código, tarifa e importe declarado. Las exoneraciones y ajustes se desglosan, sin tratar impuestos específicos como IVA porcentual. Se verifica `neto + impuestos netos + cargos − IVA devuelto = total`.
- El reporte de compras y Excel incorporan otros impuestos, impuestos asumidos, impuestos netos, cargos e IVA devuelto. Las facturas antiguas se consultan sin migración destructiva.
- El costo promedio mantiene la regla de neto de mercadería: no capitaliza automáticamente impuestos específicos ni fletes. Esta demostración no determina crédito fiscal ni costo tributario.
