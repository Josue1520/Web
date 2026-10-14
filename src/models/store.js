import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(
    new Date(),
  );
export const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(":");
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function seed() {
  const date = today();
  const suppliers = [
    {
      id: 1,
      name: "Distribuidora del Pacífico",
      identification: "3101000001",
      contact: "María Solís",
      phone: "2661-1000",
      email: "pacifico@example.com",
      address: "Puntarenas, Costa Rica",
      terms: "Crédito",
      days: 30,
      delivery: 2,
      minimum: 5000,
    },
    {
      id: 2,
      name: "Lácteos y abarrotes Central",
      identification: "3101000002",
      contact: "Carlos Mora",
      phone: "2661-2000",
      email: "central@example.com",
      address: "Barranca, Puntarenas",
      terms: "Contado",
      days: 0,
      delivery: 1,
      minimum: 0,
    },
    {
      id: 3,
      name: "Comercial La Costa",
      identification: "3101000003",
      contact: "Ana Rojas",
      phone: "2661-3000",
      email: "costa@example.com",
      address: "El Roble, Puntarenas",
      terms: "Crédito",
      days: 15,
      delivery: 3,
      minimum: 0,
    },
  ].map((s) => ({ ...s, idType: "Jurídica", active: true }));
  const products = [
    [
      "74010020",
      "Cerveza Imperial",
      "Bebidas alcohólicas",
      "Lata 350 ml",
      1200,
      800,
      48,
      12,
      1,
    ],
    [
      "74034412",
      "Ron Flor de Caña 4 años",
      "Bebidas alcohólicas",
      "Botella 750 ml",
      8500,
      6000,
      8,
      4,
      1,
    ],
    [
      "74050011",
      "Arroz Tío Pelón",
      "Abarrotes",
      "Bolsa 1 kg",
      1350,
      950,
      6,
      10,
      2,
    ],
    [
      "74050022",
      "Leche Dos Pinos",
      "Lácteos",
      "Caja 1 L",
      1100,
      780,
      12,
      12,
      2,
    ],
    [
      "74050033",
      "Pan molde Bimbo",
      "Panadería",
      "Bolsa 500 g",
      1850,
      1300,
      20,
      5,
      3,
    ],
    [
      "74050044",
      "Café molido",
      "Abarrotes",
      "Bolsa 250 g",
      2200,
      1600,
      0,
      5,
      3,
    ],
  ].map((p, i) => ({
    id: i + 1,
    code: p[0],
    name: p[1],
    category: p[2],
    presentation: p[3],
    price: p[4],
    cost: p[5],
    stock: p[6],
    minimum: p[7],
    active: true,
    description: "",
    tax: 13,
    offers: [
      { supplierId: p[8], cost: p[5], delivery: suppliers[p[8] - 1].delivery },
    ],
  }));
  return {
    started: date,
    suppliers,
    products,
    orders: [],
    invoices: [],
    purchaseInvoices: [],
    users: [
      {
        id: 1,
        identification: "DEMO-001",
        name: "Administración",
        surname: "SIPRO",
        email: "admin@example.com",
        username: "admin",
        password: hashPassword("Admin123!"),
        role: "Administrador",
        active: true,
      },
      {
        id: 2,
        identification: "DEMO-002",
        name: "Personal",
        surname: "de caja",
        email: "dependiente@example.com",
        username: "dependiente",
        password: hashPassword("Caja123!"),
        role: "Dependiente",
        active: true,
      },
    ],
    movements: products.map((p, i) => ({
      id: i + 1,
      productId: p.id,
      product: p.name,
      date,
      delta: p.stock,
      balance: p.stock,
      reason: "Existencia inicial de demostración",
      user: "Sistema",
    })),
  };
}

// Una única transacción SQLite guarda juntos la operación y sus movimientos.
// El documento agregado mantiene sencilla esta demostración; no hay estado de negocio en el navegador.
export function openStore(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);",
  );
  if (!db.prepare("SELECT id FROM app_state WHERE id=1").get())
    db.prepare("INSERT INTO app_state VALUES (1, ?)").run(
      JSON.stringify(seed()),
    );
  const read = () => {
    const state = JSON.parse(
      db.prepare("SELECT data FROM app_state WHERE id=1").get().data,
    );
    // Compatibilidad con bases creadas antes del módulo de facturas de compra.
    state.purchaseInvoices ??= [];
    return state;
  };
  return {
    read,
    change(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const state = read();
        const result = fn(state);
        db.prepare("UPDATE app_state SET data=? WHERE id=1").run(
          JSON.stringify(state),
        );
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}
