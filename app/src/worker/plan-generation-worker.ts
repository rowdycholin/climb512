import "dotenv/config";
import { runPlanGenerationWorkerLoop } from "@/lib/plan-generation-worker";

const pollIntervalMs = Number.parseInt(process.env.PLAN_WORKER_POLL_INTERVAL_MS ?? "5000", 10);
const lockTimeoutMs = Number.parseInt(process.env.PLAN_WORKER_LOCK_TIMEOUT_MS ?? "600000", 10);
const stepDelayMs = Number.parseInt(process.env.PLAN_WORKER_STEP_DELAY_MS ?? "1500", 10);
const stopAfterIdle = process.env.PLAN_WORKER_STOP_AFTER_IDLE === "1";

console.log(
  `[plan-worker] starting pollIntervalMs=${Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5000} lockTimeoutMs=${Number.isFinite(lockTimeoutMs) ? lockTimeoutMs : 600000} stepDelayMs=${Number.isFinite(stepDelayMs) ? stepDelayMs : 1500} baseUrl=${process.env.ANTHROPIC_BASE_URL ?? "unset"} intakeMode=${process.env.AI_INTAKE_MODE ?? "unset"}`,
);

runPlanGenerationWorkerLoop({
  pollIntervalMs: Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5000,
  lockTimeoutMs: Number.isFinite(lockTimeoutMs) ? lockTimeoutMs : 600000,
  stepDelayMs: Number.isFinite(stepDelayMs) ? stepDelayMs : 1500,
  stopAfterIdle,
}).catch((error) => {
  console.error("[plan-worker] fatal error", error);
  process.exit(1);
});
