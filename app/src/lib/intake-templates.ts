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
    prompt: "For what sport or discipline would you like to create a training plan?",
    isComplete: (draft) => Boolean(draft.sport),
  },
  {
    step: "goal",
    prompt: "What is the main goal for this training plan?",
    isComplete: (draft) => Boolean(draft.goalDescription),
  },
  {
    step: "timeline",
    prompt: "Is there a specific date or deadline?",
    isComplete: (draft) => draft.goalType === "ongoing" || Boolean(draft.targetDate),
  },
  {
    step: "blockLength",
    prompt: "How long should this training block be? 4, 8, 12, or 16 weeks is a good starting point.",
    isComplete: (draft) => Boolean(draft.blockLengthWeeks),
  },
  {
    step: "equipment",
    prompt: "What equipment do you have access to?",
    isComplete: (draft) => (draft.equipment?.length ?? 0) > 0,
  },
  {
    step: "strength",
    prompt: "Do you want weight training included?",
    isComplete: (draft) => draft.strengthTraining?.include !== undefined,
  },
  {
    step: "start",
    prompt: "Ok, I can work with that. When would you like to start?",
    isComplete: (draft) => Boolean(draft.startDate),
  },
  {
    step: "level",
    prompt: "What is your current comfortable level?",
    isComplete: (draft) => Boolean(draft.currentLevel),
  },
  {
    step: "schedule",
    prompt: "How many days per week can you realistically train?",
    isComplete: (draft) => Boolean(draft.daysPerWeek),
  },
  {
    step: "injuries",
    prompt: "Do you have any injuries or limitations?",
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
      prompt: "What climbing goal do you want to train for?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Do you want weight training included with the climbing plan?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "What is your current comfortable climbing level?",
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
      prompt: "What running goal do you want to train for?",
    };
  }

  if (question.step === "timeline") {
    return {
      ...question,
      prompt: "Do you have a race date or deadline?",
    };
  }

  if (question.step === "equipment") {
    return {
      ...question,
      prompt: "What running equipment or training tools do you have?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Do you want strength training included with the running plan?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "What is your current weekly running volume?",
    };
  }

  if (question.step === "schedule") {
    return {
      ...question,
      prompt: "How many days per week can you run or train?",
    };
  }

  if (question.step === "injuries") {
    return {
      ...question,
      prompt: "Do you have any running injuries or limitations?",
    };
  }

  return question;
});

const strengthTrainingQuestions: IntakeQuestion[] = sharedQuestions.map((question) => {
  if (question.step === "goal") {
    return {
      ...question,
      prompt: "What strength goal do you want to train for?",
    };
  }

  if (question.step === "timeline") {
    return {
      ...question,
      prompt: "Do you have a target date or testing date?",
    };
  }

  if (question.step === "equipment") {
    return {
      ...question,
      prompt: "What strength training equipment do you have access to?",
    };
  }

  if (question.step === "strength") {
    return {
      ...question,
      prompt: "Should this be a dedicated strength plan?",
    };
  }

  if (question.step === "level") {
    return {
      ...question,
      prompt: "What is your current lifting experience level?",
    };
  }

  if (question.step === "schedule") {
    return {
      ...question,
      prompt: "How many days per week can you lift?",
    };
  }

  if (question.step === "injuries") {
    return {
      ...question,
      prompt: "Do you have any lifting injuries or movement limitations?",
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
  strengthTrainingTemplate,
  genericTrainingTemplate,
] as const;

export function getIntakeTemplate(templateId?: string) {
  return intakeTemplates.find((template) => template.id === templateId) ?? genericTrainingTemplate;
}

export function selectIntakeTemplate(sport?: string) {
  if (sport && /\bclimb(?:ing)?\b/i.test(sport)) return climbingStrengthTemplate;
  if (sport && /\brun(?:ning)?\b/i.test(sport)) return runningTemplate;
  if (sport && /\b(?:strength|weight training|weights|lifting|powerlifting|bodybuilding)\b/i.test(sport)) {
    return strengthTrainingTemplate;
  }
  return genericTrainingTemplate;
}
