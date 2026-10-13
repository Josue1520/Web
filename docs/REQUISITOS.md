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
- Consultas de reportes limitadas desde el inicio de operaciones hasta la fecha actual de Costa Rica. Las operaciones usan la fecha del servidor, no una fecha futura enviada por el cliente.
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
