import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isNative } from "../../platform/native";
import type { SecretName } from "../../platform/services";
import type { AskProvider } from "../../settings/store";
import { showcase, showcaseAnswer } from "../../dev/showcase-data";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageBase64?: string;
}

export const providerInfo: Record<AskProvider, { label: string; secret: SecretName }> = {
  gemini: { label: "Gemini Flash", secret: "ai.gemini" },
  "gemini-pro": { label: "Gemini Pro", secret: "ai.gemini" },
  openai: { label: "OpenAI", secret: "ai.openai" },
  anthropic: { label: "Claude", secret: "ai.anthropic" },
};

export const apiKeySources: { secret: SecretName; label: string; url: string; linkLabel: string }[] = [
  { secret: "ai.gemini", label: "Gemini API Key", url: "https://aistudio.google.com/apikey", linkLabel: "Kostenlosen Schlüssel holen" },
  { secret: "ai.openai", label: "OpenAI API Key", url: "https://platform.openai.com/api-keys", linkLabel: "Schlüssel holen" },
  { secret: "ai.anthropic", label: "Anthropic API Key", url: "https://console.anthropic.com/settings/keys", linkLabel: "Schlüssel holen" },
];

/**
 * Streams a reply. In the app via Rust (`ai_chat`, src-tauri/src/ai.rs), so the key
 * stays in Credential Manager. In the browser a local demo.
 * Error code "no-key" = no key stored for this provider.
 */
export async function streamChat(
  provider: AskProvider,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!isNative) return demoStream(messages, onDelta, signal);

  const id = crypto.randomUUID();
  const off = await listen<{ id: string; text: string }>("ai://delta", (e) => {
    if (e.payload.id === id && !signal.aborted) onDelta(e.payload.text);
  });
  const onAbort = () => void invoke("ai_cancel", { id });
  signal.addEventListener("abort", onAbort);
  try {
    await invoke("ai_chat", { id, config: { provider }, messages });
  } catch (e) {
    throw new Error(String(e));
  } finally {
    signal.removeEventListener("abort", onAbort);
    off();
  }
}

async function demoStream(messages: ChatMessage[], onDelta: (text: string) => void, signal: AbortSignal) {
  const last = messages.at(-1)?.content ?? "";
  const reply = showcase ? showcaseAnswer : `Browser-Vorschau: In der App antwortet hier das eingestellte Modell auf „${last.slice(0, 120)}“.`;
  if (showcase) await new Promise((r) => setTimeout(r, 380));
  for (const chunk of reply.match(/\S+\s*/g) ?? []) {
    if (signal.aborted) return;
    await new Promise((r) => setTimeout(r, showcase ? 34 : 25 + Math.random() * 35));
    onDelta(chunk);
  }
}
