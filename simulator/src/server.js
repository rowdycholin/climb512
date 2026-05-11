const http = require("http");
const fs = require("fs");
const { generateWeekFromPrompt } = require("./generate-plan");
const { generateIntakeResponseFromPrompt } = require("./generate-intake");
const { createErrorController } = require("./error-control");

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const LATENCY_MS = parseInt(process.env.AI_SIMULATOR_LATENCY_MS ?? "0", 10);
const ERROR_MODE = process.env.AI_SIMULATOR_ERROR_MODE ?? "none";
const SEED = process.env.AI_SIMULATOR_SEED ?? "demo-seed";
const SCENARIO = process.env.AI_SIMULATOR_SCENARIO ?? "baseline";
const VALID_SCENARIOS = new Set(["baseline", "hangboard_bouldering", "sport_endurance", "deload_preview"]);
const ERROR_CONTROLLER = createErrorController(process.env);
const DEBUG_REQUESTS = [];
const MAX_DEBUG_REQUESTS = 20;

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

function recordDebugRequest({ promptType, request, prompt }) {
  const entry = {
    at: new Date().toISOString(),
    promptType,
    scenario: SCENARIO,
    errorMode: ERROR_MODE,
    method: request.method,
    url: request.url,
    headers: {
      "content-type": request.headers["content-type"],
      "x-ai-simulator-scenario": request.headers["x-ai-simulator-scenario"],
      "x-climb-user": request.headers["x-climb-user"],
      authorization: request.headers.authorization ? "<redacted>" : undefined,
    },
    promptChars: prompt.length,
    promptPreview: prompt.slice(0, 500),
  };

  DEBUG_REQUESTS.push(entry);
  while (DEBUG_REQUESTS.length > MAX_DEBUG_REQUESTS) DEBUG_REQUESTS.shift();
  return entry;
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
  const completionTokens = Math.max(1, Math.ceil(String(content).length / 4));

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
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: completionTokens,
      total_tokens: completionTokens,
    }
  };
}

function detectPromptType(prompt) {
  if (prompt.includes('Should this message be blocked? Answer only "yes" or "no".')) {
    return "guardrail-input-check";
  }
  if (prompt.includes('Should this response be blocked? Answer only "yes" or "no".')) {
    return "guardrail-output-check";
  }
  if (prompt.includes("Return a PlanIntakeAiResponse JSON object")) {
    return "intake";
  }
  if (prompt.includes("Generate exactly ONE next week of the training plan")) {
    return "next-week";
  }
  if (prompt.includes("Generate ONE week of a training plan")) {
    return "single-week";
  }
  return "unsupported";
}

