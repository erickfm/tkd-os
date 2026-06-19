import Database from "@tauri-apps/plugin-sql";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";

const DB_URL = "sqlite:tkdos.db";

let raw: Database | null = null;
let cached: SqliteRemoteDatabase<typeof schema> | null = null;

async function getRaw(): Promise<Database> {
  if (!raw) raw = await Database.load(DB_URL);
  return raw;
}

export async function getDb(): Promise<SqliteRemoteDatabase<typeof schema>> {
  if (cached) return cached;

  const db = await getRaw();

  cached = drizzle(
    async (sqlText, params, method) => {
      if (method === "run") {
        await db.execute(sqlText, params as unknown[]);
        return { rows: [] };
      }

      const rows = await db.select<Record<string, unknown>[]>(
        sqlText,
        params as unknown[]
      );
      const tuples = rows.map((row) => Object.values(row));

      if (method === "get") {
        return { rows: tuples[0] ?? [] };
      }
      return { rows: tuples };
    },
    { schema, casing: "snake_case" }
  );

  return cached;
}

export { schema };
