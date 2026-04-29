function parsePositiveInt(value) {
  const parsed = parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createErrorController(env = process.env) {
  const mode = env.AI_SIMULATOR_ERROR_MODE ?? "none";
  const targetWeek = parsePositiveInt(env.AI_SIMULATOR_ERROR_WEEK);
  const errorOnce = env.AI_SIMULATOR_ERROR_ONCE === "1" || /^true$/i.test(env.AI_SIMULATOR_ERROR_ONCE ?? "");
  const failedKeys = new Set();

  function shouldApply(summary) {
    if (mode === "none") return false;
    if (targetWeek && summary.weekNum !== targetWeek) return false;

    const key = `${summary.user ?? "unknown"}:${summary.weekNum ?? "unknown"}:${mode}`;
    if (errorOnce && failedKeys.has(key)) return false;
    failedKeys.add(key);
    return true;
  }

  return {
    mode,
    targetWeek,
    errorOnce,
    shouldApply,
  };
}

module.exports = {
  createErrorController,
};
