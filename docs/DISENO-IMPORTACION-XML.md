# Diseño e importación de facturas XML

Investigación y decisiones aplicadas el 13 de octubre de 2026.

## Referencias consultadas

- **Carbon Design System, Data table / Usage**: [documentación](https://carbondesignsystem.com/components/data-table/usage/) y [fuente de la documentación](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/usage.mdx). Se consultó el archivo fuente del repositorio: anatomía de tablas, títulos, densidad, búsqueda y barra de acciones. La referencia recomienda reservar la barra para acciones globales y mantener tamaños de filas/controles coherentes. No se incorporó Carbon como dependencia.
- **Esquema FacturaElectronica 4.4**, copia pública mantenida por CRLibre: [FacturaElectronica_V4.4.xsd](https://github.com/CRLibre/API_Hacienda/blob/28a080a9391875d6681e63b93e75108852633d3f/www/xsd/FacturaElectronica_V4.4.xsd). Se revisaron emisor, clave, consecutivo, líneas, descuentos, impuestos y resumen. También se consultó el [generador XML del mismo repositorio](https://github.com/CRLibre/API_Hacienda/blob/28a080a9391875d6681e63b93e75108852633d3f/api/contrib/genXML/genXML.php).
- **xmldom**: [documentación del parser](https://github.com/xmldom/xmldom). Se utiliza `@xmldom/xmldom` 0.9.12, fijado con su integridad en el lockfile, con errores de parseo tratados como rechazo del archivo.

El acceso directo al sitio de Carbon y al CDN de esquemas estuvo bloqueado desde el entorno de desarrollo; se consultaron sus fuentes públicas mediante Git. El XSD utilizado es una copia en CRLibre: no se afirma haber comprobado la versión normativa más reciente de Hacienda. La compatibilidad de lectura 4.3/4.4 se prueba con documentos sintéticos; no equivale a certificación fiscal.

## Decisiones de interfaz

La expresión «vibe coding» no es una categoría técnica verificable. Aquí se interpretó como evitar una presentación de plantilla con adornos repetidos que compiten con las tareas del negocio.

- Mantener una paleta cálida y verde salvia, con superficies claras y bordes discretos. Sustituir los radios asimétricos, títulos serif, figuras decorativas y tarjetas de muchos colores por formas y tipografía consistentes.
- Agrupar la navegación en operación, compras, catálogo y administración. Marcar la ubicación actual y mantener accesibles las acciones de cada módulo.
- Alinear importes y cantidades a la derecha, usar cifras tabulares y encabezados cortos. Los estados de pago combinan texto y color.
- Dar a Facturas de compra dos acciones explícitas: registro manual e importación XML. La revisión muestra primero emisor, consecutivo y total; después el detalle y sus asociaciones; finalmente inventario y pago.
- Solicitar una revisión de unidades/presentaciones y destinatario antes de importar. El catálogo no permite deducir automáticamente que una caja del proveedor equivale a una unidad de venta.
- Mantener búsqueda, etiquetas de formulario, foco visible, tablas con desplazamiento horizontal en móvil y los tickets de venta de 80/58 mm.

## Contrato de importación

Solo administradores pueden revisar, importar y descargar XML. Se acepta `FacturaElectronica`, con namespace costarricense 4.3/4.4, colones, hasta 1 MB y 100 líneas de cantidades enteras. Se admiten IVA simple y descuentos monetarios; se mantienen los importes fuente hasta cinco decimales. Las comprobaciones aritméticas admiten 0,00006 de diferencia por línea y 0,01 en las sumas del encabezado, para redondeos. Los totales contables se redondean a dos decimales; el original queda disponible.

La vista previa no escribe datos. Al confirmar, el servidor vuelve a parsear el XML y reconstruye importes y proveedor; ignora totales o productos financieros enviados por el navegador. Las asociaciones se validan contra el catálogo actual. La importación rechaza un proveedor inactivo o un producto inactivo/no asociado.

La identificación del emisor se compara con la del catálogo, tolerando espacios, puntos y guiones. La sugerencia de producto usa códigos comerciales, nunca CABYS. El usuario puede crear proveedores y productos mediante sus formularios; esas altas son operaciones independientes y permanecen aunque cierre la importación. El alta de producto desde XML comienza con existencias en cero.

La clave y el consecutivo deben corresponder al emisor. Una clave repetida o el mismo consecutivo del mismo proveedor se rechazan, incluyendo solicitudes simultáneas y facturas registradas manualmente. La factura, su XML original y los movimientos se guardan en una sola transacción SQLite. El SHA-256 identifica el archivo conservado; no demuestra autenticidad ni valida su firma.

Una compra directa suma existencias y actualiza costo promedio neto. Si un producto aparece en varias líneas, conserva sus importes individuales y agrupa su entrada. Una compra asociada a un pedido recibido exige los mismos productos y cantidades totales y no modifica existencias ni costos. Los XML anteriores al inicio del sistema conservan su fecha de emisión; el inventario se mueve en la fecha de registro y los reportes de compras incluyen ese período anterior.

## Límites explícitos

No se aceptan mediante XML otras monedas, cantidades fraccionarias, exoneraciones, múltiples impuestos por línea, impuestos distintos del IVA, surtidos, IVA devuelto, impuestos de fábrica ni otros cargos. Tampoco tiquetes, notas de crédito/débito o mensajes de Hacienda. El rechazo explica el campo o función incompatible; no se elimina silenciosamente un cargo.

La importación no valida el XSD completo, la firma digital, el estado de Hacienda ni la identidad legal del negocio receptor; el destinatario se presenta para revisión humana. No envía aceptación/rechazo fiscal, no emite facturas electrónicas y no realiza pagos. Las cuentas de demostración y fixtures no deben interpretarse como documentos fiscales.

El parser rechaza DTD/entidades, estructura ambigua en campos únicos, caracteres incompatibles y complejidad excesiva. No descarga recursos remotos. El XML original se entrega como archivo adjunto autenticado y queda excluido de la respuesta general de estado. La base agregada SQLite sigue siendo adecuada para la demostración; un archivo documental de gran volumen necesita almacenamiento y diseño de base específicos.

## Evidencia

`npm test` prueba importación, precisión, formatos, prefijos de namespace, errores, duplicados concurrentes, permisos, inventario, persistencia y reportes históricos. `npm run test:browser` ejecuta los formularios de compra/venta e importación, altas asistidas, descarga idéntica del XML UTF-8 con BOM, revisión móvil y errores visibles. Los tests usan bases temporales y no modifican `data/`.
