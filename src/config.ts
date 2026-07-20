import { z } from "zod";
import { parseEnv } from "./lib/env";

const envSchema = z.object({
  GITHUB_PAT: z.string().trim().min(1, "GITHUB_PAT is required"),
  CONNECTOR_SECRET: z.string().trim().min(1, "CONNECTOR_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(3000),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseEnv(envSchema, { label: "application environment" });
  return cachedEnv;
}

export function getGithubPat(): string {
  return getEnv().GITHUB_PAT;
}

export function getConnectorSecret(): string {
  return getEnv().CONNECTOR_SECRET;
}

export function getPort(): number {
  return getEnv().PORT;
}
