import type { IntakeStep, PartialIntakeDraft } from "./intake";

export interface IntakeQuestion {
  step: IntakeStep;
  prompt: string;
  isComplete: (draft: PartialIntakeDraft) => boolean;
}

export interface IntakeTemplate {
  id: string;
  label: string;
  sportProfileId: string;
  questions: IntakeQuestion[];
  requiredFields: string[];
  optionalFollowUpFields: string[];
  validationHints: string[];
  generationHints: string[];
}

const sharedQuestions: IntakeQuestion[] = [
  {
    step: "sport",
    prompt: "Let's point the plan at the right thing first. Are we training for climbing, running, cycling, or strength and conditioning?",
    isComplete: (draft) => Boolean(draft.sport),
  },
  {
    step: "goal",
    prompt: "Good, let's give the plan a clear goal. Are you training for an event, building general fitness, improving a skill, or working toward a specific target?",
    isComplete: (draft) => Boolean(draft.goalDescription),
  },
  {
    step: "timeline",
    prompt: "Is this tied to a specific event or date, or is it an ongoing training goal?",
    isComplete: (draft) => draft.goalType === "ongoing" || Boolean(draft.targetDate),
  },
  {
    step: "blockLength",
    prompt: "Let's choose a useful runway. How many weeks should this block run?",
    isComplete: (draft) => Boolean(draft.blockLengthWeeks),
  },
  {
    step: "equipment",
    prompt: "Now I can match the work to your setup. What equipment do you have available?",
    isComplete: (draft) => (draft.equipment?.length ?? 0) > 0,
  },
  {
    step: "strength",
    prompt: "Do you want strength and conditioning included, or should this stay focused on the main sport?",
    isComplete: (draft) => draft.strengthTraining?.include !== undefined,
  },
  {
    step: "start",
    prompt: "Let's anchor the first week. When would you like to start?",
    isComplete: (draft) => Boolean(draft.startDate),
  },
  {
    step: "level",
    prompt: "To set the right starting point, what is your current training level?",
    isComplete: (draft) => Boolean(draft.currentLevel),
  },
  {
    step: "schedule",
    prompt: "Good, now let's make it fit real life. How many days per week can you train and still recover well?",
    isComplete: (draft) => Boolean(draft.daysPerWeek),
  },
  {
    step: "injuries",
    prompt: "Before I load this up, I want to keep it safe. Any injuries, pain, or movements I should account for?",
    isComplete: (draft) => Boolean(draft.constraints),
  },
  {
    step: "review",
    prompt: "I have enough to draft the plan. Review the structured details, tweak anything you want, then generate it.",
    isComplete: () => true,
  },
];

const climbingStrengthQuestions: IntakeQuestion[] = sharedQuestions.map((question) => {
  if (question.step === "goal") {
    return {
      ...question,
      prompt: "Climbing it is. What climbing goal should this plan move you toward: a route or boulder, a trip or competition, a grade, a skill, or general climbing fitness?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Do you want strength and conditioning included, or should this stay focused on climbing?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "To pitch the sessions correctly, what is your current climbing level?",
    };
  }

  return question;
});

export const climbingStrengthTemplate: IntakeTemplate = {
  id: "climbing_strength",
  label: "Climbing plus strength",
  sportProfileId: "climbing",
  questions: climbingStrengthQuestions,
  requiredFields: [
    "sport",
    "goalDescription",
    "goalType",
    "blockLengthWeeks",
    "daysPerWeek",
    "startDate",
    "equipment",
    "currentLevel",
    "constraints",
  ],
  optionalFollowUpFields: ["disciplines", "targetDate", "targetLevel", "trainingFocus", "strengthTraining"],
  validationHints: [
    "Use climbing grades for climbing levels when the user provides them.",
    "Ask about injuries, limitations, and exercises to avoid before marking the draft ready.",
  ],
  generationHints: [
    "Balance climbing load and strength training so recovery is realistic.",
    "For big wall or multi-pitch goals, include endurance, long-day preparation, and carrying capacity.",
  ],
};

const runningQuestions: IntakeQuestion[] = sharedQuestions.map((question) => {
  if (question.step === "goal") {
    return {
      ...question,
      prompt: "Running it is. What running goal should this plan build toward: a race or distance, faster times, more weekly mileage, consistency, or general fitness?",
    };
  }

  if (question.step === "timeline") {
    return {
      ...question,
      prompt: "Is there a race date or deadline, or is this an ongoing running block?",
    };
  }

  if (question.step === "equipment") {
    return {
      ...question,
      prompt: "Now I can match the plan to your setup. What running equipment or training tools do you have?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Do you want strength and conditioning included, or should this stay focused on running?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "To set the right load, what is your current running level or weekly mileage?",
    };
  }

  if (question.step === "schedule") {
    return {
      ...question,
      prompt: "Good, now let's make it fit real life. How many days per week can you run or train and still recover well?",
    };
  }

  if (question.step === "injuries") {
    return {
      ...question,
      prompt: "Before I load this up, I want to keep it safe. Any running injuries, pain, or movements I should account for?",
    };
  }

  return question;
});

