const assert = require("node:assert/strict");
const test = require("node:test");
const { createErrorController } = require("./error-control");

test("does not apply errors when mode is none", () => {
  const controller = createErrorController({ AI_SIMULATOR_ERROR_MODE: "none" });

  assert.equal(controller.shouldApply({ user: "u1", weekNum: 3 }), false);
});

test("applies errors only to the configured week", () => {
  const controller = createErrorController({
    AI_SIMULATOR_ERROR_MODE: "http_500",
    AI_SIMULATOR_ERROR_WEEK: "3",
  });

  assert.equal(controller.shouldApply({ user: "u1", weekNum: 2 }), false);
  assert.equal(controller.shouldApply({ user: "u1", weekNum: 3 }), true);
});

test("can apply a configured week error only once per user/week/mode", () => {
  const controller = createErrorController({
    AI_SIMULATOR_ERROR_MODE: "invalid_json",
    AI_SIMULATOR_ERROR_WEEK: "3",
    AI_SIMULATOR_ERROR_ONCE: "1",
  });

  assert.equal(controller.shouldApply({ user: "u1", weekNum: 3 }), true);
  assert.equal(controller.shouldApply({ user: "u1", weekNum: 3 }), false);
  assert.equal(controller.shouldApply({ user: "u2", weekNum: 3 }), true);
});
