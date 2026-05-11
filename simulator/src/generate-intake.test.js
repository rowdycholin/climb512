const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FINAL_INTAKE_REVIEW_QUESTION,
  PREFERRED_REST_DAYS_QUESTION,
  PREFERRED_WORKOUT_DAYS_QUESTION,
  READY_MESSAGE,
  generateIntakeResponseFromPrompt,
} = require("./generate-intake");

function prompt({ draft = {}, latest, recent = [], finalReview = false, workoutDays = false, restDays = false }) {
  return `TODAY:
2026-05-08

CURRENT_PLAN_REQUEST_DRAFT_JSON:
${JSON.stringify(draft)}

FINAL_INTAKE_REVIEW_ASKED:
${finalReview ? "yes" : "no"}

PREFERRED_WORKOUT_DAYS_ASKED:
${workoutDays ? "yes" : "no"}

PREFERRED_REST_DAYS_ASKED:
${restDays ? "yes" : "no"}

RECENT_CONVERSATION_JSON:
${JSON.stringify(recent)}

LATEST_USER_MESSAGE:
${latest}

Return a PlanIntakeAiResponse JSON object.`;
}

test("extracts a running 10K goal from an intake prompt", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: { disciplines: [], equipment: [], trainingFocus: [] },
    latest: "I want to run a 10K.",
  }));

  assert.equal(response.status, "needs_more_info");
  assert.equal(response.planRequestDraft.sport, "running");
  assert.equal(response.planRequestDraft.goalDescription, "I want to run a 10K.");
  assert.equal(response.planRequestDraft.goalType, "event");
  assert.equal(response.planRequestDraft.blockLengthWeeks, 4);
});

test("records terse no answers for injury prompts", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      goalType: "event",
      goalDescription: "Run a 10K",
      blockLengthWeeks: 4,
      daysPerWeek: 4,
      startDate: "2026-05-08",
      currentLevel: "intermediate",
      equipment: ["shoes"],
      strengthTraining: { include: false, focusAreas: [] },
    },
    latest: "No",
    recent: [{ role: "assistant", content: "Before I load this up, I want to keep it sane. Do you have any injuries or pain I should account for?" }],
  }));

  assert.deepEqual(response.planRequestDraft.constraints, {
    injuries: [],
    limitations: [],
    avoidExercises: [],
  });
  assert.equal(response.message, PREFERRED_WORKOUT_DAYS_QUESTION);
});

test("moves through preferred days, rest days, and final review", () => {
  const baseDraft = {
    sport: "running",
    goalType: "event",
    goalDescription: "Run a 10K",
    blockLengthWeeks: 4,
    daysPerWeek: 4,
    startDate: "2026-05-08",
    currentLevel: "intermediate",
    equipment: ["shoes"],
    strengthTraining: { include: false, focusAreas: [] },
    constraints: { injuries: [], limitations: [], avoidExercises: [] },
  };

  const workoutResponse = generateIntakeResponseFromPrompt(prompt({
    draft: baseDraft,
    latest: "Monday, Wednesday, Friday, Saturday",
    recent: [{ role: "assistant", content: PREFERRED_WORKOUT_DAYS_QUESTION }],
  }));
  assert.equal(workoutResponse.message, PREFERRED_REST_DAYS_QUESTION);
  assert.equal(workoutResponse.planRequestDraft.preferredWorkoutDaysAsked, true);

  const restResponse = generateIntakeResponseFromPrompt(prompt({
    draft: workoutResponse.planRequestDraft,
    latest: "Sunday",
    recent: [{ role: "assistant", content: PREFERRED_REST_DAYS_QUESTION }],
    workoutDays: true,
  }));
  assert.equal(restResponse.message, FINAL_INTAKE_REVIEW_QUESTION);
  assert.equal(restResponse.planRequestDraft.preferredRestDaysAsked, true);

  const finalResponse = generateIntakeResponseFromPrompt(prompt({
    draft: restResponse.planRequestDraft,
    latest: "No, that covers it.",
    recent: [{ role: "assistant", content: FINAL_INTAKE_REVIEW_QUESTION }],
    workoutDays: true,
    restDays: true,
  }));
  assert.equal(finalResponse.status, "ready");
  assert.equal(finalResponse.message, READY_MESSAGE);
});