const cyclingQuestions: IntakeQuestion[] = sharedQuestions.map((question) => {
  if (question.step === "goal") {
    return {
      ...question,
      prompt: "Cycling it is. What cycling goal should this plan support: a ride or race, longer distance, more power, consistency, or general fitness?",
    };
  }

  if (question.step === "timeline") {
    return {
      ...question,
      prompt: "Is there a ride, race date, or deadline, or is this an ongoing cycling block?",
    };
  }

  if (question.step === "equipment") {
    return {
      ...question,
      prompt: "Now I can match the plan to your setup. What bike, trainer, gym, or other tools do you have?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Do you want strength and conditioning included, or should this stay focused on cycling?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "To set the right volume, what is your current cycling level or weekly riding time?",
    };
  }

  if (question.step === "schedule") {
    return {
      ...question,
      prompt: "Good, now let's make it fit real life. How many days per week can you ride or train and still recover well?",
    };
  }

  if (question.step === "injuries") {
    return {
      ...question,
      prompt: "Before I load this up, I want to keep it safe. Any cycling injuries, pain, or movements I should account for?",
    };
  }

  return question;
});

const strengthTrainingQuestions: IntakeQuestion[] = sharedQuestions.map((question) => {
  if (question.step === "goal") {
    return {
      ...question,
      prompt: "Strength and conditioning it is. What goal should this plan build toward: strength, muscle, conditioning, movement quality, testing numbers, or sport support?",
    };
  }

  if (question.step === "timeline") {
    return {
      ...question,
      prompt: "Is there a target date or testing date, or is this an ongoing strength block?",
    };
  }

  if (question.step === "equipment") {
    return {
      ...question,
      prompt: "Now I can match the work to your setup. What strength and conditioning equipment do you have access to?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Should this be a dedicated strength and conditioning plan, or should strength just support another activity?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "To load this appropriately, what is your current strength and conditioning experience?",
    };
  }

  if (question.step === "schedule") {
    return {
      ...question,
      prompt: "Good, now let's make it fit real life. How many days per week can you train and still recover well?",
    };
  }

  if (question.step === "injuries") {
    return {
      ...question,
      prompt: "Before I load this up, I want to keep it safe. Any injuries, pain, or movements I should account for?",
    };
  }

  return question;
});

export const runningTemplate: IntakeTemplate = {
  id: "running",
  label: "Running",
  sportProfileId: "running",
  questions: runningQuestions,
  requiredFields: climbingStrengthTemplate.requiredFields,
  optionalFollowUpFields: climbingStrengthTemplate.optionalFollowUpFields,
  validationHints: [
    "Capture running volume as mileage, time on feet, or current comfortable run duration.",
    "Ask about running injuries and limitations before marking the draft ready.",
  ],
  generationHints: [
    "Progress weekly volume conservatively and include recovery days.",
    "For race goals, build toward the event distance and taper before the target date.",
  ],
};

export const cyclingTemplate: IntakeTemplate = {
  id: "cycling",
  label: "Cycling",
  sportProfileId: "cycling",
  questions: cyclingQuestions,
  requiredFields: climbingStrengthTemplate.requiredFields,
  optionalFollowUpFields: climbingStrengthTemplate.optionalFollowUpFields,
  validationHints: [
    "Capture cycling volume as weekly riding time, distance, or current comfortable ride duration.",
    "Ask about cycling injuries, bike fit issues, and limitations before marking the draft ready.",
  ],
  generationHints: [
    "Progress riding volume conservatively and include recovery days.",
    "For event goals, build toward the ride or race demands and taper before the target date.",
  ],
};

export const strengthTrainingTemplate: IntakeTemplate = {
  id: "strength_training",
  label: "Strength training",
  sportProfileId: "strength_training",
  questions: strengthTrainingQuestions,
  requiredFields: climbingStrengthTemplate.requiredFields,
  optionalFollowUpFields: climbingStrengthTemplate.optionalFollowUpFields,
  validationHints: [
    "Capture training age and current lifting experience in natural language.",
    "Ask about injuries, pain, and movement limitations before marking the draft ready.",
  ],
  generationHints: [
    "Prefer movement-pattern programming when exact maxes are not available.",
    "Balance strength progression with mobility and recovery work.",
  ],
};

export const genericTrainingTemplate: IntakeTemplate = {
  id: "generic_training",
  label: "Generic training",
  sportProfileId: "generic",
  questions: sharedQuestions,
  requiredFields: climbingStrengthTemplate.requiredFields,
  optionalFollowUpFields: climbingStrengthTemplate.optionalFollowUpFields,
  validationHints: [
    "Keep level descriptions natural when the sport does not have a known grade system.",
    "Ask about injuries, limitations, and exercises to avoid before marking the draft ready.",
  ],
  generationHints: [
    "Use general conditioning, strength, mobility, and skill sessions when sport-specific rules are unavailable.",
    "Progress training volume conservatively for ongoing fitness goals.",
  ],
};

export const intakeTemplates = [
  climbingStrengthTemplate,
  runningTemplate,
  cyclingTemplate,
  strengthTrainingTemplate,
  genericTrainingTemplate,
] as const;

export function getIntakeTemplate(templateId?: string) {
  return intakeTemplates.find((template) => template.id === templateId) ?? genericTrainingTemplate;
}

export function selectIntakeTemplate(sport?: string) {
  if (sport && /\bclimb(?:ing)?\b/i.test(sport)) return climbingStrengthTemplate;
  if (sport && /\brun(?:ning)?\b/i.test(sport)) return runningTemplate;
  if (sport && /\b(?:cycl(?:e|ing|ist)|bike|biking|ride)\b/i.test(sport)) return cyclingTemplate;
  if (sport && /\b(?:strength|weight training|weights|lifting|powerlifting|bodybuilding)\b/i.test(sport)) {
    return strengthTrainingTemplate;
  }
  return genericTrainingTemplate;
}
