import { z } from "zod";
import { parseEnv } from "./lib/env";

const envSchema = z.object({
  GITHUB_PAT: z.string().min(1, "GITHUB_PAT is required"),
  CONNECTOR_SECRET: z.string().min(1, "CONNECTOR_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(3000)
});

export const env = parseEnv(envSchema, { label: "app config" });
