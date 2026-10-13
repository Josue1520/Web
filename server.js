import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { openStore, verifyPassword } from "./src/store.js";
import {
  AppError,
  ensure,
  admin,
  find,
  snapshot,
  saveEntity,
  adjustStock,
  saveOrder,
  receiveOrder,
  createInvoice,
  voidInvoice,
  report,
} from "./src/domain.js";

const root = dirname(fileURLToPath(import.meta.url));
const digest = (token) => createHash("sha256").update(token).digest("hex");
const escape = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function createApp({
  dbPath = resolve(root, "data/sipro.sqlite"),
  secureCookie = false,
} = {}) {
  const store = openStore(dbPath),
    sessions = new Map(),
    attempts = new Map();
  const cookie = (value) =>
    `sipro_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 28800 : 0}${secureCookie ? "; Secure" : ""}`;
  function session(req) {
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)sipro_session=([^;]+)/,
    )?.[1];
    const key = token ? digest(token) : "",
      s = sessions.get(key);
    if (!s || s.expires < Date.now()) {
      sessions.delete(key);
      return null;
    }
    const user = store
      .read()
      .users.find(
        (u) => u.id === s.id && u.active && u.password === s.password,
      );
    if (!user) {
      sessions.delete(key);
      return null;
    }
    return { user, key };
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(
        type.startsWith("application/json") ? JSON.stringify(body) : body,
      );
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname,
        method = req.method;
      if (path.startsWith("/api/")) {
        res.setHeader("Cache-Control", "no-store");
        if (!["GET", "POST", "PUT"].includes(method))
          throw new AppError("Método no permitido.", 405);
        if (method !== "GET") {
          ensure(
            req.headers["x-sipro-request"] === "1",
            "Solicitud no válida.",
            403,
          );
          if (req.headers.origin)
            ensure(
              new URL(req.headers.origin).host === req.headers.host,
              "Origen no permitido.",
              403,
            );
          ensure(
            req.headers["content-type"]?.startsWith("application/json"),
            "Se requiere JSON.",
            415,
          );
        }
        let body = {};
        if (method !== "GET") {
          let raw = "",
            length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            ensure(length <= 100000, "Solicitud demasiado grande.", 413);
            raw += chunk;
          }
          try {
            body = JSON.parse(raw);
          } catch {
            throw new AppError("JSON inválido.");
          }
          ensure(
            body && typeof body === "object" && !Array.isArray(body),
            "Solicitud inválida.",
          );
        }
        if (path === "/api/login" && method === "POST") {
          ensure(
            typeof body.username === "string" &&
              typeof body.password === "string" &&
              body.username.length <= 500 &&
              body.password.length <= 500,
            "Usuario o contraseña inválidos.",
            401,
          );
          const key = req.socket.remoteAddress;
          const previous = attempts.get(key);
          const attempt =
            previous && previous.until > Date.now()
              ? previous
              : { count: 0, until: Date.now() + 60000 };
          ensure(
            attempt.count < 15,
            "Demasiados intentos. Espera un minuto.",
            429,
          );
          const user = store
            .read()
            .users.find(
              (u) =>
                u.username.toLowerCase() ===
                  body.username.trim().toLowerCase() && u.active,
            );
          if (!user || !verifyPassword(body.password, user.password)) {
            attempt.count++;
            attempts.set(key, attempt);
            throw new AppError("Usuario o contraseña incorrectos.", 401);
          }
          attempts.delete(key);
          for (const [k, s] of sessions)
            if (s.expires < Date.now()) sessions.delete(k);
          const previousSession = session(req);
          if (previousSession) sessions.delete(previousSession.key);
          const token = randomBytes(32).toString("hex");
          sessions.set(digest(token), {
            id: user.id,
            password: user.password,
            expires: Date.now() + 28800000,
          });
          res.setHeader("Set-Cookie", cookie(token));
          return send(200, { ok: true });
        }
        const current = session(req);
        ensure(current, "Inicia sesión para continuar.", 401);
        const user = current.user;
        if (path === "/api/logout" && method === "POST") {
          sessions.delete(current.key);
          res.setHeader("Set-Cookie", cookie(""));
          return send(200, { ok: true });
        }
        if (path === "/api/state" && method === "GET")
          return send(200, snapshot(store.read(), user));
        if (path === "/api/reports" && method === "GET") {
          const result = report(store.read(), user, url.searchParams);
          if (url.searchParams.get("format") === "xls") {
            admin(user);
            const cell = (v) =>
              `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${escape(v)}</Data></Cell>`;
            const rows = [
              [result.title],
              [`Período: ${result.from} a ${result.to}`],
              result.columns,
              ...result.rows,
            ]
              .map((row) => `<Row>${row.map(cell).join("")}</Row>`)
              .join("");
            res.setHeader(
              "Content-Disposition",
              `attachment; filename="SIPRO-${result.type}.xls"`,
            );
            return send(
              200,
              `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Reporte"><Table>${rows}</Table></Worksheet></Workbook>`,
              "application/vnd.ms-excel; charset=utf-8",
            );
          }
          return send(200, result);
        }
        let match;
        const result = store.change((s) => {
          if (
            (match = path.match(
              /^\/api\/(suppliers|products|users)(?:\/(\d+))?$/,
            )) &&
            ((method === "POST" && !match[2]) || (method === "PUT" && match[2]))
          )
            return saveEntity(s, user, match[1], match[2], body);
          if (path === "/api/stock" && method === "POST")
            return adjustStock(s, user, body);
          if (
            (match = path.match(/^\/api\/orders(?:\/(\d+))?$/)) &&
            ((method === "POST" && !match[1]) || (method === "PUT" && match[1]))
          )
            return saveOrder(s, user, match[1], body);
          if (
            (match = path.match(/^\/api\/orders\/(\d+)\/receive$/)) &&
            method === "POST"
          )
            return receiveOrder(s, user, match[1]);
          if (path === "/api/invoices" && method === "POST")
            return createInvoice(s, user, body);
          if (
            (match = path.match(/^\/api\/invoices\/(\d+)\/void$/)) &&
            method === "POST"
          )
            return voidInvoice(s, user, match[1], body);
          throw new AppError("Ruta no encontrada.", 404);
        });
        return send(method === "POST" ? 201 : 200, result);
      }
      ensure(
        method === "GET" || method === "HEAD",
        "Método no permitido.",
        405,
      );
      const routes = {
        "/": "index.html",
        "/Vistas/Index.html": "index.html",
        "/Vistas/Login.html": "index.html",
        "/Vistas/Facturar.html": "index.html",
        "/index.html": "index.html",
        "/app.js": "app.js",
        "/styles/index.css": "styles/index.css",
        "/favicon.svg": "favicon.svg",
      };
      const file = routes[path];
      ensure(file, "Página no encontrada.", 404);
      const content = await readFile(resolve(root, "public", file));
      const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".svg": "image/svg+xml",
      };
      res.setHeader("Cache-Control", "no-cache");
      res.writeHead(200, {
        "Content-Type": `${types[extname(file)]}; charset=utf-8`,
      });
      res.end(method === "HEAD" ? undefined : content);
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      send(error.status ?? 500, {
        error: error.status
          ? error.message
          : "No se pudo completar la operación.",
      });
    }
  });
  server.on("close", () => store.close());
  return { server, store };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server } = createApp({
    dbPath: process.env.SIPRO_DB || resolve(root, "data/sipro.sqlite"),
    secureCookie: process.env.SIPRO_SECURE_COOKIE === "1",
  });
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `SIPRO iniciado en puerto ${server.address().port}. Datos guardados en SQLite.`,
      ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
