const assert = require("node:assert/strict");
const test = require("node:test");
const { generateWeekFromPrompt } = require("./generate-plan");

function promptFor(request, weekNum = 1) {
  return `You are an expert training coach. Generate ONE week of a training plan as a JSON object.

PLAN_REQUEST_JSON:
${JSON.stringify(request)}

ATHLETE_CONTEXT:
- Age: 35
- Sport: ${request.sport}
- Plan: ${request.blockLengthWeeks} weeks total, ${request.daysPerWeek} training days/week

WEEK ${weekNum} of ${request.blockLengthWeeks}:`;
}

function nextWeekPromptFor(request, weekNum = 2) {
  return `You are an experienced ${request.sport} training coach. Generate exactly ONE next week of the training plan as JSON.

PLAN_REQUEST_JSON:
${JSON.stringify(request)}

ATHLETE_CONTEXT:
- Age: 35
- Sport: ${request.sport}
- Plan: ${request.blockLengthWeeks} weeks total, ${request.daysPerWeek} training days/week

WEEK_TO_GENERATE:
- Week ${weekNum} of ${request.blockLengthWeeks}

PREVIOUS_WEEK_SUMMARIES_JSON:
[{"weekNum":1,"theme":"Ongoing Foundation","trainingDays":3,"restDays":4,"totalSessions":3,"totalExercises":9}]
`;
}

function baseRequest(overrides = {}) {
  return {
    sport: "climbing",
    disciplines: ["bouldering"],
    goalType: "ongoing",
    goalDescription: "Build general fitness",
    blockLengthWeeks: 8,
    daysPerWeek: 3,
    currentLevel: "V4",
    startDate: "2026-05-01",
    equipment: ["hangboard", "weights"],
    trainingFocus: [],
    constraints: { injuries: [], limitations: [], avoidExercises: [] },
    strengthTraining: { include: false, focusAreas: [] },
    ...overrides,
  };
}

function exerciseNames(week) {
  return week.days.flatMap((day) =>
    day.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name)),
  );
}

test("event and ongoing goals use different phase themes", () => {
  const ongoing = generateWeekFromPrompt(promptFor(baseRequest({ goalType: "ongoing" }), 7), { seed: "phase" });
  const event = generateWeekFromPrompt(
    promptFor(baseRequest({ goalType: "event", targetDate: "2026-10-15" }), 7),
    { seed: "phase" },
  );

  assert.match(ongoing.theme, /Ongoing/);
  assert.match(event.theme, /Event/);
  assert.notEqual(ongoing.theme, event.theme);
});

test("worker next-week prompts generate the requested week", () => {
  const week = generateWeekFromPrompt(nextWeekPromptFor(baseRequest(), 2), { seed: "worker" });

  assert.equal(week.weekNum, 2);
  assert.equal(week.days.length, 7);
});

test("running requests generate running-specific sessions", () => {
  const week = generateWeekFromPrompt(
    promptFor(baseRequest({
      sport: "running",
      disciplines: [],
      goalDescription: "Build endurance",
      currentLevel: "6 miles per week",
      equipment: ["road shoes"],
    })),
  );

  assert(exerciseNames(week).some((name) => /run|jog|stride|tempo/i.test(name)));
});

test("strength requests generate strength-specific sessions", () => {
  const week = generateWeekFromPrompt(
    promptFor(baseRequest({
      sport: "weight training",
      disciplines: [],
      goalType: "strength",
      goalDescription: "Build full-body strength",
      currentLevel: "novice",
      equipment: ["dumbbells", "barbell"],
    })),
  );

  assert(exerciseNames(week).some((name) => /squat|press|row|hinge/i.test(name)));
});

test("strength-training support adds accessory work to non-strength plans", () => {
  const week = generateWeekFromPrompt(
    promptFor(baseRequest({
      sport: "climbing",
      disciplines: ["trad"],
      strengthTraining: { include: true, focusAreas: ["core"] },
    })),
  );

  assert(exerciseNames(week).some((name) => /strength|core/i.test(name)));
});

test("injury constraints replace avoided exercises", () => {
  const week = generateWeekFromPrompt(
    promptFor(baseRequest({
      sport: "climbing",
      disciplines: ["bouldering"],
      constraints: {
        injuries: ["previous pulley injury"],
        limitations: [],
        avoidExercises: ["max hangs"],
      },
    })),
  );
  const names = exerciseNames(week);

  assert(!names.some((name) => /hangboard|crimp/i.test(name)));
  assert(names.some((name) => /open-hand|mobility|technique/i.test(name)));
});
