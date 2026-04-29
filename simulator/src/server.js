const http = require("http");
const fs = require("fs");
const { generateWeekFromPrompt } = require("./generate-plan");

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const LATENCY_MS = parseInt(process.env.AI_SIMULATOR_LATENCY_MS ?? "0", 10);
const ERROR_MODE = process.env.AI_SIMULATOR_ERROR_MODE ?? "none";
const SEED = process.env.AI_SIMULATOR_SEED ?? "demo-seed";
const SCENARIO = process.env.AI_SIMULATOR_SCENARIO ?? "baseline";
const VALID_SCENARIOS = new Set(["baseline", "hangboard_bouldering", "sport_endurance", "deload_preview"]);

function logLine(message) {
  const line = `${message}\n`;

  try {
    fs.appendFileSync("/tmp/simulator.log", line, "utf8");
    return;
  } catch {
    // Fall back to normal process stdout if the log file is unavailable.
  }

  try {
    process.stdout.write(line);
  } catch {
    // Last resort: ignore logging failures so the simulator still serves requests.
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(body));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(body);
}

function extractUserPrompt(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const userMessage = [...messages].reverse().find((message) => message && message.role === "user");
  return typeof userMessage?.content === "string" ? userMessage.content : "";
}

function extractPlanSummary(prompt) {
  const planRequestStart = prompt.indexOf("PLAN_REQUEST_JSON:");
  const athleteContextStart = prompt.indexOf("ATHLETE_CONTEXT:");
  if (planRequestStart !== -1 && athleteContextStart !== -1 && athleteContextStart > planRequestStart) {
    try {
      const request = JSON.parse(prompt.slice(planRequestStart + "PLAN_REQUEST_JSON:".length, athleteContextStart).trim());
      const weekMatch = prompt.match(/WEEK\s+(\d+)\s+of\s+(\d+)/i);
      const sport = String(request.sport ?? "unknown");
      return {
        weekNum: weekMatch ? parseInt(weekMatch[1], 10) : 1,
        weeksDuration: request.blockLengthWeeks ?? (weekMatch ? parseInt(weekMatch[2], 10) : null),
        daysPerWeek: request.daysPerWeek ?? null,
        discipline: Array.isArray(request.disciplines) && request.disciplines[0] ? request.disciplines[0] : sport,
        currentGrade: request.currentLevel ?? "unknown",
        targetGrade: request.targetLevel ?? request.targetDate ?? "unknown"
      };
    } catch {
      // Fall back to legacy prompt summary below.
    }
  }

  const weekMatch = prompt.match(/WEEK\s+(\d+)\s+of\s+(\d+)/i);
  const planMatch = prompt.match(/- Plan:\s*(\d+)\s+weeks total,\s*(\d+)\s+training days\/week/i);
  const disciplineMatch = prompt.match(/- Discipline:\s*([^\n]+)/i);
  const gradeMatch = prompt.match(/- Current grade:\s*([^|]+)\|\s*Target:\s*([^\n]+)/i);

  return {
    weekNum: weekMatch ? parseInt(weekMatch[1], 10) : 1,
    weeksDuration: planMatch ? parseInt(planMatch[1], 10) : (weekMatch ? parseInt(weekMatch[2], 10) : null),
    daysPerWeek: planMatch ? parseInt(planMatch[2], 10) : null,
    discipline: disciplineMatch ? disciplineMatch[1].trim() : "unknown",
    currentGrade: gradeMatch ? gradeMatch[1].trim() : "unknown",
    targetGrade: gradeMatch ? gradeMatch[2].trim() : "unknown"
  };
}

function getScenario(request) {
  const headerValue = request.headers["x-ai-simulator-scenario"];
  if (typeof headerValue === "string" && VALID_SCENARIOS.has(headerValue)) {
    return headerValue;
  }

  return SCENARIO;
}

function buildChatCompletionResponse(content, finishReason = "stop") {
  return {
    id: "chatcmpl-simulated",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "climb512-simulator",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content
        },
        finish_reason: finishReason
      }
    ]
  };
}

function applyErrorMode(response, content) {
  if (ERROR_MODE === "http_500") {
    sendJson(response, 500, { error: { message: "Simulated AI failure" } });
    return true;
  }

  if (ERROR_MODE === "invalid_json") {
    sendJson(response, 200, buildChatCompletionResponse("{invalid json", "stop"));
    return true;
  }

  if (ERROR_MODE === "truncated_json") {
    const truncated = content.slice(0, Math.max(1, Math.floor(content.length * 0.7)));
    sendJson(response, 200, buildChatCompletionResponse(truncated, "length"));
    return true;
  }

  if (ERROR_MODE === "timeout") {
    return true;
  }

  return false;
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/config") {
    sendJson(response, 200, {
      ok: true,
      port: PORT,
      latencyMs: LATENCY_MS,
      errorMode: ERROR_MODE,
      seed: SEED,
      scenario: SCENARIO,
      supportedScenarios: Array.from(VALID_SCENARIOS),
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    sendText(response, 404, "Not found");
    return;
  }

  logLine("[simulator] received POST /v1/chat/completions");

  let rawBody = "";
  request.on("data", (chunk) => {
    rawBody += chunk.toString("utf8");
  });

  request.on("end", () => {
    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      sendJson(response, 400, { error: { message: "Invalid JSON body" } });
      return;
    }

    const prompt = extractUserPrompt(payload);
    const promptType = prompt.includes("Generate exactly ONE next week of the training plan")
      ? "next-week"
      : prompt.includes("Generate ONE week of a training plan")
        ? "single-week"
        : "unsupported";
    const supportsPlanGenerationPrompt =
      prompt.includes("Generate ONE week of a training plan") ||
      prompt.includes("Generate exactly ONE next week of the training plan");

    if (!supportsPlanGenerationPrompt) {
      logLine(`[simulator] rejected unsupported prompt type=${promptType}`);
      sendJson(response, 400, { error: { message: "Simulator currently supports plan generation prompts only" } });
      return;
    }

    const scenario = getScenario(request);
    const week = generateWeekFromPrompt(prompt, {
      seed: SEED,
      scenario,
    });
    const content = JSON.stringify(week);
    const username = request.headers["x-climb-user"] || "unknown-user";
    const summary = extractPlanSummary(prompt);

    logLine(
      `[simulator] accepted prompt type=${promptType} user=${username} week=${summary.weekNum}/${summary.weeksDuration ?? "?"} scenario=${scenario} mode=${ERROR_MODE}`,
    );

    const respond = () => {
      if (applyErrorMode(response, content)) {
        logLine(
          `[simulator] response mode=${ERROR_MODE} type=${promptType} user=${username} week=${summary.weekNum}/${summary.weeksDuration ?? "?"} scenario=${scenario} seed=${SEED}`,
        );
        return;
      }

      logLine(
        `[simulator] generated plan week type=${promptType} user=${username} week=${summary.weekNum}/${summary.weeksDuration ?? "?"} daysPerWeek=${summary.daysPerWeek ?? "?"} discipline=${summary.discipline} grades=${summary.currentGrade}->${summary.targetGrade} scenario=${scenario} seed=${SEED} mode=${ERROR_MODE}`,
      );

      sendJson(response, 200, buildChatCompletionResponse(content, "stop"));
    };

    if (LATENCY_MS > 0) {
      setTimeout(respond, LATENCY_MS);
      return;
    }

    respond();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  logLine(`[simulator] listening on http://0.0.0.0:${PORT}`);
});
