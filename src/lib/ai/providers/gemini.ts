/**
 * Google AI (Gemini) direct client (Milestone 7) — the Starter tier's primary
 * path. Uses the RPC-style generateContent endpoint; the system prompt rides
 * in systemInstruction, the rest of the chat maps to user/model turns.
 */
import type { ChatMessage } from "../llm";
import { NotConfiguredError, ProviderCallError } from "./errors";

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function callGemini(
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new NotConfiguredError("gemini API key not configured");
  }

  const system = messages.filter((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction:
          system.length > 0
            ? { parts: system.map((m) => ({ text: m.content })) }
            : undefined,
        contents: turns.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: 8000,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderCallError(`gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("");
  if (!content) {
    throw new ProviderCallError("gemini returned an empty completion");
  }
  return content;
}
