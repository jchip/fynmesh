/**
 * Prime the FynOps seed database.
 *
 * Runs the same generator and schema the browser worker uses, into a real
 * SQLite file through Node's built-in node:sqlite, then writes:
 *
 *   <out>/fynops-seed.<hash>.sqlite.gz   the database, gzipped
 *   <out>/fynops-seed.json               names that file, plus its versions
 *
 * The worker looks for fynops-seed.json next to itself, so <out> is normally
 * the fynops-data dist directory in the built site. The hash in the name keeps
 * a CDN or browser from serving a stale copy after a re-prime.
 *
 * Usage: node scripts/prime-db.mts [--out dir] [--seed n] [--scale small|medium|large]
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { SCALES, type Scale } from "../src/generator.ts";
import { DEFAULT_SCALE, DEFAULT_SEED, SCHEMA_VERSION, SEED_VERSION, TABLES, seedDatabase } from "../src/schema.ts";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: path.join(import.meta.dirname, "../dist") },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    scale: { type: "string", default: DEFAULT_SCALE },
  },
});

const scale = values.scale as Scale;
if (!(scale in SCALES)) throw new Error(`--scale must be one of ${Object.keys(SCALES).join(", ")}`);
const seed = Number(values.seed);
const outDir = path.resolve(values.out!);
mkdirSync(outDir, { recursive: true });

const tmpFile = path.join(outDir, ".fynops-seed.tmp.sqlite");
rmSync(tmpFile, { force: true });

const started = performance.now();
const db = new DatabaseSync(tmpFile);
seedDatabase(
  {
    exec: (sql) => db.exec(sql),
    insertRows: (_table, sql, rows) => {
      const stmt = db.prepare(sql);
      for (const row of rows) stmt.run(...(row as Array<string | number | null>));
    },
  },
  { seed, scale },
);
const counts = Object.fromEntries(
  TABLES.map((t) => [t.name, (db.prepare(`SELECT count(*) AS n FROM ${t.name}`).get() as { n: number }).n]),
);
db.exec("VACUUM");
db.close();

const raw = readFileSync(tmpFile);
rmSync(tmpFile);
const gz = gzipSync(raw, { level: 9 });
const hash = createHash("sha256").update(gz).digest("hex").slice(0, 12);
const file = `fynops-seed.${hash}.sqlite.gz`;

for (const old of readdirSync(outDir)) {
  if (/^fynops-seed\.[0-9a-f]+\.sqlite\.gz$/.test(old)) rmSync(path.join(outDir, old));
}
writeFileSync(path.join(outDir, file), gz);
writeFileSync(
  path.join(outDir, "fynops-seed.json"),
  JSON.stringify(
    { file, schemaVersion: SCHEMA_VERSION, seedVersion: SEED_VERSION, seed, scale, bytes: raw.length, gzBytes: gz.length, counts },
    null,
    2,
  ) + "\n",
);

console.log(
  `[prime-db] ${scale} seed ${seed}: ${counts.shipments} shipments, ` +
    `${(raw.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1e6).toFixed(1)} MB gz, ` +
    `${Math.round(performance.now() - started)} ms -> ${path.join(outDir, file)}`,
);
