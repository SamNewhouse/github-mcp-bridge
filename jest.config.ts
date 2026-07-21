import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      roots: ["<rootDir>/src/tests/unit"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "tsconfig.json",
          },
        ],
      },
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      roots: ["<rootDir>/src/tests/integration"],
      testMatch: ["**/*.integration.ts"],
      globalSetup: "<rootDir>/src/tests/integration/setup.ts",
      testTimeout: 30000,
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: "tsconfig.json",
          },
        ],
      },
    },
  ],
};

export default config;
