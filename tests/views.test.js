import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../server.js";
import { loadTemplates, view } from "../public/js/views/template.js";

test("todas las plantillas HTML cargan, incluidas las compactadas en una línea", async (t) => {
  const directory = new URL("../public/views/", import.meta.url);
  const files = (await readdir(directory)).filter((name) =>
    name.endsWith(".html"),
  );
  const sources = new Map(
    await Promise.all(
      files.map(async (name) => [
        `/views/${name}`,
        await readFile(new URL(name, directory), "utf8"),
      ]),
    ),
  );
  t.mock.method(
    globalThis,
    "fetch",
    async (url) =>
      new Response(sources.get(url), {
        status: sources.has(url) ? 200 : 404,
      }),
  );
  await loadTemplates(files.map((name) => name.slice(0, -5)));
  let rendered = 0;
  for (const source of sources.values()) {
    for (const [, id, html] of source.matchAll(
      /<template\s+id="([\w-]+)"\s*>([\s\S]*?)<\/template\s*>/g,
    )) {
      const bindings = Object.fromEntries(
        [...html.matchAll(/\{\{\{(\w+)\}\}\}/g)].map((match) => [
          match[1],
          "dato",
        ]),
      );
      assert.doesNotMatch(view(id, bindings), /\{\{\{/);
      rendered++;
    }
  }
  assert.ok(
    rendered > 100,
    "se verificaron las vistas reales de todos los módulos",
  );
  assert.equal(
    rendered,
    [...sources.values()].reduce(
      (sum, source) => sum + [...source.matchAll(/<template\b/g)].length,
      0,
    ),
    "incluye aperturas y cierres de template divididos en varias líneas",
  );
  assert.match(
    view("dashboard-line-path", { area: "M0,0 Z", line: "M0,0 L1,1" }),
    /dashboard-line/,
  );
  assert.match(view("edit-product-2", { esc: "COD-01" }), /value="COD-01"/);
  assert.throws(() => view("no-existe"), /Vista no disponible/);
  assert.throws(() => view("edit-product-2"), /Falta esc/);
  // Un valor de datos no se interpreta otra vez como sintaxis de plantilla.
  assert.match(
    view("edit-product-2", { esc: "{{{otro}}}" }),
    /\{\{\{otro\}\}\}/,
  );

  const { field, esc, table, tr } =
    await import("../public/js/views/components.js");
  const payload = '\"><img src=x onerror="alert(1)">';
  const form = field("name", "Nombre", payload);
  assert.doesNotMatch(form, /<img/);
  assert.ok(form.includes(esc(payload)));
  const listing = table(["Producto", "Cantidad"], [tr([esc(payload), 2])]);
  assert.doesNotMatch(listing, /<img/);
  assert.match(listing, /class="numeric">\s*2/);
});

test("MVC sirve módulos, HTML, CSS y fuentes locales sin exponer modelos del servidor", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sipro-assets-"));
  const { server } = createApp({ dbPath: join(directory, "test.sqlite") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, type] of [
    ["/js/app.js", "text/javascript"],
    ["/js/controllers/purchases.js", "text/javascript"],
    ["/views/purchases.html", "text/html"],
    ["/styles/glass.css", "text/css"],
    ["/fonts/manrope-variable.ttf", "font/ttf"],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get("content-type").startsWith(type));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  for (const path of [
    "/src/models/store.js",
    "/data/sipro.sqlite",
    "/package.json",
    "/%2e%2e/src/models/store.js",
  ]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const response = await fetch(base);
  assert.match(
    response.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  assert.doesNotMatch(
    response.headers.get("content-security-policy"),
    /unsafe-eval|unsafe-inline/,
  );
});
