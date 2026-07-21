import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      roots: ["<rootDir>/tests/unit"],
      transform: {
        "^.+\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "tsconfig.test.json",
          },
        ],
      },
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      roots: ["<rootDir>/tests/integration"],
      testMatch: ["**/*.integration.ts"],
      globalSetup: "<rootDir>/tests/integration/setup.ts",
      globalTeardown: "<rootDir>/tests/integration/teardown.ts",
      testTimeout: 30000,
      transform: {
        "^.+\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "tsconfig.test.json",
          },
        ],
      },
    },
  ],
};

export default config;
