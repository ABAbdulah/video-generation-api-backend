/**
 * OpenRouter chat-completions client (Milestone 7). One key covers every
 * routed model — Best/Pro, and Starter's fallback path when no Gemini key is
 * configured (see generate.ts).
 */
import type { ChatMessage } from "../llm";
import { NotConfiguredError, ProviderCallError } from "./errors";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export async function callOpenRouter(
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new NotConfiguredError("openrouter API key not configured");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      // OpenRouter attribution headers (optional, used for their dashboard).
      "x-title": "GenVideo",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: 8000,
      // No temperature/top_p: several routed models reject non-default
      // sampling params, and determinism-by-default suits code generation.
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderCallError(
      `openrouter HTTP ${res.status}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new ProviderCallError(`openrouter error: ${data.error.message.slice(0, 300)}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ProviderCallError("openrouter returned an empty completion");
  }
  return content;
}
