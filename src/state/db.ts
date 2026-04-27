import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";

let _db: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (_db) return _db;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  applySchema(_db);

  return _db;
}

function applySchema(db: Database.Database): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  // db.exec handles the full DDL in one shot; IF NOT EXISTS guards each statement
  try {
    db.exec(schema);
  } catch (err) {
    // Tolerate "already exists" errors on repeated startups
    if (!String(err).includes("already exists")) throw err;
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
