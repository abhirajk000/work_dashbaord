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
const schema = readFileSync(join(root, "sql", "schema.sql"), "utf8");
const sql = neon(url);

await sql.query(schema.trim());

console.log("Schema applied successfully.");
