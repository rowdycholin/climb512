import { execFileSync } from "node:child_process";
import path from "node:path";

const TEST_USER_CLEANUP_SQL = `
  DELETE FROM "User"
  WHERE
    "email" LIKE '%@example.test'
    OR ("firstName" = 'Playwright' AND "lastName" = 'User')
    OR "userId" = 'climber1'
    OR "userId" LIKE 'pw-%'
    OR "userId" LIKE 'dashplan-%'
    OR "userId" LIKE 'loginplan-%'
    OR "userId" LIKE 'adjust-%'
    OR "userId" LIKE 'version-revert-%'
    OR "userId" LIKE 'onboard-%'
    OR "userId" LIKE 'progress-%'
    OR "userId" LIKE 'startdate-%'
    OR "userId" LIKE 'intake-%'
    OR "userId" LIKE 'running-intake-%'
    OR "userId" LIKE 'strength-intake-%'
    OR "userId" LIKE 'generic-intake-%';
`;

export function runDatabaseSql(sql: string) {
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
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
}

export function cleanupPlaywrightUsers() {
  runDatabaseSql(TEST_USER_CLEANUP_SQL);
}
