import { z } from "zod";
import { parseEnv } from "./lib/env";
import { logWarn } from "./lib/logging";

const envSchema = z.object({
  GITHUB_PAT: z.string().trim().min(1, "GITHUB_PAT is required"),
  CONNECTOR_SECRET: z
    .string()
    .trim()
    .min(
      32,
      "CONNECTOR_SECRET must be at least 32 characters — generate one with: openssl rand -hex 32",
    ),
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

function getOptionalPositiveIntEnv(
  key: string,
  fallback: number,
): number {
  const raw = process.env[key];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    logWarn("invalid_optional_env", {
      key,
      value: raw,
      fallback,
      message: `${key} must be a positive integer; using fallback`,
    });
    return fallback;
  }

  return parsed;
}

export function getGithubPat(): string {
  return getEnv().GITHUB_PAT;
}

export function validateGithubPats(): void {
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith("GITHUB_PAT_") && (!val || val.trim().length === 0)) {
      logWarn("github_pat_empty", {
        key,
        message:
          `${key} is set but empty — requests for this owner will fall back to GITHUB_PAT`,
      });
    }
  }
}

export function getGithubPatForOwner(owner: string): {
  pat: string;
  key: string;
} {
  const key = `GITHUB_PAT_${owner.toUpperCase().replace(/-/g, "_")}`;
  const pat = process.env[key]?.trim();
  if (pat && pat.length > 0) {
    return { pat, key };
  }
  return { pat: getEnv().GITHUB_PAT, key: "GITHUB_PAT" };
}

export function getConnectorSecret(): string {
  return getEnv().CONNECTOR_SECRET;
}

export function getConnectorSecrets(): string[] {
  return getEnv()
    .CONNECTOR_SECRET.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getPort(): number {
  return getEnv().PORT;
}

export function getMcpSessionIdleTtlMs(): number {
  return getOptionalPositiveIntEnv(
    "MCP_SESSION_IDLE_TTL_MS",
    2 * 60 * 60 * 1000,
  );
}

export function getMcpSessionMaxTtlMs(): number {
  return getOptionalPositiveIntEnv(
    "MCP_SESSION_MAX_TTL_MS",
    12 * 60 * 60 * 1000,
  );
}
