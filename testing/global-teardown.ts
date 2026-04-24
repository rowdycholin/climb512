import type { FullConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

export default async function globalTeardown(_config: FullConfig) {
  const repoRoot = path.resolve(__dirname, "..");

  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "postgresql://climber:climber512@postgres:5432/climbapp",
      "-c",
      "DELETE FROM \"User\" WHERE username = 'climber1';",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
}
