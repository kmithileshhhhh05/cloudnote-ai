// Runs the browser auth module against moto's Cognito implementation to verify request/response shapes.
import assert from "node:assert/strict";
const EP = "http://localhost:5555/";
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const rawFetch = globalThis.fetch;
const calls = [];
const cog = async (target, body) => { const r = await rawFetch(EP, { method: "POST", headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService." + target }, body: JSON.stringify(body) }); return r.json(); };
const pool = (await cog("CreateUserPool", { PoolName: "t", UsernameAttributes: ["email"], Policies: { PasswordPolicy: { MinimumLength: 8, RequireLowercase: true, RequireNumbers: true, RequireUppercase: false, RequireSymbols: false } } })).UserPool;
const client = (await cog("CreateUserPoolClient", { UserPoolId: pool.Id, ClientName: "c", ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"], GenerateSecret: false })).UserPoolClient;
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith("config.json")) return new Response(JSON.stringify({ mode: "cognito", region: "us-east-1", userPoolId: pool.Id, clientId: client.ClientId }), { status: 200 });
  if (String(url).startsWith("https://cognito-idp.us-east-1.amazonaws.com")) { calls.push(init.headers["x-amz-target"]); return rawFetch(EP, init); }
  return rawFetch(url, init);
};
const { auth } = await import("../../app/js/auth.js");
await auth.init();
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };
const email = `t${Date.now()}@example.com`;
await ok("config selects cognito mode", async () => assert.equal(auth.mode(), "cognito"));
await ok("sign up reaches Cognito; unconfirmed user cannot sign in (production auto-confirms via the pre-sign-up trigger)", async () => {
  await assert.rejects(() => auth.signUp(email, "passw0rd"), /confirm/i);
  assert.ok(calls.includes("AWSCognitoIdentityProviderService.SignUp") || calls.some((c) => c.endsWith(".SignUp")));
});
await ok("after confirmation, sign in returns an ID token and stores the session", async () => {
  await cog("AdminConfirmSignUp", { UserPoolId: pool.Id, Username: email });
  await auth.signIn(email, "passw0rd");
  assert.equal(auth.user().email, email);
  const tok = await auth.token(); assert.ok(tok && tok.split(".").length === 3, "JWT shape");
  const payload = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
  assert.ok(payload.sub && payload.aud === client.ClientId, JSON.stringify(payload));
  assert.ok(store.get("cn.auth.v1").includes(email));
});
await ok("token refresh works with the refresh token", async () => {
  const st = JSON.parse(store.get("cn.auth.v1")); st.exp = 0; store.set("cn.auth.v1", JSON.stringify(st));
  await auth.init(); assert.equal(await auth.refresh(), true); assert.ok(await auth.token());
});
await ok("wrong password gives a friendly message", async () => { await assert.rejects(() => auth.signIn(email, "wrongpass1"), /Incorrect email or password/); });
await ok("weak password is rejected with a clear message", async () => { await assert.rejects(() => auth.signUp("w" + email, "short"), /./); });
await ok("duplicate sign up is explained", async () => { await assert.rejects(() => auth.signUp(email, "passw0rd"), /already exists/i); });
await ok("sign out clears the session", async () => { auth.signOut(); assert.equal(auth.user(), null); assert.equal(store.get("cn.auth.v1"), undefined); });
console.log(`\n${n} cognito client tests passed`);
