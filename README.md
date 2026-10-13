# SIPRO — Sistema de Gestión de Pedidos a Proveedores

Demostración funcional para un Mini Súper / Licorera, basada en **Proyecto de Sistemas.pdf** y en las pantallas del ZIP original. Incluye siete módulos conectados, datos persistentes y dos roles. Conserva el nombre, los tonos azules, los productos iniciales y el cálculo de precios con IVA incluido de la propuesta de facturación original.

## Ejecutar

Requisito: **Node.js 24 LTS o superior**, disponible en [nodejs.org](https://nodejs.org/). No se necesita instalar un servidor de base de datos ni configurar claves.

Desde la carpeta que contiene `package.json`:

```sh
npm start
```

Abre en tu navegador la dirección local del puerto **3000** (`127.0.0.1:3000`). Mantén la terminal abierta mientras utilizas el sistema. Detén el servidor con `Ctrl+C`.

La aplicación utiliza módulos incluidos en Node.js y funciona sin Internet. `npm ci` instala únicamente las herramientas opcionales de pruebas de navegador. No abras el HTML con doble clic o Live Server: los formularios necesitan el servidor de SIPRO.

| Rol           | Usuario de demostración | Contraseña de demostración |
| ------------- | ----------------------- | -------------------------- |
| Administrador | `admin`                 | `Admin123!`                |
| Dependiente   | `dependiente`           | `Caja123!`                 |

Estas cuentas contienen datos ficticios para la presentación. En **Usuarios** puedes crear cuentas y modificar contraseñas. El formulario de inicio acepta el nombre de usuario.

## Funcionalidades

- **Seguridad:** inicio y cierre de sesión, usuarios, edición de credenciales, estado y roles. Los permisos se verifican en el servidor, las contraseñas se guardan con scrypt y las sesiones usan cookies HttpOnly. Cerrar sesión, cambiar la contraseña o desactivar al usuario invalida el acceso correspondiente.
- **Proveedores:** alta, edición, activación/desactivación, identificación única, contacto, catálogo y condiciones comerciales.
- **Productos:** catálogo, búsqueda por nombre/código, filtros de categoría/estado, IVA configurable, precio, presentación y asociación con varios proveedores y sus precios de compra.
- **Inventario:** existencias iniciales, ajustes con motivo, mínimos y alertas, registro de entradas/salidas y consulta de proveedores asociados.
- **Pedidos:** selección de proveedor/productos, cantidades, revisión antes de guardar, modificación de pedidos pendientes, búsqueda y recepción completa. Recibir un pedido suma sus existencias una sola vez.
- **Facturación:** cliente, productos, descuento porcentual, IVA por producto, efectivo/tarjeta/SINPE, vuelto, consecutivo, historial y filtros. Anular requiere administrador y motivo; restaura las existencias una sola vez. Las facturas conservan los precios originales.
- **Reportes:** pedidos, compras recibidas, productos solicitados, ventas, inventario actual y utilidad bruta estimada. Consulta por fechas, proveedor y estado cuando aplica; impresión/PDF y exportación a Excel para administradores.

**PDF:** el botón de impresión abre el diálogo del navegador; selecciona **Guardar como PDF**. Permite reimprimir comprobantes históricos. **Excel:** se descarga un archivo `.xls` con contenido SpreadsheetML (XML de Excel); no es un CSV renombrado. Excel puede mostrar un aviso de compatibilidad por ser un formato XML antiguo; también se puede abrir en LibreOffice Calc.

## Demostración sugerida

1. Inicia sesión como administrador. El resumen muestra productos con existencia baja.
2. En **Pedidos**, crea uno de **Lácteos y abarrotes Central**, agrega 10 unidades de arroz, revisa y confirma.
3. Abre el pedido y confirma su recepción. En **Inventario**, el arroz pasa de 6 a 16 unidades.
4. En **Facturación**, vende 2 unidades de arroz. Precio total sin descuento: ₡2.700. Introduce ₡3.000 de efectivo: vuelto ₡300. Al emitir, quedan 14 unidades.
5. Guarda o imprime el comprobante. En el historial, anúlalo con la justificación «Devolución de demostración»: quedan nuevamente 16 unidades.
6. En **Reportes**, consulta compras recibidas y exporta a Excel o PDF.
7. Cierra sesión y entra como dependiente: puede vender, preparar pedidos y consultar, pero no administrar usuarios, modificar inventario, recibir pedidos ni anular facturas.
8. Reinicia el servidor: los registros se conservan; será necesario volver a iniciar sesión.

## Datos y configuración

La primera ejecución crea `data/sipro.sqlite` con tres proveedores, seis productos y dos usuarios ficticios. No agrega ventas ni pedidos inventados. Las pruebas usan bases temporales independientes.

- Los datos sobreviven a recargas del navegador y reinicios del servidor. Las sesiones no sobreviven al reinicio.
- SQLite guarda cada operación y sus movimientos en una única transacción. Para mantener sencillo el proyecto académico, se almacena un documento agregado en la tabla `app_state`.
- Para respaldar o transferir los datos, detén el servidor y copia la carpeta `data/` completa.
- Para una nueva demostración vacía de operaciones, detén el servidor y **renombra** `data/` conservándola como respaldo. La siguiente ejecución creará datos iniciales nuevos.
- `PORT`: puerto, por defecto `3000`.
- `HOST`: dirección de escucha, por defecto `127.0.0.1`.
- `SIPRO_DB`: ruta alternativa del archivo SQLite.
- `SIPRO_SECURE_COOKIE=1`: cookies Secure cuando se sirve mediante HTTPS.
- Las fechas del negocio usan `America/Costa_Rica`.

## Verificación

Pruebas de integración, sin instalar dependencias:

```sh
npm test
```

Prueba completa de navegador (opcional):

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Si ya tienes Chromium en Linux:

```sh
SIPRO_CHROMIUM=/usr/bin/chromium npm run test:browser
```

La prueba de navegador usa registros temporales y genera capturas, un PDF y un Excel en `test-results/`, sin modificar los datos de la aplicación. En Linux, Playwright puede requerir bibliotecas del sistema; consulta su instalación oficial si no están presentes.

## Estructura

```text
public/               HTML, estilos y JavaScript de la interfaz
server.js             Servidor HTTP, API, sesiones y exportación Excel
src/domain.js         Validaciones, permisos y operaciones de negocio
src/store.js          SQLite y datos de demostración
tests/               Pruebas de integración y recorrido en navegador
docs/                 Correspondencia con el PDF y referencia original
data/                 Base local generada (no se incluye en Git)
```

Las rutas originales `/Vistas/Login.html`, `/Vistas/Index.html` y `/Vistas/Facturar.html` siguen funcionando a través del servidor. La versión original de facturación se conserva en `docs/Facturar-original.html` como referencia; no se sirve como parte de la aplicación.

## Alcance académico

Consulta [la correspondencia con los requisitos](docs/REQUISITOS.md) para ver las decisiones y límites. Es una demostración funcional local, no un sistema fiscal ni una aplicación preparada para producción: no envía pedidos a proveedores externos, no valida pagos bancarios, no emite comprobantes electrónicos de Hacienda ni calcula contabilidad completa. La utilidad es una estimación basada en el costo de los productos vendidos. Los datos de demostración y sus contraseñas son públicos.
