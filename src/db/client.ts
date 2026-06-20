import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import * as schema from "./schema";

const DB_URL = "sqlite:tkdos.db";

export type DB = SqliteRemoteDatabase<typeof schema>;

/**
 * Runs SQL on behalf of the drizzle sqlite-proxy. `query` MUST return one row per
 * result row as an object keyed by output column name (this is how tauri-plugin-sql
 * behaves). Note the proxy then takes Object.values() positionally — so duplicate
 * output column names collapse and corrupt the mapping. Joins must alias overlapping
 * columns (see rankCols in repos.ts). The test executor mimics this exactly so the
 * test suite exercises the real failure mode.
 */
export interface SqlExecutor {
  query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params: unknown[]): Promise<void>;
}

export function createDb(exec: SqlExecutor): DB {
  return drizzle(
    async (sqlText, params, method) => {
      if (method === "run") {
        await exec.run(sqlText, params as unknown[]);
        return { rows: [] };
      }
      const rows = await exec.query(sqlText, params as unknown[]);
      const tuples = rows.map((row) => Object.values(row));
      return { rows: method === "get" ? (tuples[0] ?? []) : tuples };
    },
    { schema, casing: "snake_case" },
  );
}

let cached: DB | null = null;
let testDb: DB | null = null;

/** Inject a db for tests (pass null to clear). */
export function __setTestDb(db: DB | null): void {
  testDb = db;
}

export async function getDb(): Promise<DB> {
  if (testDb) return testDb;
  if (cached) return cached;

  // Lazy import keeps the Tauri runtime out of the Node/test import graph.
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const raw = await Database.load(DB_URL);
  cached = createDb({
    query: (sql, params) => raw.select(sql, params as unknown[]),
    run: async (sql, params) => {
      await raw.execute(sql, params as unknown[]);
    },
  });
  return cached;
}

export { schema };
