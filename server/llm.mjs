import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !env[m[1].trim()]) env[m[1].trim()] = m[2].trim();
    }
  }
  return env;
}

const env = loadEnv();
export const llmConfig = {
  baseUrl: env.META_BASE_URL || "https://api.meta.ai/v1",
  model: env.META_MODEL || "muse-spark-1.3",
  hasKey: Boolean(env.META_API_KEY),
};
const apiKey = env.META_API_KEY || "";
let liveOk = null;

export async function llmStatus() {
  if (!llmConfig.hasKey) return { mode: "stub", model: llmConfig.model, live: false };
  if (liveOk !== null) return { mode: liveOk ? "meta" : "stub", model: llmConfig.model, live: liveOk };
  try {
    const r = await fetch(`${llmConfig.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    liveOk = r.ok;
  } catch {
    liveOk = false;
  }
  return { mode: liveOk ? "meta" : "stub", model: llmConfig.model, live: liveOk };
}

// Returns null on any failure so callers fall back to deterministic logic.
export async function llmChat(system, user) {
  if (!llmConfig.hasKey || liveOk === false) return null;
  try {
    const r = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 2500,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) {
      liveOk = false;
      return null;
    }
    liveOk = true;
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
