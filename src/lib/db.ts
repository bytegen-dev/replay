import { neon, neonConfig } from "@neondatabase/serverless";

/**
 * One place that opens the database. In production DATABASE_URL is a Neon connection string and nothing special happens.
 * For local development a plain Postgres on localhost works too, if the Neon HTTP proxy from docker-compose.yml is running
 * (the driver only speaks Neon's HTTP protocol, so it needs that proxy in front of Postgres).
 */
export function connectDb(url: string | undefined = process.env.DATABASE_URL) {
  if (!url) return null;
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    neonConfig.fetchEndpoint = process.env.NEON_PROXY_URL ?? "http://localhost:4444/sql";
    neonConfig.useSecureWebSocket = false;
    neonConfig.poolQueryViaFetch = true;
  }
  return neon(url);
}
