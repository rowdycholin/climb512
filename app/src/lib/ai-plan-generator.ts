import type { PlanInput, WeekData, DayData, SessionData, ExerciseData } from "./plan-types";

const MODEL = process.env.ANTHROPIC_MODEL ?? "anthropic/claude-haiku-4-5";
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "5000", 10);

// Base URL: OpenRouter = "https://openrouter.ai/api", direct Anthropic = "https://api.anthropic.com"
// We always hit the OpenAI-compatible /v1/chat/completions endpoint.
const BASE_URL = (process.env.ANTHROPIC_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SEND_SIMULATOR_USER_HEADER = /^https?:\/\/(simulator|localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL);

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildWeekPrompt(input: PlanInput, weekNum: number): string {
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

/**
 * Repair a JSON document that was truncated mid-stream. Walks the bracket stack +
 * string state, drops any incomplete trailing key/value, then closes all open
 * structures with matching `}` / `]`. Returns null if the document can't be salvaged.
 */
function repairTruncatedJson(text: string): string | null {
  try { JSON.parse(text); return text; } catch { /* fall through */ }

  const stack: string[] = []; // each entry is '{' or '['
  let inString = false;
  let escape = false;
  let stringStartIdx = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = false; stringStartIdx = -1; }
      continue;
    }
    if (ch === '"') { inString = true; stringStartIdx = i; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      if (stack.length === 0) return null;
      stack.pop();
    }
  }

  // Already balanced — JSON.parse failed for some other reason we can't fix here.
  if (stack.length === 0 && !inString) return null;

  // If we ended inside a string, drop everything from the unclosed quote onward.
  let result = inString ? text.slice(0, stringStartIdx) : text;

  // Iteratively strip trailing junk (whitespace, commas, dangling colons + their keys,
  // partial `true`/`false`/`null` literals) until clean.
  for (;;) {
    const before = result.length;
    result = result.replace(/[\s,]+$/, "");
    if (result.endsWith(":")) {
      result = result.replace(/\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "");
    }
    result = result.replace(/(?<=[\s,:[{])(tr|tru|fa|fal|fals|nu|nul)$/, "");
    if (result.length === before) break;
  }

  while (stack.length > 0) {
    const open = stack.pop()!;
    result += open === "{" ? "}" : "]";
  }

  try { JSON.parse(result); return result; } catch { return null; }
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() ? v : undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function normalizeWeek(raw: unknown, weekNum: number): WeekData {
  const week = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const theme = asString(week.theme) ?? `Week ${weekNum}`;
  const rawDays = Array.isArray(week.days) ? (week.days as unknown[]) : [];

  const daysByNum = new Map<number, DayData>();

  for (const d of rawDays) {
    if (!d || typeof d !== "object") continue;
    const day = d as Record<string, unknown>;
    const dayNumRaw = day.dayNum;
    const dayNum = typeof dayNumRaw === "number" ? dayNumRaw : parseInt(String(dayNumRaw), 10);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) continue;

    const isRest = day.isRest === true;
    const dayName = asString(day.dayName) ?? DAY_NAMES[dayNum - 1];
    const focus = asString(day.focus) ?? (isRest ? "Rest" : "Training");

    const rawSessions = Array.isArray(day.sessions) ? (day.sessions as unknown[]) : [];
    const sessions: SessionData[] = [];
    for (const s of rawSessions) {
      if (!s || typeof s !== "object") continue;
      const sess = s as Record<string, unknown>;
      const name = asString(sess.name);
      if (!name) continue;
      const description = asString(sess.description) ?? "";
      const durRaw = sess.duration;
      const duration = typeof durRaw === "number" ? durRaw
        : typeof durRaw === "string" ? (parseInt(durRaw, 10) || 45)
        : 45;

      const rawExercises = Array.isArray(sess.exercises) ? (sess.exercises as unknown[]) : [];
      const exercises: ExerciseData[] = [];
      for (const e of rawExercises) {
        if (!e || typeof e !== "object") continue;
        const ex = e as Record<string, unknown>;
        const exName = asString(ex.name);
        if (!exName) continue;
        exercises.push({
          name: exName,
          sets: asString(ex.sets),
          reps: asString(ex.reps),
          duration: asString(ex.duration),
          rest: asString(ex.rest),
          notes: asString(ex.notes),
        });
      }

      sessions.push({ name, description, duration, exercises });
    }

    daysByNum.set(dayNum, { dayNum, dayName, focus, isRest, sessions });
  }

  for (let d = 1; d <= 7; d++) {
    if (!daysByNum.has(d)) {
      daysByNum.set(d, { dayNum: d, dayName: DAY_NAMES[d - 1], focus: "Rest", isRest: true, sessions: [] });
    }
  }

  const days = Array.from(daysByNum.values()).sort((a, b) => a.dayNum - b.dayNum);
  return { weekNum, theme, days };
}

interface ApiResult {
  text: string;
  finishReason: string;
}

async function callApi(input: PlanInput, weekNum: number, username?: string): Promise<ApiResult> {
  const url = `${BASE_URL}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      ...(SEND_SIMULATOR_USER_HEADER && username ? { "X-Climb-User": username } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a JSON API. Output ONLY a single valid JSON object — no explanation, no markdown, no prose. Your entire response must be parseable by JSON.parse(). Start with { and end with }. Keep all string values short.",
        },
        {
          role: "user",
          content: buildWeekPrompt(input, weekNum),
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
  const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";

  if (!text) {
    throw new Error(`No response from AI for week ${weekNum} (finish_reason=${finishReason})`);
  }

  return { text, finishReason };
}

async function generateWeek(input: PlanInput, weekNum: number, username?: string): Promise<WeekData> {
  const errors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    let apiResult: ApiResult;
    try {
      apiResult = await callApi(input, weekNum, username);
    } catch (e) {
      errors.push(`attempt ${attempt}: ${(e as Error).message}`);
      continue;
    }

    const cleaned = apiResult.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let raw: unknown = null;
    let parseOk = false;

    try {
      raw = JSON.parse(cleaned);
      parseOk = true;
    } catch {
      const repaired = repairTruncatedJson(cleaned);
      if (repaired) {
        try {
          raw = JSON.parse(repaired);
          parseOk = true;
          console.warn(`[ai-plan] Week ${weekNum} attempt ${attempt}: repaired truncated JSON (finish_reason=${apiResult.finishReason})`);
        } catch {
          /* fall through to retry */
        }
      }
    }

    if (parseOk) {
      return normalizeWeek(raw, weekNum);
    }

    errors.push(`attempt ${attempt}: unparseable (finish_reason=${apiResult.finishReason}). Raw head: ${cleaned.slice(0, 200)}`);
    console.warn(`[ai-plan] Week ${weekNum} attempt ${attempt} failed to parse — retrying. finish_reason=${apiResult.finishReason}`);
  }

  throw new Error(`AI failed to generate week ${weekNum} after 2 attempts. ${errors.join(" | ")}`);
}

export async function generatePlanWithAI(input: PlanInput, username?: string): Promise<WeekData[]> {
  const started = Date.now();
  console.log(`[ai-plan] generating ${input.weeksDuration} weeks in parallel`);

  const weeks = await Promise.all(
    Array.from({ length: input.weeksDuration }, (_, i) => generateWeek(input, i + 1, username)),
  );

  weeks.sort((a, b) => a.weekNum - b.weekNum);
  console.log(`[ai-plan] generated ${weeks.length} weeks in ${Math.round((Date.now() - started) / 1000)}s`);

  return weeks;
}
