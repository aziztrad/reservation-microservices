import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Configuration SQLite
const db = await open({
  filename: "./reservations.db",
  driver: sqlite3.Database,
});

// Création table
await db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    user TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
