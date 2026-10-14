# Diseño e importación de facturas XML

Investigación y decisiones aplicadas el 13 de octubre de 2026.

## Referencias consultadas

- **Carbon Design System, Data table / Usage**: [documentación](https://carbondesignsystem.com/components/data-table/usage/) y [fuente de la documentación](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/usage.mdx). Se consultó el archivo fuente del repositorio: anatomía de tablas, títulos, densidad, búsqueda y barra de acciones. La referencia recomienda reservar la barra para acciones globales y mantener tamaños de filas/controles coherentes. No se incorporó Carbon como dependencia.
- **Esquema FacturaElectronica 4.4**, copia pública mantenida por CRLibre: [FacturaElectronica_V4.4.xsd](https://github.com/CRLibre/API_Hacienda/blob/28a080a9391875d6681e63b93e75108852633d3f/www/xsd/FacturaElectronica_V4.4.xsd). Se revisaron emisor, clave, consecutivo, líneas, descuentos, impuestos y resumen. También se consultó el [generador XML del mismo repositorio](https://github.com/CRLibre/API_Hacienda/blob/28a080a9391875d6681e63b93e75108852633d3f/api/contrib/genXML/genXML.php).
- **xmldom**: [documentación del parser](https://github.com/xmldom/xmldom). Se utiliza `@xmldom/xmldom` 0.9.12, fijado con su integridad en el lockfile, con errores de parseo tratados como rechazo del archivo.

El acceso directo al sitio de Carbon y al CDN de esquemas estuvo bloqueado desde el entorno de desarrollo; se consultaron sus fuentes públicas mediante Git. El XSD utilizado es una copia en CRLibre: no se afirma haber comprobado la versión normativa más reciente de Hacienda. La compatibilidad de lectura 4.3/4.4 se prueba con documentos sintéticos; no equivale a certificación fiscal.

## Decisiones de interfaz

La expresión «vibe coding» no es una categoría técnica verificable. Aquí se interpretó como evitar una presentación de plantilla con adornos repetidos que compiten con las tareas del negocio.

- Recuperar los colores de la primera versión: azul #1f5a99, azul oscuro #153c66, blanco y fondo #f3f6fa. El usuario pidió sustituir el estilo salvia. Se eliminó el bloque del tema anterior y se creó un sistema visual de superficies planas, líneas divisorias y controles compactos.
- Usar barra lateral agrupada, según la preferencia del usuario y la cantidad de módulos. Mantener el mismo orden en todas las pantallas y marcar la sección activa. Mostrar indicadores en una franja y reunir filtros/tablas en una superficie de consulta. En caja, priorizar artículos, dejar cliente debajo y mantener cobro a la derecha. En móvil, el menú se abre con un control nativo de navegación y las tablas admiten desplazamiento horizontal sin desbordar la página.
- Alinear importes y cantidades a la derecha, usar cifras tabulares y encabezados cortos. Los estados de pago combinan texto y color.
- Dar a Facturas de compra dos acciones explícitas: registro manual e importación XML. La revisión muestra primero emisor, consecutivo y total; después el detalle y sus asociaciones; finalmente inventario y pago.
- Solicitar una revisión de unidades/presentaciones y destinatario antes de importar. El catálogo no permite deducir automáticamente que una caja del proveedor equivale a una unidad de venta.
- Mantener búsqueda, etiquetas de formulario, foco visible, tablas con desplazamiento horizontal en móvil y los tickets de venta de 80/58 mm.

## Contrato de importación

Solo administradores pueden revisar, importar y descargar XML. Se acepta `FacturaElectronica`, con namespace costarricense 4.3/4.4, colones, hasta 1 MB y 100 líneas de cantidades enteras. Se admiten múltiples impuestos por línea, IVA y sus variantes, impuestos específicos (bebidas, tabaco, combustibles, etc.), otros impuestos declarados, exoneraciones, ajustes de fábrica/asumidos, cargos e IVA devuelto. Se mantienen los importes fuente hasta cinco decimales. Las comprobaciones aritméticas admiten hasta 0,01 de diferencia por línea y encabezado para redondeos; no se recalcula una tarifa tributaria desde el catálogo. Los totales contables se redondean a dos decimales; el original queda disponible.

La vista previa no escribe datos. Al confirmar, el servidor vuelve a parsear el XML y reconstruye importes y proveedor; ignora totales o productos financieros enviados por el navegador. Las asociaciones se validan contra el catálogo actual. La importación rechaza un proveedor inactivo o un producto inactivo/no asociado.

La identificación del emisor se compara con la del catálogo, tolerando espacios, puntos y guiones. La sugerencia de producto usa códigos comerciales, nunca CABYS. El usuario puede crear proveedores y productos mediante sus formularios; esas altas son operaciones independientes y permanecen aunque cierre la importación. El alta de producto desde XML comienza con existencias en cero.

La clave y el consecutivo deben corresponder al emisor. Una clave repetida o el mismo consecutivo del mismo proveedor se rechazan, incluyendo solicitudes simultáneas y facturas registradas manualmente. La factura, su XML original y los movimientos se guardan en una sola transacción SQLite. El SHA-256 identifica el archivo conservado; no demuestra autenticidad ni valida su firma.

Una compra directa suma existencias y actualiza costo promedio neto. Si un producto aparece en varias líneas, conserva sus importes individuales y agrupa su entrada. Una compra asociada a un pedido recibido exige los mismos productos y cantidades totales y no modifica existencias ni costos. Los XML anteriores al inicio del sistema conservan su fecha de emisión; el inventario se mueve en la fecha de registro y los reportes de compras incluyen ese período anterior.

## Límites explícitos

No se aceptan mediante XML otras monedas, cantidades fraccionarias ni surtidos que necesitan descomposición de inventario. Tampoco tiquetes, notas de crédito/débito o mensajes de Hacienda. El rechazo explica el campo o función incompatible; no se elimina silenciosamente un cargo.

La importación no valida el XSD completo, la firma digital, el estado de Hacienda ni la identidad legal del negocio receptor; el destinatario se presenta para revisión humana. No envía aceptación/rechazo fiscal, no emite facturas electrónicas y no realiza pagos. Las cuentas de demostración y fixtures no deben interpretarse como documentos fiscales.

El parser rechaza DTD/entidades, estructura ambigua en campos únicos, caracteres incompatibles y complejidad excesiva. No descarga recursos remotos. El XML original se entrega como archivo adjunto autenticado y queda excluido de la respuesta general de estado. La base agregada SQLite sigue siendo adecuada para la demostración; un archivo documental de gran volumen necesita almacenamiento y diseño de base específicos.

## Evidencia

`npm test` prueba importación, precisión, formatos, prefijos de namespace, errores, duplicados concurrentes, permisos, inventario, persistencia y reportes históricos. `npm run test:browser` ejecuta los formularios de compra/venta e importación, altas asistidas, descarga idéntica del XML UTF-8 con BOM, revisión móvil y errores visibles. Los tests usan bases temporales y no modifican `data/`.


## Ampliación de impuestos y cargos

Se consultaron de nuevo las anotaciones del XSD 4.4 de CRLibre para `ImpuestoType`, `ExoneracionType`, `ImpuestoNeto`, `ImpuestoAsumidoEmisorFabrica`, `IVACobradoFabrica` y `TotalComprobante`. Los impuestos específicos pueden usar unidades, factores y bases compuestas; por eso el importador conserva el monto declarado en lugar de calcular todos como `subtotal × tarifa`.

Por línea: impuestos netos = suma de impuestos menos exoneraciones menos impuestos asumidos/de fábrica. Se cotejan `ImpuestoNeto` y `MontoTotalLinea`. En el resumen: `TotalComprobante = TotalVentaNeta + TotalImpuesto + TotalOtrosCargos − TotalIVADevuelto`. Cada cargo conserva concepto, código, porcentaje e importe. La vista previa, el detalle, impresión de compras y Excel muestran los componentes por separado.

El importe de IVA mostrado es posterior a exoneraciones y anterior al ajuste agregado de impuestos asumidos, que se resta en su propia fila; el desglose no atribuye ese ajuste a un impuesto particular sin información del emisor. No se calcula crédito fiscal ni validez de una exoneración. Los parámetros específicos permanecen en el XML original. El inventario se valora con neto de mercadería, sin distribuir impuestos ni cargos.

Las pruebas incluyen un documento sintético con IVA, impuesto de bebidas, exoneración, impuesto asumido, transporte e IVA devuelto, otro con base imponible compuesta y casos inconsistentes rechazados sin cambios parciales. La captura del usuario permite identificar el rechazo anterior, pero no proporciona el contenido del XML real: todavía no se ha probado ese archivo específico.


## Revisión: navegación e identidad visual

Fuentes adicionales consultadas el 13 de octubre de 2026:

- **Carbon, UI shell left panel**: [documentación](https://carbondesignsystem.com/components/UI-shell-left-panel/usage/) y [fuente consultada](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/UI-shell-left-panel/usage.mdx). Recomienda panel izquierdo cuando existen más de cinco secciones secundarias o cuando el usuario cambia frecuentemente entre ellas. SIPRO tiene diez módulos y el usuario prefiere ese panel: se recupera una barra lateral persistente y agrupada.
- **W3C, Understanding Consistent Navigation (3.2.3)**: [documentación](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html) y [fuente consultada](https://github.com/w3c/wcag/blob/main/understanding/20/consistent-navigation.html). Explica cómo el orden estable de controles facilita la orientación y la memoria espacial. Se mantiene un orden fijo de módulos y una indicación textual y visual de la página activa.

Estas referencias describen usabilidad y accesibilidad, no un detector de interfaces hechas con IA. La interpretación aplicada de «que no parezca IA» es dar prioridad al trabajo del comercio: nombres específicos, datos reales, mensajes que expliquen el resultado, una paleta azul estable, jerarquía consistente y ausencia de adornos o estadísticas inventadas. No se afirma conformidad completa con WCAG a partir de estas decisiones.

La barra lateral conserva los azules originales. En móvil se convierte en menú plegable con `details/summary`, operable con teclado; al entrar en otra sección se pliega para dejar espacio al contenido. No se duplica la navegación ni se dejan controles ocultos accesibles al teclado.

## Evidencia del ingreso de inventario

La regla existente de compra directa ya incrementaba existencias dentro de la misma transacción que guarda la factura. Se conserva y ahora se registra además un comprobante de movimiento por producto, con saldo anterior, cantidad ingresada, saldo posterior e identificador del movimiento. El detalle presenta ese resultado después de guardar, tanto para XML como para compra manual. No son saldos actuales calculados retroactivamente: permanecen iguales si hay ventas posteriores.

Una factura vinculada a un pedido recibido registra explícitamente ese origen y no repite movimientos. En facturas anteriores a esta ampliación se mantiene el historial disponible, sin inventar saldos históricos. Las pruebas comprueban la entrada, la vinculación sin duplicados, la recuperación desde SQLite y la existencia mostrada en la pantalla de Inventario después de importar y recargar.


## Tema Glassmorphism y MVC

La solicitud posterior sustituyó expresamente la paleta azul por una estética oscura. La versión actual usa #090d17 como fondo y #bfa8ff como acento, conserva la navegación lateral y aplica transparencia moderada, bordes suaves, sombras discretas y más separación entre elementos. Las decisiones de navegación e información anteriores siguen vigentes; las referencias a azul y superficies planas documentan la versión previa.

DM Sans y Manrope provienen del [repositorio oficial de Google Fonts](https://github.com/google/fonts), carpetas `ofl/dmsans` y `ofl/manrope`. Los archivos variables y sus licencias OFL se distribuyen en `public/fonts/`: la interfaz no depende de peticiones a Google y no necesita relajar la política CSP.

El CSS del tema está limitado a pantalla. Los tickets mantienen fondo blanco, texto negro y anchos de 80/58 mm; las compras y reportes siguen en A4. Se conserva el foco visible de teclado, se reducen animaciones con `prefers-reduced-motion` y se ofrecen superficies opacas con `prefers-reduced-transparency`. Esto no constituye una certificación de accesibilidad.

La organización y los puntos de edición se explican en [Arquitectura MVC](ARQUITECTURA-MVC.md).
