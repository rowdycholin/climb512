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

test("does not treat a sport-only answer as current level", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: { disciplines: [], equipment: [], trainingFocus: [] },
    latest: "Running.",
    recent: [{ role: "assistant", content: "Which one would you like to train for?" }],
  }));

  assert.equal(response.status, "needs_more_info");
  assert.equal(response.planRequestDraft.sport, "running");
  assert.equal(response.planRequestDraft.currentLevel, undefined);
  assert.match(response.message, /running goal|race or distance/i);
});

test("asks for clarification when the goal conflicts with the selected sport", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "Climb a big wall route.",
    recent: [{ role: "assistant", content: "Running it is. What running goal should this plan build toward: a race or distance, faster times, more weekly mileage, consistency, or general fitness?" }],
  }));

  assert.equal(response.status, "needs_more_info");
  assert.equal(response.planRequestDraft.sport, "running");
  assert.match(response.message, /sounds like a climbing goal, but we started with running/i);
  assert.match(response.message, /switch the plan to climbing, or keep running as support/i);
});

test("asks one event-detail question at a time for vague race goals", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "Training for a Race",
    recent: [{ role: "assistant", content: "Running it is. What running goal should this plan build toward: a race or distance, faster times, more weekly mileage, consistency, or general fitness?" }],
  }));

  assert.match(response.message, /What race distance or running event/i);
  assert.doesNotMatch(response.message, /and date/i);
});

test("asks only for the date when the race objective is known", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "Run the Boston Marathon",
    recent: [{ role: "assistant", content: "Running it is. What running goal should this plan build toward: a race or distance, faster times, more weekly mileage, consistency, or general fitness?" }],
  }));

  assert.equal(response.message, "When is the race?");
});

test("parses target date from date answers that include distance", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      goalType: "event",
      goalDescription: "Run the Boston Marathon",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "26 miles on 10/01/26",
    recent: [{ role: "assistant", content: "When is the race?" }],
  }));

  assert.equal(response.planRequestDraft.targetDate, "2026-10-01");
  assert.equal(response.planRequestDraft.targetLevel, "26 miles");
  assert.notEqual(response.message, "When is the race?");
});

test("resolves a generic sport-goal clarification by switching sports", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "Switch to climbing.",
    recent: [
      { role: "user", content: "Climb a big wall route." },
      {
        role: "assistant",
        content: "That sounds like a climbing goal, but we started with running. Should I switch the plan to climbing, or keep running as support for that goal?",
      },
    ],
  }));

  assert.equal(response.status, "needs_more_info");
  assert.equal(response.planRequestDraft.sport, "climbing");
  assert.equal(response.planRequestDraft.goalDescription, "Climb a big wall route.");
  assert.equal(/started with running/i.test(response.message), false);
});

test("accepts bare numbers for block length after a block-length question", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      goalType: "ongoing",
      goalDescription: "Build aerobic base",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "12",
    recent: [{ role: "assistant", content: "Let's choose a useful runway. How many weeks should this block run?" }],
  }));

  assert.equal(response.planRequestDraft.blockLengthWeeks, 12);
  assert.notEqual(response.message, "Let's choose a useful runway. How many weeks should this block run?");
});

test("treats years as a long-term horizon instead of a block length", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "running",
      goalType: "ongoing",
      goalDescription: "Build aerobic base",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "4 years",
    recent: [{ role: "assistant", content: "Let's choose a useful runway. How many weeks should this block run?" }],
  }));

  assert.equal(response.planRequestDraft.blockLengthWeeks, undefined);
  assert.match(response.message, /long-term horizon/i);
  assert.match(response.message, /first training block/i);
});

test("does not treat equipment as a strength-training preference", () => {
  const response = generateIntakeResponseFromPrompt(prompt({
    draft: {
      sport: "climbing",
      goalType: "ongoing",
      goalDescription: "Build climbing strength",
      blockLengthWeeks: 8,
      daysPerWeek: 4,
      startDate: "2026-05-08",
      currentLevel: "V5",
      disciplines: [],
      equipment: [],
      trainingFocus: [],
    },
    latest: "Indoor gym, hangboard, and dumbbells.",
    recent: [{ role: "assistant", content: "Now I can match the work to your setup. What equipment do you have available?" }],
  }));

  assert.deepEqual(response.planRequestDraft.equipment, ["Indoor gym", "hangboard", "dumbbells."]);
  assert.equal(response.planRequestDraft.strengthTraining, undefined);
  assert.match(response.message, /injuries|pain|movements/i);
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
