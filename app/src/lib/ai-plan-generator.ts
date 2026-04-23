import type { PlanInput, WeekData } from "./plan-generator";

const MODEL = process.env.ANTHROPIC_MODEL ?? "anthropic/claude-haiku-4-5";
// Per-week token budget — one week (7 days, 3–5 exercises/session) fits in ~2500 tokens.
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "4000", 10);

// Base URL: OpenRouter = "https://openrouter.ai/api", direct Anthropic = "https://api.anthropic.com"
// We always hit the OpenAI-compatible /v1/chat/completions endpoint.
const BASE_URL = (process.env.ANTHROPIC_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

function buildWeekPrompt(input: PlanInput, weekNum: number, previousThemes: string[]): string {
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

  const progressionNote = previousThemes.length > 0
    ? `Previous weeks: ${previousThemes.map((t, i) => `Week ${i + 1}: ${t}`).join(", ")}. This week must logically progress from those.`
    : "This is week 1 — start with a foundation/assessment focus.";

  const phaseNote = (() => {
    const progress = weekNum / input.weeksDuration;
    if (weekNum % 4 === 0) return "This is a DELOAD week — reduce intensity and volume by 40%, focus on recovery.";
    if (progress < 0.3) return "FOUNDATION phase — build base fitness and technique. Moderate intensity.";
    if (progress < 0.6) return "STRENGTH phase — increase load and difficulty progressively.";
    if (progress < 0.85) return "POWER phase — high intensity limit climbing and recruitment work.";
    return "PEAK phase — sharpen performance, reduce volume, maximise freshness.";
  })();

  return `You are an expert climbing coach. Generate ONE week of a training plan as a JSON object.

ATHLETE:
- Discipline: ${input.discipline}
- Current grade: ${input.currentGrade} | Target: ${input.targetGrade}
- Age: ${input.age} | Goals: ${input.goals.join(", ")}
- Equipment: ${equipmentList}
- Plan: ${input.weeksDuration} weeks total, ${input.daysPerWeek} training days/week

WEEK ${weekNum} of ${input.weeksDuration}:
- ${phaseNote}
- ${progressionNote}
- DISCIPLINE: ${disciplineNote}

EQUIPMENT RULES:
${input.equipment.includes("hangboard") ? "- Hangboard available: include hangboard hangs on strength days." : "- No hangboard: use wall crimps instead."}
${input.equipment.includes("campus board") ? "- Campus board available: include campus moves on power days." : "- No campus board: do not mention it."}
${input.equipment.includes("weights") || input.equipment.includes("gym") ? "- Weights available: include weighted pull-ups and antagonist work." : "- No weights: use bodyweight only."}

OUTPUT: Return ONLY a single JSON object (not an array) in this exact shape:
{"weekNum":${weekNum},"theme":"<short theme>","days":[{"dayNum":1,"dayName":"Monday","focus":"<focus>","isRest":false,"sessions":[{"name":"<name>","description":"<one sentence>","duration":45,"exercises":[{"name":"<name>","sets":"3","reps":"5","duration":"10s","rest":"3 min","notes":"<coaching cue>"}]}]},{"dayNum":2,"dayName":"Tuesday","focus":"Rest","isRest":true,"sessions":[]},...7 days total]}

RULES:
- Exactly 7 days (Monday–Sunday), dayNum 1–7
- Rest days: isRest=true, sessions=[], focus="Rest"
- Training days: exactly ONE session, 3–4 exercises max
- notes: REQUIRED, max 10 words (e.g. "Keep hips in, drive with feet")
- sets/reps/duration/rest: include only what applies, omit the rest
- All string values must be SHORT — no long descriptions
- Return ONLY compact minified JSON, no markdown, no explanation`;
}

function repairTruncatedJson(text: string): string | null {
  // For a week object (not array), find the last complete closing brace at depth 0
  const isObject = text.trimStart().startsWith("{");
  const isArray = text.trimStart().startsWith("[");
  if (!isObject && !isArray) return null;

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
      if (depth === 0) lastCompleteEnd = i;
    }
  }

  if (lastCompleteEnd === -1) return null;
  return text.slice(0, lastCompleteEnd + 1);
}

async function generateWeek(input: PlanInput, weekNum: number, previousThemes: string[]): Promise<WeekData> {
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
          content: "You are a JSON API. Output ONLY a valid JSON object — no explanation, no markdown, no prose. Your entire response must be parseable by JSON.parse(). Start with { and end with }.",
        },
        {
          role: "user",
          content: buildWeekPrompt(input, weekNum, previousThemes),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API error ${res.status} on week ${weekNum}: ${body.slice(0, 300)}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`AI error on week ${weekNum}: ${data.error.message}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error(`No response from AI for week ${weekNum}`);
  }

  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let week: WeekData;
  try {
    week = JSON.parse(cleaned) as WeekData;
  } catch {
    const repaired = repairTruncatedJson(cleaned);
    if (!repaired) {
      throw new Error(`AI returned unparseable JSON for week ${weekNum}. Raw: ${cleaned.slice(0, 200)}`);
    }
    try {
      week = JSON.parse(repaired) as WeekData;
    } catch {
      throw new Error(`AI returned unparseable JSON for week ${weekNum}. Raw: ${cleaned.slice(0, 200)}`);
    }
  }

  // Ensure weekNum is correct regardless of what the model returned
  week.weekNum = weekNum;

  // Ensure every week has exactly 7 days; fill missing rest days
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (!Array.isArray(week.days)) week.days = [];
  for (let d = 1; d <= 7; d++) {
    if (!week.days.find((day) => day.dayNum === d)) {
      week.days.push({ dayNum: d, dayName: DAY_NAMES[d - 1], focus: "Rest", isRest: true, sessions: [] });
    }
  }
  week.days.sort((a, b) => a.dayNum - b.dayNum);

  return week;
}

export async function generatePlanWithAI(input: PlanInput): Promise<WeekData[]> {
  const weeks: WeekData[] = [];
  const themes: string[] = [];

  for (let w = 1; w <= input.weeksDuration; w++) {
    const week = await generateWeek(input, w, themes);
    weeks.push(week);
    themes.push(week.theme);
  }

  return weeks;
}
