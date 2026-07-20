import dotenv from "dotenv";
import { z } from "zod";

let loaded = false;

function loadEnvFile(): void {
  if (loaded) {
    return;
  }

  dotenv.config();
  loaded = true;
}

type ParseEnvOptions = {
  label?: string;
  source?: Record<string, string | undefined>;
};

export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  options: ParseEnvOptions = {},
): z.infer<T> {
  loadEnvFile();

  const source = options.source ?? process.env;
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const label = options.label ?? "environment variables";
    console.error(`Invalid ${label}:`);
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  return parsed.data;
}
