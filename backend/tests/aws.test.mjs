// Runs the real AWS adapters against moto (DynamoDB + S3 over the wire) and mocks for Transcribe, Bedrock and Lambda.
import assert from "node:assert/strict";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { makeContext } from "../src/context.js";
import { handle } from "../src/api.js";
import { handleWorkerEvent } from "../src/worker.js";
import { awsDb, awsStorage, awsTranscribe, awsLlm, awsEmbed, awsWorker } from "../src/providers/aws.js";
import { api as lambdaApi, preSignUp } from "../src/lambda.js";

process.env.AWS_ACCESS_KEY_ID = "test"; process.env.AWS_SECRET_ACCESS_KEY = "test"; process.env.AWS_REGION = "us-east-1";
const EP = "http://localhost:5555";
const ddb = new DynamoDBClient({ endpoint: EP, region: "us-east-1" });
const s3 = new S3Client({ endpoint: EP, region: "us-east-1", forcePathStyle: true });
await ddb.send(new CreateTableCommand({ TableName: "t", BillingMode: "PAY_PER_REQUEST", AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }, { AttributeName: "sk", AttributeType: "S" }], KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }, { AttributeName: "sk", KeyType: "RANGE" }] })).catch((e) => { if (e.name !== "ResourceInUseException") throw e; });
await s3.send(new CreateBucketCommand({ Bucket: "media" })).catch((e) => { if (!/BucketAlready/.test(e.name)) throw e; });

const RUN = Date.now().toString(36); const U1 = "cog1" + RUN, U2 = "cog2" + RUN;
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };

// ---- db adapter ----
const db = awsDb({ table: "t", client: ddb });
await ok("dynamodb adapter: put/get/conditional put/query/prefix/delete/deleteMany (with >25 rows)", async () => {
  assert.equal(await db.put({ pk: "U#1", sk: "V#a", x: 1, nul: null, f: 1.5 }), true);
  assert.equal(await db.put({ pk: "U#1", sk: "V#a", x: 2 }, { ifNotExists: true }), false);
  assert.deepEqual(await db.get("U#1", "V#a"), { pk: "U#1", sk: "V#a", x: 1, nul: null, f: 1.5 });
  for (let i = 0; i < 60; i++) await db.put({ pk: "U#1", sk: "C#a#" + String(i).padStart(5, "0"), i });
  const rows = await db.query("U#1", "C#a#"); assert.equal(rows.length, 60); assert.equal(rows[0].i, 0); assert.equal(rows[59].i, 59);
  await db.deleteMany("U#1", "C#a#"); assert.equal((await db.query("U#1", "C#")).length, 0);
  await db.delete("U#1", "V#a"); assert.equal(await db.get("U#1", "V#a"), null);
});
await ok("dynamodb update: sets fields, honours status conditions, never creates a missing item", async () => {
  await db.put({ pk: "U#u", sk: "V#x", status: "processing", title: "T", nul: 1 });
  assert.equal(await db.update("U#u", "V#x", { title: "New", extra: null, gone: undefined }), true);
  assert.deepEqual(await db.get("U#u", "V#x"), { pk: "U#u", sk: "V#x", status: "processing", title: "New", nul: 1, extra: null });
  assert.equal(await db.update("U#u", "V#x", { status: "ready" }, { ifStatus: ["transcribing"] }), false);
  assert.equal((await db.get("U#u", "V#x")).status, "processing");
  assert.equal(await db.update("U#u", "V#x", { status: "ready" }, { ifStatus: ["processing", "failed"] }), true);
  assert.equal(await db.update("U#u", "V#missing", { title: "x" }), false);
  assert.equal(await db.get("U#u", "V#missing"), null);
});
const storage = awsStorage({ bucket: "media", client: s3 });
await ok("s3 adapter: presigned put works over HTTP, head, getJson, delete", async () => {
  const up = await storage.presignPut("media/u/v.mp4", "video/mp4");
  assert.match(up.url, /media/); assert.match(up.url, /X-Amz-Signature=/);
  const put = await fetch(up.url, { method: "PUT", body: "hello", headers: up.headers }); assert.equal(put.status, 200);
  assert.deepEqual(await storage.head("media/u/v.mp4"), { size: 5 });
  assert.equal(await storage.head("media/u/none.mp4"), null);
  await s3.send(new PutObjectCommand({ Bucket: "media", Key: "j.json", Body: JSON.stringify({ a: 1 }) }));
  assert.deepEqual(await storage.getJson("j.json"), { a: 1 });
  assert.match(await storage.presignGet("media/u/v.mp4"), /X-Amz-Signature=/);
  await storage.delete("media/u/v.mp4"); assert.equal(await storage.head("media/u/v.mp4"), null);
});