function generateGuardrailCheckResponse(prompt) {
  const checkedText =
    prompt.match(/User message:\s*([\s\S]*?)\n\s*Should this message be blocked\?/i)?.[1] ??
    prompt.match(/Model response:\s*([\s\S]*?)\n\s*Should this response be blocked\?/i)?.[1] ??
    prompt;
  const lowerPrompt = checkedText.toLowerCase();
  const unsafe =
    lowerPrompt.includes("ignore previous instructions") ||
    lowerPrompt.includes("ignore prior instructions") ||
    lowerPrompt.includes("system prompt") ||
    lowerPrompt.includes("developer message") ||
    lowerPrompt.includes("api key") ||
    lowerPrompt.includes("password") ||
    lowerPrompt.includes("secret") ||
    lowerPrompt.includes("credential") ||
    lowerPrompt.includes("jailbreak") ||
    lowerPrompt.includes("malware") ||
    lowerPrompt.includes("phishing") ||
    lowerPrompt.includes("data exfiltration");

  return unsafe ? "yes" : "no";
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

function applyIntakeErrorMode(response, content) {
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

  if (ERROR_MODE === "schema_invalid" || ERROR_MODE === "schema-invalid") {
    sendJson(response, 200, buildChatCompletionResponse(JSON.stringify({
      status: "ready",
      message: "",
      planRequestDraft: {},
    }), "stop"));
    return true;
  }

  if (ERROR_MODE === "timeout") {
    return true;
  }

  return false;
}

function createServer() {
  return http.createServer((request, response) => {
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
        errorWeek: ERROR_CONTROLLER.targetWeek,
        errorOnce: ERROR_CONTROLLER.errorOnce,
        seed: SEED,
        scenario: SCENARIO,
        supportedScenarios: Array.from(VALID_SCENARIOS),
      });
      return;
    }

    if (request.method === "GET" && request.url === "/debug/last-request") {
      sendJson(response, 200, {
        ok: true,
        request: DEBUG_REQUESTS.at(-1) ?? null,
      });
      return;
    }

    if (request.method === "GET" && request.url === "/debug/requests") {
      sendJson(response, 200, {
        ok: true,
        requests: DEBUG_REQUESTS,
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
      const promptType = detectPromptType(prompt);
      recordDebugRequest({ promptType, request, prompt });
      const supportsPlanGenerationPrompt =
        promptType === "single-week" || promptType === "next-week";

      if (promptType === "guardrail-input-check" || promptType === "guardrail-output-check") {
        const content = generateGuardrailCheckResponse(prompt);
        logLine(`[simulator] accepted prompt type=${promptType} scenario=${SCENARIO} mode=${ERROR_MODE}`);
        logLine(`[simulator] generated guardrail check type=${promptType} decision=${content}`);
        sendJson(response, 200, buildChatCompletionResponse(content, "stop"));
        return;
      }

      if (promptType === "intake") {
        const startedAt = Date.now();
        const intake = generateIntakeResponseFromPrompt(prompt);
        const content = JSON.stringify({
          status: intake.status,
          message: intake.message,
          planRequestDraft: intake.planRequestDraft,
        });

        logLine(`[simulator] accepted prompt type=intake scenario=${SCENARIO} mode=${ERROR_MODE}`);

        const respond = () => {
          if (applyIntakeErrorMode(response, content)) {
            logLine(`[simulator] response mode=${ERROR_MODE} type=intake scenario=${SCENARIO} seed=${SEED}`);
            return;
          }

          logLine(
            `[simulator] generated intake status=${intake.status} scenario=${SCENARIO} seed=${SEED} mode=${ERROR_MODE} durationMs=${Date.now() - startedAt}`,
          );
          sendJson(response, 200, buildChatCompletionResponse(content, "stop"));
        };

        if (LATENCY_MS > 0) {
          setTimeout(respond, LATENCY_MS);
          return;
        }

        respond();
        return;
      }

      if (!supportsPlanGenerationPrompt) {
        logLine(`[simulator] rejected prompt type=${promptType} reason=unsupported`);
        sendJson(response, 400, { error: { message: "Simulator currently supports intake and plan generation prompts only" } });
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
        const shouldApplyError = ERROR_CONTROLLER.shouldApply({
          user: username,
          weekNum: summary.weekNum,
        });

        if (shouldApplyError && applyErrorMode(response, content)) {
          logLine(
            `[simulator] response mode=${ERROR_MODE} errorWeek=${ERROR_CONTROLLER.targetWeek ?? "any"} errorOnce=${ERROR_CONTROLLER.errorOnce ? "1" : "0"} type=${promptType} user=${username} week=${summary.weekNum}/${summary.weeksDuration ?? "?"} scenario=${scenario} seed=${SEED}`,
          );
          return;
        }

        logLine(
          `[simulator] generated plan week type=${promptType} user=${username} week=${summary.weekNum}/${summary.weeksDuration ?? "?"} daysPerWeek=${summary.daysPerWeek ?? "?"} discipline=${summary.discipline} grades=${summary.currentGrade}->${summary.targetGrade} scenario=${scenario} seed=${SEED} mode=${ERROR_MODE} errorWeek=${ERROR_CONTROLLER.targetWeek ?? "none"}`,
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
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, "0.0.0.0", () => {
    logLine(`[simulator] listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = {
  createServer,
  detectPromptType,
};
