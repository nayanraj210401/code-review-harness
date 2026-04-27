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

  // Split by semicolons but keep CREATE VIRTUAL TABLE and TRIGGER intact
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const applyStmt = db.transaction(() => {
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch {
        // Ignore "already exists" errors from IF NOT EXISTS
      }
    }
  });

  applyStmt();
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
