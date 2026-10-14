import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/controllers/http-controller.js";

export { createApp };
const root = dirname(fileURLToPath(import.meta.url));

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
