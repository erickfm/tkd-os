import { afterAll, beforeAll, describe, expect, it } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { __setTestDb, createDb } from "./client";
import { getDashboardStats, listStudents } from "./repos";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "src-tauri", "migrations");

let sqlite: BetterSqlite3.Database;

// Coerce JS values to what better-sqlite3 accepts (booleans -> 0/1).
const coerce = (params: unknown[]) =>
  params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));

beforeAll(() => {
  sqlite = new BetterSqlite3(":memory:");
  // Apply the real migrations (same SQL the app runs).
  sqlite.exec(readFileSync(join(migrationsDir, "0001_initial_schema.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0002_belt_colors.sql"), "utf8"));

  const blackId = (sqlite
    .prepare("SELECT id FROM belt_ranks WHERE track='regular' AND degree IS NOT NULL ORDER BY sort_order LIMIT 1")
    .get() as { id: number }).id;
  const colorId = (sqlite
    .prepare("SELECT id FROM belt_ranks WHERE track='regular' AND degree IS NULL ORDER BY sort_order LIMIT 1")
    .get() as { id: number }).id;
  const tigerId = (sqlite
    .prepare("SELECT id FROM belt_ranks WHERE track='tiger' ORDER BY sort_order LIMIT 1")
    .get() as { id: number }).id;

  const ins = sqlite.prepare(
    "INSERT INTO students (first_name,last_name,track,age_group,belt_rank_id,join_date,is_active) VALUES (?,?,?,?,?,?,?)",
  );
  ins.run("Black", "Active1", "regular", "adult", blackId, "2020-01-01", 1);
  ins.run("Black", "Active2", "regular", "adult", blackId, "2020-01-01", 1);
  ins.run("Color", "Active1", "regular", "jr", colorId, "2020-01-01", 1);
  ins.run("Tiger", "Active1", "tiger", "jr", tigerId, "2020-01-01", 1);
  ins.run("Black", "Inactive", "regular", "adult", blackId, "2020-01-01", 0); // must NOT count

  const db = createDb({
    query: async (sql, params) => sqlite.prepare(sql).all(...coerce(params)) as Record<string, unknown>[],
    run: async (sql, params) => {
      sqlite.prepare(sql).run(...coerce(params));
    },
  });
  __setTestDb(db);
});

afterAll(() => {
  __setTestDb(null);
  sqlite.close();
});

describe("black-belt counting + belt field mapping (proxy collapse regression)", () => {
  it("counts only ACTIVE black belts (degree IS NOT NULL)", async () => {
    const stats = await getDashboardStats();
    // 2 active black belts seeded; the inactive one and the color/tiger excluded.
    expect(stats.black).toBe(2);
    expect(stats.activeTotal).toBe(4);
  });

  it("maps belt_ranks fields without positional shift", async () => {
    const rows = await listStudents();
    const black = rows.find((r) => r.lastName === "Active1" && r.firstName === "Black")!;
    const color = rows.find((r) => r.lastName === "Active1" && r.firstName === "Color")!;

    // The original bug made degree read color_hex (never null) for everyone.
    expect(black.rank.degree).not.toBeNull();
    expect(color.rank.degree).toBeNull();

    // Colors/names must be the real values, not shifted neighbors.
    expect(black.rank.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(black.rank.name).toContain("Black");
    expect(color.rank.name).not.toContain("Black");
  });
});
