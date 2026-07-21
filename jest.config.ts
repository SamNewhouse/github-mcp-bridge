import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/tests/unit"],
      globals: {
        "ts-jest": {
          tsconfig: "tsconfig.test.json",
        },
      },
    },
    {
      displayName: "integration",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/tests/integration"],
      globalSetup: "<rootDir>/tests/integration/setup.ts",
      globals: {
        "ts-jest": {
          tsconfig: "tsconfig.test.json",
        },
      },
      testTimeout: 30000,
    },
  ],
};

export default config;
