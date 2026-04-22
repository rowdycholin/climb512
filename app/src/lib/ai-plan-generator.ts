import type { PlanInput, WeekData } from "./plan-generator";

const MODEL = process.env.ANTHROPIC_MODEL ?? "anthropic/claude-haiku-4-5";
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "4000", 10);

// Base URL: OpenRouter = "https://openrouter.ai/api", direct Anthropic = "https://api.anthropic.com"
// We always hit the OpenAI-compatible /v1/chat/completions endpoint.
const BASE_URL = (process.env.ANTHROPIC_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

function buildPrompt(input: PlanInput): string {
  const equipmentList = input.equipment.length > 0
    ? input.equipment.join(", ")
    : "gym walls and holds only (no extra equipment)";

  const disciplineContext: Record<string, string> = {
    bouldering: "Focus on powerful, short problems. Include limit bouldering, board sessions, and max-recruitment work. No endurance laps.",
    sport: "Include route endurance (4x4s, ARC), power endurance, and redpoint tactics. Mix vertical and overhang sessions.",
    trad: "Emphasise endurance, crack technique, efficiency, and mental composure. Include longer sustained climbing sets.",
    ice: "Focus on tool swings, front-pointing footwork, calf endurance, and upper body power. Include dry-tooling if a board is available.",
    alpine: "Prioritise aerobic base, weighted carry capacity, efficiency at altitude, and multi-pitch endurance.",
  };
  const disciplineNote = disciplineContext[input.discipline] ?? "";

  return `You are an expert climbing coach building a PERSONALISED training plan.

ATHLETE PROFILE:
- Discipline: ${input.discipline}
- Current grade: ${input.currentGrade} | Target grade: ${input.targetGrade}
- Age: ${input.age}
- Plan length: ${input.weeksDuration} week(s), ${input.daysPerWeek} training day(s) per week
- Goals: ${input.goals.join(", ")}
- Available equipment: ${equipmentList}

DISCIPLINE GUIDANCE: ${disciplineNote}

EQUIPMENT RULES — you MUST follow these exactly:
${input.equipment.includes("hangboard") ? "- Hangboard IS available: include hangboard hangs (max hangs, repeaters, open-hand) on strength days." : "- No hangboard: do NOT include hangboard exercises. Use crimp problems on the wall instead."}
${input.equipment.includes("campus board") ? "- Campus board IS available: include campus laddering or moves on power/recruitment days." : "- No campus board: do NOT mention campus board."}
${input.equipment.includes("system wall") || input.equipment.includes("spray wall") ? "- System/spray wall IS available: include coordinate training and targeted movement drills." : ""}
${input.equipment.includes("weights") || input.equipment.includes("gym") ? "- Weights/gym IS available: include weighted pull-ups, antagonist pressing, and loaded carries." : "- No weights: use bodyweight antagonist work (push-ups, dips, shoulder press with resistance band if any)."}
${input.equipment.length === 0 ? "- Gym walls only: every exercise must use the climbing wall or bodyweight. No equipment needed." : ""}

OUTPUT FORMAT — return ONLY valid JSON array, no markdown fences, no explanation:
[
  {
    "weekNum": 1,
    "theme": "Descriptive theme name",
    "days": [
      {
        "dayNum": 1,
        "dayName": "Monday",
        "focus": "Focus area",
        "isRest": false,
        "sessions": [
          {
            "name": "Session name",
            "description": "One sentence description",
            "duration": 45,
            "exercises": [
              { "name": "Exercise name", "sets": "3", "reps": "5", "duration": "10s", "rest": "3 min", "notes": "technique cue" }
            ]
          }
        ]
      }
    ]
  }
]

RULES:
- sets/reps/duration/rest/notes are all optional strings; omit whichever don't apply
- Every week must have exactly 7 days (Monday–Sunday)
- Non-training days: isRest=true, sessions=[] (empty array, no exercises)
- Training days: ONE session only (no separate warm-up/cool-down sections)
- Make the plan genuinely different week-to-week (progressive overload, phase shifts)
- Include 3–5 exercises per session
- "notes" field is REQUIRED for every exercise — write a clear 1–2 sentence coaching cue: what to focus on, how to execute correctly, and what to avoid. Be specific to climbing (e.g. "Keep hips close to wall, drive with feet not arms. Stop if fingers feel tweaky.")
- Include sets, reps, duration, and rest whenever applicable — be specific (e.g. sets:"4", reps:"5", rest:"3 min", duration:"7s on / 3s off")
- The plan must reflect the athlete's discipline, grade, age, goals, and equipment — do not generate a generic plan
- Return ONLY compact minified JSON (no spaces, no newlines) starting with [ and ending with ]`;
}

function repairTruncatedJson(text: string): string | null {
  if (!text.startsWith("[")) return null;
  // Walk characters tracking bracket depth to find last complete top-level object
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteEnd = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 1) lastCompleteEnd = i; // closed a top-level week object
    }
  }

  if (lastCompleteEnd === -1) return null;
  return text.slice(0, lastCompleteEnd + 1) + "]";
}

export async function generatePlanWithAI(input: PlanInput): Promise<WeekData[]> {
  const url = `${BASE_URL}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: "You are a JSON API. Output ONLY a valid JSON array — no explanation, no markdown, no prose, no whitespace between tokens. Your entire response must be parseable by JSON.parse(). Output compact minified JSON only. Start your response with [ and end with ].",
        },
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`AI error: ${data.error.message}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("No text response from AI");
  }

  // Strip markdown fences if the model wrapped the JSON anyway
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // If finish_reason is "length" the response was truncated — attempt repair
  const finishReason = data.choices?.[0]?.finish_reason;
  const mayBeTruncated = finishReason === "length" || finishReason === "max_tokens";

  let plan: WeekData[];
  try {
    plan = JSON.parse(cleaned) as WeekData[];
  } catch {
    if (!mayBeTruncated && cleaned.endsWith("]")) {
      throw new Error(`AI returned invalid JSON. Raw response: ${cleaned.slice(0, 300)}`);
    }
    // Attempt to salvage complete week objects from truncated JSON
    const repaired = repairTruncatedJson(cleaned);
    if (!repaired) {
      throw new Error(`AI returned invalid JSON. Raw response: ${cleaned.slice(0, 300)}`);
    }
    try {
      plan = JSON.parse(repaired) as WeekData[];
    } catch {
      throw new Error(`AI returned invalid JSON. Raw response: ${cleaned.slice(0, 300)}`);
    }
  }

  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("AI returned an empty or malformed plan");
  }

  return plan;
}