await ok("default S3 client signs PUT URLs without checksum parameters (they break browser uploads)", async () => {
  const def = awsStorage({ bucket: "media" });
  const up = await def.presignPut("media/u/v.mp4", "video/mp4");
  assert.ok(!/checksum/i.test(up.url), up.url);
  assert.match(up.url, /^https:\/\/media\.s3\.us-east-1\.amazonaws\.com\//);
});
// ---- service adapters with mocks ----
const trM = mockClient(TranscribeClient), brM = mockClient(BedrockRuntimeClient), laM = mockClient(LambdaClient);
await ok("transcribe adapter sends the right job request and reads the result from S3", async () => {
  const tr = awsTranscribe({ bucket: "media", storage, client: new TranscribeClient({}) });
  trM.on(StartTranscriptionJobCommand).resolves({});
  await tr.start({ jobName: "cn.u1.abc123def0.1", mediaKey: "media/u1/abc123def0.mp4", outputKey: "transcripts/u1/abc123def0.json", language: "en-IN" });
  const input = trM.commandCalls(StartTranscriptionJobCommand)[0].args[0].input;
  assert.deepEqual(input, { TranscriptionJobName: "cn.u1.abc123def0.1", LanguageCode: "en-IN", Media: { MediaFileUri: "s3://media/media/u1/abc123def0.mp4" }, OutputBucketName: "media", OutputKey: "transcripts/u1/abc123def0.json" });
  await s3.send(new PutObjectCommand({ Bucket: "media", Key: "transcripts/u1/abc123def0.json", Body: JSON.stringify({ results: { items: [] } }) }));
  trM.on(GetTranscriptionJobCommand).resolves({ TranscriptionJob: { TranscriptionJobStatus: "COMPLETED" } });
  assert.deepEqual((await tr.result("cn.u1.abc123def0.1")).json, { results: { items: [] } });
  trM.on(GetTranscriptionJobCommand).resolves({ TranscriptionJob: { TranscriptionJobStatus: "FAILED", FailureReason: "Unsupported format" } });
  assert.equal((await tr.result("cn.u1.abc123def0.1")).failure, "Unsupported format");
});
await ok("bedrock adapters: Converse for notes, Titan v2 for embeddings", async () => {
  brM.on(ConverseCommand).resolves({ output: { message: { content: [{ text: '{"summary":"x"}' }] } } });
  assert.equal(await awsLlm({ modelId: "amazon.nova-lite-v1:0", client: new BedrockRuntimeClient({}) }).complete({ system: "s", user: "u" }), '{"summary":"x"}');
  const ci = brM.commandCalls(ConverseCommand)[0].args[0].input; assert.equal(ci.modelId, "amazon.nova-lite-v1:0"); assert.equal(ci.messages[0].role, "user"); assert.equal(ci.system[0].text, "s");
  brM.on(InvokeModelCommand).resolves({ body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2, 0.3] })) });
  const v = await awsEmbed({ client: new BedrockRuntimeClient({}) }).embed("hello");
  assert.deepEqual(Array.from(v).map((x) => +x.toFixed(1)), [0.1, 0.2, 0.3]);
  const ii = brM.commandCalls(InvokeModelCommand)[0].args[0].input; assert.equal(ii.modelId, "amazon.titan-embed-text-v2:0"); assert.deepEqual(JSON.parse(ii.body), { inputText: "hello", dimensions: 512, normalize: true });
});
await ok("worker adapter invokes the worker function asynchronously", async () => {
  laM.on(InvokeCommand).resolves({});
  await awsWorker({ functionName: "wk", client: new LambdaClient({}) }).run({ type: "process", userId: "u", videoId: "v" });
  const i = laM.commandCalls(InvokeCommand)[0].args[0].input; assert.equal(i.FunctionName, "wk"); assert.equal(i.InvocationType, "Event"); assert.deepEqual(JSON.parse(Buffer.from(i.Payload).toString()), { type: "process", userId: "u", videoId: "v" });
});

