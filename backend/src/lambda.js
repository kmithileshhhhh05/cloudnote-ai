// AWS Lambda entry points: api, worker (async jobs + Transcribe events), and the Cognito pre-sign-up trigger.
import { makeContext } from "./context.js";
import { handle } from "./api.js";
import { handleWorkerEvent } from "./worker.js";
import { geminiLlm, openAiLlm, chainLlm } from "./providers/gemini.js";
import { awsDb, awsStorage, awsTranscribe, awsLlm, awsEmbed, awsWorker } from "./providers/aws.js";

let _ctx;
function ctx() {
  if (_ctx) return _ctx;
  const e = process.env;
  const storage = awsStorage({ bucket: e.MEDIA_BUCKET });
  _ctx = makeContext({
    db: awsDb({ table: e.TABLE }),
    storage,
    transcribe: awsTranscribe({ bucket: e.MEDIA_BUCKET, storage }),
    worker: awsWorker({ functionName: e.WORKER_FUNCTION }),
    // Bedrock first; OpenAI, Groq and then Gemini (if keys are set) take over when it fails, so Bedrock comes back on its own once it works.
    llm: chainLlm([
      e.NOTES_MODEL_ID && e.NOTES_MODEL_ID !== "none" ? awsLlm({ modelId: e.NOTES_MODEL_ID, region: e.BEDROCK_REGION || undefined, maxAttempts: e.OPENAI_API_KEY || e.GROQ_API_KEY || e.GEMINI_API_KEY ? 1 : undefined }) : null,
      e.OPENAI_API_KEY ? openAiLlm({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL || "gpt-5.4-mini", baseUrl: "https://api.openai.com/v1", name: "OpenAI", reasoning: /^(gpt-5|o\d)/.test(e.OPENAI_MODEL || "gpt-5.4-mini"), budgetMs: Number(e.OPENAI_BUDGET_MS) || 12000 }) : null,
      e.GROQ_API_KEY ? openAiLlm({ apiKey: e.GROQ_API_KEY, model: e.GROQ_MODEL, budgetMs: Number(e.GROQ_BUDGET_MS) || 12000 }) : null,
      e.GEMINI_API_KEY ? geminiLlm({ apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL || undefined, budgetMs: Number(e.GEMINI_BUDGET_MS) || 12000 }) : null,
    ]),
    embed: e.EMBED_MODEL_ID && e.EMBED_MODEL_ID !== "none" ? awsEmbed({ modelId: e.EMBED_MODEL_ID, region: e.BEDROCK_REGION || undefined }) : null,
    config: {
      maxVideos: Number(e.MAX_VIDEOS) || 30,
      maxMediaBytes: (Number(e.MAX_MEDIA_MB) || 500) * 1048576,
      thresholds: {
        ...(e.TH_REF_SEMANTIC ? { refSemantic: Number(e.TH_REF_SEMANTIC) } : {}),
        ...(e.TH_ASK_SEMANTIC ? { askSemantic: Number(e.TH_ASK_SEMANTIC) } : {}),
      },
    },
  });
  return _ctx;
}

const json = (status, body) => ({ statusCode: status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }, body: JSON.stringify(body) });

export async function api(event) {
  const http = (event.requestContext && event.requestContext.http) || {};
  const claims = event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.jwt && event.requestContext.authorizer.jwt.claims;
  let body;
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body); }
    catch { return json(400, { error: "Request body must be JSON." }); }
  }
  const res = await handle(ctx(), { method: http.method || "GET", path: event.rawPath || "/", query: event.queryStringParameters || {}, body, userId: claims && claims.sub });
  return json(res.status, res.body);
}

export async function worker(event) { return handleWorkerEvent(ctx(), event); }

export async function preSignUp(event) {
  const allowed = String(process.env.ALLOWED_EMAIL_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const email = String((event.request && event.request.userAttributes && event.request.userAttributes.email) || "").toLowerCase();
  if (allowed.length && !allowed.includes(email.split("@")[1])) throw new Error("Sign-ups are limited to approved email domains.");
  event.response = event.response || {};
  event.response.autoConfirmUser = true;
  if (event.request && event.request.userAttributes && event.request.userAttributes.email) event.response.autoVerifyEmail = true;
  return event;
}
