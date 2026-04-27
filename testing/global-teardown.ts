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
      "DELETE FROM \"User\" WHERE \"userId\" = 'climber1' OR \"userId\" LIKE 'pw-%' OR \"userId\" LIKE 'dashplan-%' OR \"userId\" LIKE 'onboard-%' OR \"userId\" LIKE 'progress-%' OR \"userId\" LIKE 'startdate-%' OR \"userId\" LIKE 'intake-%';",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
}
