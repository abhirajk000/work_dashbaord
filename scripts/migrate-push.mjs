import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL or POSTGRES_URL is required");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schema = readFileSync(join(root, "sql", "migrate-push.sql"), "utf8");
const sql = neon(url);

const statements = schema
  .trim()
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Web push migration applied (${statements.length} statements).`);
