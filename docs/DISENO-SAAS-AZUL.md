# Tema azul y referencias SaaS

Revisión del 14 de octubre de 2026. La petición fue recuperar el azul anterior, reducir el blanco del fondo y adaptar patrones de varias aplicaciones SaaS a todo SIPRO.

## Referencias consultadas

Los sitios de Atlassian Design, Shopify Polaris, GitHub Primer, Carbon y Linear devolvieron 403 desde el proxy del entorno. Se consultaron fuentes oficiales accesibles en GitHub; no se presenta esta investigación como una inspección de sus productos autenticados actuales.

| Referencia | Evidencia consultada | Adaptación en SIPRO |
| --- | --- | --- |
| GitHub / Primer | [Nav list](https://github.com/primer/design/blob/main/content/components/nav-list.mdx) y [Data table](https://github.com/primer/design/blob/main/content/components/data-table.mdx), documentación fuente. Describe navegación vertical, estado actual, grupos relacionados, iconos alineados y distinción entre controles de tabla y acciones de fila. Las imágenes externas de Primer no fueron accesibles. | Grupos de navegación estables, indicador lateral de selección, iconos alineados y controles compactos. Filtros integrados con la tabla; botones secundarios discretos frente a la acción principal. |
| IBM / Carbon | [Tablas](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/usage.mdx) y [panel izquierdo](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/UI-shell-left-panel/usage.mdx). También se inspeccionaron visualmente las imágenes oficiales de [anatomía de tabla](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/images/datatable-anatomy.png) y [navegación](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/UI-shell-left-panel/images/left-panel-usage-1.png). | Encabezados de tabla tintados, separadores finos, filas regulares, azul para acciones y navegación persistente. La caja mantiene su panel de cobro separado del detalle de artículos. |
| Shopify / Polaris React, archivo histórico | Se revisaron las fuentes de [Card](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/Card/Card.tsx) y [IndexTable](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/IndexTable/IndexTable.module.css). El [README](https://github.com/Shopify/polaris/blob/main/README.md) declara que esta biblioteca está archivada y remite a Polaris Web Components. Es una referencia histórica de componentes, no evidencia del diseño actual del administrador de Shopify. | Paneles con bordes moderados y sombra corta, separación entre fondo general y superficies, espaciado coherente y adaptación de componentes al ancho disponible. |

La implementación CSS es propia. No incorpora bibliotecas, marcas, imágenes ni código de esas interfaces; adapta sus patrones generales a las operaciones del mini súper.

## Paleta y componentes

| Uso | Color |
| --- | --- |
| Acción principal y enlaces | `#1f5a99` |
| Barra lateral y encabezado de acceso | `#153c66` |
| Fondo general | `#e5ebf3` |
| Paneles y diálogos | `#f5f7fb` |
| Superficies secundarias | `#edf2f8` |
| Campos editables | `#fcfdff` |
| Texto principal / secundario | `#203349` / `#54677f` |
| Divisiones | `#ced8e5` |

Los indicadores y medios de pago del dashboard usan distintos tonos azules. Verde, ámbar y rojo se reservan para estados de éxito, advertencia y error, acompañados por texto. Los importes usan cifras tabulares. Botones y navegación cambian de fondo/borde al pasar el puntero, sin desplazarse; los controles conservan un foco visible.

El tema abarca acceso, resumen, caja, historial de ventas, pedidos, facturas de compra, proveedores, productos, inventario, reportes, usuarios y diálogos. La barra lateral se pliega en móvil; las tablas extensas se desplazan dentro de su contenedor. Los tickets conservan papel blanco y tinta negra; la impresión sigue en 80/58 mm y A4 según el documento.

## Implementación y comprobaciones

`public/styles/glass.css` conserva su nombre histórico para evitar cambiar la ruta del recurso, pero reemplaza el tema lavanda por los tokens y componentes azules. `dashboard.css` consume esa paleta y deja de cambiar por separado el fondo y la barra lateral de Resumen. `index.css` conserva estructura e impresión. El icono y el color del navegador usan también azul. No cambian modelos, controladores, datos ni reglas de negocio.

Se ejecutaron los cuatro recorridos existentes de navegador: operaciones generales con tickets/PDF y Excel, importación XML, recomendaciones de pedidos y dashboard. Se revisaron capturas de escritorio, diálogos y móvil generadas con bases temporales. Las referencias de color no equivalen a una certificación completa de accesibilidad.

[Dashboard](capturas/dashboard-ventas.png) · [Caja](capturas/caja.png) · [Acceso](capturas/acceso.png) · [Móvil](capturas/dashboard-ventas-movil.png)

## Dashboard según las capturas aportadas

La revisión posterior usa las seis capturas del usuario como referencia visual: indicadores en cuatro columnas y paneles de análisis a todo el ancho. Se añaden ventas anuales por mes, utilidad bruta estimada para administradores, ventas por hora y selección de colones/unidades/facturas en la semana. Se conserva la paleta azul y se usan gráficos planos con tablas alternativas de datos.

El Top 10 sustituye el gráfico circular con etiquetas apretadas por una tabla ordenada con barras horizontales, cantidades, importes y porcentajes. Incluye acceso directo, fechas desde/hasta y consulta general o por proveedor. Su rango es independiente de los otros gráficos. Los resultados muestran siempre el rango y proveedor efectivamente consultados, incluso si después se editan los campos.

No se reproducen cifras, metas comerciales ni sucursales de las capturas: las estadísticas corresponden a la instalación de SIPRO. Los totales de ventas del negocio ya se muestran en las tarjetas y el resumen. La utilidad es una estimación con costos históricos, no ganancia neta. Las facturas sin hora o costos completos se identifican sin inventar información.

## Facturación según las fotografías aportadas

La caja toma la distribución de las fotografías de Qupos: barra de acciones, total destacado, entrada por código, tabla de artículos, accesos rápidos a la derecha y una franja de estado inferior. Se conserva la identidad azul de SIPRO. La botonera utiliza el catálogo real, suma una unidad por toque y permite buscar, filtrar por categoría y cambiar de página. Las cantidades se validan contra existencias tanto en la interfaz como en el servidor.

La ventana Pago separa cliente, medio de pago y confirmación. Incluye efectivo, tarjeta y SINPE, teclado numérico, botones que suman denominaciones y monto exacto. Muestra lo que falta por recibir o el vuelto; la factura se guarda antes de abrir su ticket. En móvil los paneles se apilan, la tabla permite desplazamiento horizontal y el diálogo tiene desplazamiento vertical. No se agregan opciones decorativas de crédito, cheque o dólares que el sistema no procese.

[Facturación](capturas/caja.png) · [Pago](capturas/cobro.png)
