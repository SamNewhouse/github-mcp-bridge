import dotenv from "dotenv";
import { z } from "zod";

let loaded = false;

function ensureEnvLoaded(): void {
  if (loaded) {
    return;
  }

  dotenv.config();
  loaded = true;
}

export function parseEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  ensureEnvLoaded();

  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  return parsed.data;
}