// ---- the whole product on the AWS adapters ----
const events = [];
const worker = { run: (e) => { events.push(handleWorkerEvent(ctx, e)); } };
const ctx = makeContext({ db, storage, transcribe: awsTranscribe({ bucket: "media", storage, client: new TranscribeClient({}) }), worker, llm: awsLlm({ modelId: "m", client: new BedrockRuntimeClient({}) }), embed: awsEmbed({ client: new BedrockRuntimeClient({}) }) });
brM.on(ConverseCommand).resolves({ output: { message: { content: [{ text: '{"summary":"A walkthrough.","key_points":[{"text":"Set port 8000","source":[4]}],"action_items":[],"decisions":[]}' }] } } });
brM.on(InvokeModelCommand).callsFake((input) => {
  const t = JSON.parse(input.body).inputText.toLowerCase(); const v = new Array(32).fill(0);
  for (const w of t.match(/[a-z0-9]+/g) || []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 32] += 1; }
  const nn = Math.hypot(...v) || 1; return { body: new TextEncoder().encode(JSON.stringify({ embedding: v.map((x) => x / nn) })) };
});
const call = (u, m, p, b, q) => handle(ctx, { method: m, path: "/api" + p, body: b, query: q, userId: u });
const must = (r, s = 200) => { assert.equal(r.status, s, JSON.stringify(r.body)); return r.body; };
await ok("full flow on DynamoDB + S3 adapters: samples, notes from the model, semantic search, references, notification", async () => {
  must(await call(U1, "POST", "/samples", { which: "basic" })); await Promise.all(events.splice(0));
  const videos = must(await call(U1, "GET", "/videos")).videos; assert.ok(videos.every((v) => v.status === "ready" && v.embedded && v.notesSource === "model"), JSON.stringify(videos.map((v) => [v.status, v.embedded, v.notesSource])));
  const app = videos.find((v) => v.title.startsWith("Application"));
  const refs = must(await call(U1, "GET", `/videos/${app.id}/references`)).references; assert.equal(refs.length, 3);
  const r1 = refs.find((r) => r.start === 370); must(await call(U1, "POST", `/references/${encodeURIComponent(r1.id)}/remember`));
  must(await call(U1, "POST", "/samples", { which: "database" })); await Promise.all(events.splice(0));
  const nt = must(await call(U1, "GET", "/notifications")); assert.equal(nt.unread, 1);
  const res = must(await call(U1, "GET", "/search", undefined, { q: "which port should the application use" })); assert.equal(res.results[0].mode, "semantic");
  must(await call(U1, "DELETE", `/videos/${app.id}`));
  assert.equal(must(await call(U1, "GET", "/videos")).videos.length, 2);
});
await ok("transcribe completion event drives a video to ready on the AWS adapters", async () => {
  trM.on(StartTranscriptionJobCommand).resolves({});
  const c = must(await call(U2, "POST", "/videos", { title: "Talk", kind: "media", filename: "t.mp4", size: 100 }));
  const put = await fetch(c.upload.url, { method: "PUT", body: "bytes", headers: c.upload.headers }); assert.equal(put.status, 200);
  must(await call(U2, "POST", `/videos/${c.video.id}/start`));
  assert.equal(trM.commandCalls(StartTranscriptionJobCommand).at(-1).args[0].input.Media.MediaFileUri, `s3://media/media/${U2}/${c.video.id}.mp4`);
  const items = []; let t = 0; for (const w of "We decided to ship on Friday. You need to update the changelog before then because users read it.".split(" ")) { const b = w.replace(/[.,]$/, ""); items.push({ type: "pronunciation", start_time: String(t), end_time: String(t + 0.3), alternatives: [{ content: b }] }); if (/[.,]$/.test(w)) items.push({ type: "punctuation", alternatives: [{ content: w.slice(-1) }] }); t += 0.4; }
  await s3.send(new PutObjectCommand({ Bucket: "media", Key: `transcripts/${U2}/${c.video.id}.json`, Body: JSON.stringify({ results: { items } }) }));
  trM.on(GetTranscriptionJobCommand).resolves({ TranscriptionJob: { TranscriptionJobStatus: "COMPLETED" } });
  await handleWorkerEvent(ctx, { source: "aws.transcribe", "detail-type": "Transcribe Job State Change", detail: { TranscriptionJobName: `cn.${U2}.${c.video.id}.1`, TranscriptionJobStatus: "COMPLETED" } });
  const d = must(await call(U2, "GET", `/videos/${c.video.id}`)); assert.equal(d.video.status, "ready"); assert.ok(d.notes.points.length >= 1);
});

// ---- lambda entry points ----
await ok("lambda api handler maps API Gateway events (JWT claims, base64 body, bad JSON, no auth)", async () => {
  process.env.AWS_ENDPOINT_URL = EP; process.env.TABLE = "t"; process.env.MEDIA_BUCKET = "media"; process.env.WORKER_FUNCTION = "wk"; process.env.NOTES_MODEL_ID = "none"; process.env.EMBED_MODEL_ID = "none";
  const ev = (over) => ({ rawPath: "/api/me", requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: "sub-1" } } } }, ...over });
  const r = await lambdaApi(ev()); assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).userId, "sub-1"); assert.equal(r.headers["cache-control"], "no-store");
  const noAuth = await lambdaApi({ rawPath: "/api/me", requestContext: { http: { method: "GET" } } }); assert.equal(noAuth.statusCode, 401);
  const b64 = await lambdaApi(ev({ rawPath: "/api/videos", requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "sub-1" } } } }, body: Buffer.from(JSON.stringify({ title: "T", kind: "transcript" })).toString("base64"), isBase64Encoded: true })); assert.equal(b64.statusCode, 200);
  const badj = await lambdaApi(ev({ rawPath: "/api/videos", requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "sub-1" } } } }, body: "{oops" })); assert.equal(badj.statusCode, 400);
  process.env.ALLOWED_EMAIL_DOMAINS = "school.edu, @example.org";
  await assert.rejects(() => preSignUp({ request: { userAttributes: { email: "a@gmail.com" } }, response: {} }), /approved email domains/);
  assert.equal((await preSignUp({ request: { userAttributes: { email: "A@School.EDU" } }, response: {} })).response.autoConfirmUser, true);
  delete process.env.ALLOWED_EMAIL_DOMAINS;
  const ps = await preSignUp({ request: { userAttributes: { email: "a@b.co" } }, response: {} }); assert.equal(ps.response.autoConfirmUser, true); assert.equal(ps.response.autoVerifyEmail, true);
});
console.log(`\n${n} AWS adapter tests passed`);
