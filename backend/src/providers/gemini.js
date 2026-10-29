// Google Gemini (free tier) as a notes/Q&A model, used when Bedrock is unavailable. Plain fetch, no SDK.
// The free tier often answers 429/503 ("high demand"), so requests retry with backoff inside a time budget.
const RETRY = new Set([429, 500, 502, 503, 504]);

export function geminiLlm({ apiKey, model = "gemini-3.8-flash", budgetMs = 25000, attemptMs = 40000, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`;
  async function once(body, timeoutMs) {
    const r = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body, signal: AbortSignal.timeout(timeoutMs) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(`Gemini ${r.status}: ${String((j.error && j.error.message) || "request failed").slice(0, 160)}`); e.retry = RETRY.has(r.status); throw e; }
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
    if (!text) throw new Error("Gemini returned no text");
    return text;
  }
  return {
    async complete({ system, user }) {
      // thinking models count thoughts against maxOutputTokens, so leave room beyond the ~2500 tokens of notes
      const body = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 8192, temperature: 0.2 } });
      const end = Date.now() + budgetMs;
      for (let attempt = 0; ; attempt++) {
        const left = end - Date.now();
        try { return await once(body, Math.max(1000, Math.min(attemptMs, left))); }
        catch (e) {
          const retry = e.retry || e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError;
          const wait = Math.min(8000, 1000 * 2 ** attempt);
          if (!retry || end - Date.now() < wait + 3000) throw e;
          await sleep(wait);
        }
      }
    },
  };
}

// Any OpenAI-compatible chat API (Groq free tier by default), same retry rules as Gemini.
export function openAiLlm({ apiKey, model, baseUrl = "https://api.groq.com/openai/v1", name = "Groq", budgetMs = 25000, attemptMs = 40000, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  async function once(body, timeoutMs) {
    const r = await fetchFn(`${baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body, signal: AbortSignal.timeout(timeoutMs) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(`${name} ${r.status}: ${String((j.error && j.error.message) || "request failed").slice(0, 160)}`); e.retry = RETRY.has(r.status); throw e; }
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    if (!text) throw new Error(`${name} returned no text`);
    return text;
  }
  return {
    async complete({ system, user }) {
      const body = JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 2500, temperature: 0.2 });
      const end = Date.now() + budgetMs;
      for (let attempt = 0; ; attempt++) {
        const left = end - Date.now();
        try { return await once(body, Math.max(1000, Math.min(attemptMs, left))); }
        catch (e) {
          const retry = e.retry || e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError;
          const wait = Math.min(8000, 1000 * 2 ** attempt);
          if (!retry || end - Date.now() < wait + 3000) throw e;
          await sleep(wait);
        }
      }
    },
  };
}

// Try each model in order; the first one that answers wins.
export function chainLlm(models) {
  const list = models.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  return {
    async complete(req) {
      let last;
      for (const m of list) {
        try { return await m.complete(req); } catch (e) { last = e; console.error("model failed, trying the next one:", String((e && e.message) || e).slice(0, 200)); }
      }
      throw last;
    },
  };
}
