import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { requireEnv } from "@/lib/env";

let cached: NeonHttpDatabase<typeof schema> | null = null;

/** Lazy so `next build` succeeds without DATABASE_URL in the environment. */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    cached = drizzle(neon(requireEnv("DATABASE_URL")), { schema });
  }
  return cached;
}

export { schema };
