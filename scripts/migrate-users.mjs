import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL or POSTGRES_URL is required");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schema = readFileSync(join(root, "sql", "migrate-users.sql"), "utf8");
const sql = postgres(url, { max: 1, prepare: false });

const statements = schema
  .trim()
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

for (const statement of statements) {
  await sql.unsafe(statement);
}

const migrateUsername = process.env.MIGRATE_USERNAME?.trim().toLowerCase();
if (migrateUsername) {
  await sql`
    UPDATE dashboard_state SET id = ${migrateUsername} WHERE id = 'default'
  `;
  await sql`
    UPDATE users SET username = ${migrateUsername} WHERE username = 'default'
  `;
  console.log(`Renamed legacy 'default' user to '${migrateUsername}'.`);
}

await sql.end();
console.log(`Users migration applied successfully (${statements.length} statements).`);
