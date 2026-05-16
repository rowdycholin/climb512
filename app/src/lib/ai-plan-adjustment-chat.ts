import {
  adjustmentChatModelResponseSchema,
  buildAdjustmentChatSystemPrompt,
  buildAdjustmentChatUserPrompt,
  type AdjustmentChatContext,
  type AdjustmentChatModelResponse,
  type AdjustmentChatState,
} from "./plan-adjustment-chat";

const MODEL = process.env.ANTHROPIC_ADJUSTMENT_MODEL ?? process.env.ANTHROPIC_MODEL ?? "openai/gpt-5.5";
const MAX_TOKENS = parseInt(
  process.env.ANTHROPIC_ADJUSTMENT_MAX_TOKENS ?? process.env.ANTHROPIC_MAX_TOKENS ?? "12000",
  10,
);
const BASE_URL = (process.env.ANTHROPIC_BASE_URL ?? "https://openrouter.ai/api").replace(/\/$/, "");
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const USE_LOCAL_SIMULATOR = /^https?:\/\/(simulator|localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE_URL);
const PROVIDER_LABEL = (() => {
  try {
    return new URL(BASE_URL).host;
  } catch {
    return "configured-provider";
  }
})();

export class AiAdjustmentJsonError extends Error {
  constructor(message = "The AI returned an incomplete adjustment response. Try a narrower change, or send the request again.") {
    super(message);
    this.name = "AiAdjustmentJsonError";
  }
}

export function shouldUseModelBackedAdjustmentChat() {
  return !USE_LOCAL_SIMULATOR && Boolean(API_KEY);
}

function extractJsonObject(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as unknown;
  } catch (directError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      } catch (slicedError) {
        throw new AiAdjustmentJsonError(
          `The AI returned malformed adjustment JSON (${(slicedError as Error).message}). Try sending a narrower change, such as one day or one week at a time.`,
        );
      }
    }
    throw new AiAdjustmentJsonError(
      `The AI adjustment response was not valid JSON (${(directError as Error).message}). Try sending a narrower change, such as one day or one week at a time.`,
    );
  }
}

function sanitizeProviderText(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|sk-or|sk-proj)-[A-Za-z0-9._-]+/g, "[redacted-key]")
    .slice(0, 500);
}

async function callChatCompletion(messages: Array<{ role: "system" | "user"; content: string }>, surface = "adjustment") {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!res.ok) {
      const body = sanitizeProviderText(await res.text());
      throw new Error(`AI adjustment API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    };

    if (data.error) throw new Error(`AI adjustment error: ${sanitizeProviderText(data.error.message ?? "unknown provider error")}`);

    const content = data.choices?.[0]?.message?.content?.trim();
    const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
    if (!content) throw new Error(`No AI adjustment response content (finish_reason=${finishReason})`);

    console.log(
      `[ai-adjustment] provider success surface=${surface} provider=${PROVIDER_LABEL} model=${MODEL} finishReason=${finishReason} durationMs=${Date.now() - started}`,
    );
    return content;
  } catch (error) {
    console.warn(
      `[ai-adjustment] provider failure surface=${surface} provider=${PROVIDER_LABEL} model=${MODEL} durationMs=${Date.now() - started}: ${sanitizeProviderText((error as Error).message)}`,
    );
    throw error;
  }
}

async function repairAdjustmentJson(rawContent: string): Promise<AdjustmentChatModelResponse> {
  const repairContent = await callChatCompletion([
    {
      role: "system",
      content:
        "You repair malformed JSON for a training-plan adjustment API. Return only one valid JSON object matching the original response shape. Do not add markdown or commentary.",
    },
    {
      role: "user",
      content: `Repair this malformed JSON into one valid AdjustmentChatModelResponse JSON object. Prefer the compact "intent" response shape. Preserve the user's adjustment intent as much as possible. If the response is too incomplete to repair, return a follow_up response asking the user to narrow the requested adjustment.\n\nMALFORMED_JSON:\n${rawContent.slice(0, 24000)}`,
    },
  ], "adjustment-json-repair");

  return adjustmentChatModelResponseSchema.parse(extractJsonObject(repairContent));
}

export async function generateAdjustmentChatResponse(params: {
  context: AdjustmentChatContext;
  state: AdjustmentChatState;
}): Promise<AdjustmentChatModelResponse> {
  if (!shouldUseModelBackedAdjustmentChat()) {
    throw new Error("AI adjustment chat is not configured for the live provider");
  }

  const content = await callChatCompletion([
    {
      role: "system",
      content: buildAdjustmentChatSystemPrompt(),
    },
    {
      role: "user",
      content: buildAdjustmentChatUserPrompt(params),
    },
  ]);

  try {
    return adjustmentChatModelResponseSchema.parse(extractJsonObject(content));
  } catch (error) {
    if (error instanceof AiAdjustmentJsonError) {
      console.warn(`[ai-adjustment] malformed JSON response, attempting repair: ${error.message}`);
      try {
        return await repairAdjustmentJson(content);
      } catch (repairError) {
        console.warn(`[ai-adjustment] JSON repair failed: ${(repairError as Error).message}`);
        throw error;
      }
    }
    throw error;
  }
}
