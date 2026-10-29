// Auth: Amazon Cognito in production (direct calls to the public Cognito API), a simple dev login locally.
const KEY = "cn.auth.v1";
let cfg = { mode: "dev" };
let st = null;
const load = () => { try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { st = null; } };
const save = () => { try { st ? localStorage.setItem(KEY, JSON.stringify(st)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(st));

async function cognito(target, payload) {
  const res = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, { method: "POST", headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService." + target }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const t = String(data.__type || "").split("#").pop(); const e = new Error(friendly(t, data.message)); e.code = t; throw e; }
  return data;
}
function friendly(type, msg) {
  return ({
    UsernameExistsException: "An account with this email already exists. Try signing in.",
    NotAuthorizedException: "Incorrect email or password.", UserNotFoundException: "Incorrect email or password.",
    InvalidPasswordException: msg || "Password is too weak. Use at least 8 characters and a number.",
    InvalidParameterException: msg || "Check the email and password and try again.", TooManyRequestsException: "Too many attempts. Wait a moment and try again.", LimitExceededException: "Too many attempts. Wait a moment and try again.",
    UserNotConfirmedException: "Please confirm your account first.",
    UserLambdaValidationException: (msg || "").replace(/^PreSignUp failed with error /, "").replace(/\.$/, "") || "Sign-up is not allowed for this email.",
  })[type] || msg || "Something went wrong. Please try again.";
}
function fromResult(email, r, silent) {
  st = { email, idToken: r.IdToken, refresh: r.RefreshToken || (st && st.refresh), exp: Date.now() + (r.ExpiresIn || 3600) * 1000 - 60000 };
  save(); if (!silent) emit();
}

export const auth = {
  async init() { const r = await fetch("config.json").catch(() => null); if (r && r.ok) cfg = await r.json(); load(); },
  mode: () => cfg.mode,
  user: () => (st ? { email: st.email } : null),
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  async signUp(email, password) {
    if (cfg.mode === "browser") { st = { email: email.toLowerCase(), idToken: "browser", exp: Number.MAX_SAFE_INTEGER }; save(); emit(); return; }
    if (cfg.mode === "dev") { const r = await devCall("signup", email, password); st = { email: r.email, idToken: r.token, exp: Number.MAX_SAFE_INTEGER }; save(); emit(); return; }
    await cognito("SignUp", { ClientId: cfg.clientId, Username: email, Password: password, UserAttributes: [{ Name: "email", Value: email }] });
    await auth.signIn(email, password);
  },
  async signIn(email, password) {
    if (cfg.mode === "browser") { st = { email: email.toLowerCase(), idToken: "browser", exp: Number.MAX_SAFE_INTEGER }; save(); emit(); return; }
    if (cfg.mode === "dev") { const r = await devCall("signin", email, password); st = { email: r.email, idToken: r.token, exp: Number.MAX_SAFE_INTEGER }; save(); emit(); return; }
    const d = await cognito("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: cfg.clientId, AuthParameters: { USERNAME: email, PASSWORD: password } });
    if (!d.AuthenticationResult) throw new Error("Sign-in needs another step that this app does not support.");
    fromResult(email, d.AuthenticationResult);
  },
  async token() {
    if (!st) return null;
    if (st.exp > Date.now()) return st.idToken;
    return (await auth.refresh()) ? st.idToken : null;
  },
  async refresh() {
    if (cfg.mode !== "cognito" || !st || !st.refresh) return false;
    try { const d = await cognito("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: cfg.clientId, AuthParameters: { REFRESH_TOKEN: st.refresh } }); fromResult(st.email, d.AuthenticationResult, true); return true; }
    catch { return false; }
  },
  signOut() { st = null; save(); emit(); },
};
async function devCall(mode, email, password) {
  const res = await fetch("/api/_dev/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, email, password }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Could not sign in.");
  return d;
}
