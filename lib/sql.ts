import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

let pool: Sql | null = null;

function useSsl(url: string): boolean | "require" {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=require/i.test(url)) return "require";
  // Remote VPS without explicit sslmode — no SSL (typical self-hosted Postgres)
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return false;
}

export function getSql(): Sql {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  if (!pool) {
    pool = postgres(url, {
      ssl: useSsl(url),
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return pool;
}
