import { h, icon } from "../ui.js";
import { auth } from "../auth.js";
import { waves, parallax } from "../fx.js";

export function loginView(root, onDone) {
  let mode = "signin";
  const msg = h("div", { class: "form-err", role: "alert" });
  const email = h("input", { type: "email", id: "email", autocomplete: "email", required: true, placeholder: "you@example.com", "aria-label": "Email" });
  const pw = h("input", { type: "password", id: "password", autocomplete: "current-password", required: true, placeholder: "At least 8 characters", "aria-label": "Password" });
  const submit = h("button", { class: "btn btn-primary", type: "submit", style: { width: "100%" } }, "Sign in");
  const title = h("h1", null, "Welcome back");
  const sub = h("p", { class: "sub" }, "Sign in to your library.");
  const switchBtn = h("button", { type: "button", class: "linkbtn" }, "Create an account");
  const switchText = h("span", null, "New here? ");
  const form = h("form", { class: "auth-form", novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = "";
    const em = email.value.trim(), p = pw.value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = "Enter a valid email address."; email.focus(); return; }
    if (p.length < 8) { msg.textContent = "Password must be at least 8 characters."; pw.focus(); return; }
    if (mode === "signup" && !/\d/.test(p)) { msg.textContent = "Include at least one number in your password."; pw.focus(); return; }
    submit.disabled = true; submit.textContent = mode === "signup" ? "Creating account..." : "Signing in...";
    try { await (mode === "signup" ? auth.signUp(em, p) : auth.signIn(em, p)); onDone(); }
    catch (err) { msg.textContent = err.message; submit.disabled = false; submit.textContent = mode === "signup" ? "Create account" : "Sign in"; }
  } }, h("label", { for: "email" }, "Email"), email, h("label", { for: "password" }, "Password"), pw, msg, submit);
  const setMode = (m) => {
    mode = m; msg.textContent = "";
    title.textContent = m === "signup" ? "Create your account" : "Welcome back";
    sub.textContent = m === "signup" ? "Start turning videos into searchable notes." : "Sign in to your library.";
    submit.textContent = m === "signup" ? "Create account" : "Sign in";
    pw.autocomplete = m === "signup" ? "new-password" : "current-password";
    switchText.textContent = m === "signup" ? "Already have an account? " : "New here? ";
    switchBtn.textContent = m === "signup" ? "Sign in" : "Create an account";
  };
  switchBtn.addEventListener("click", () => setMode(mode === "signup" ? "signin" : "signup"));
  const feat = (ic, t, d) => h("li", null, h("span", { class: "fi" }, icon(ic)), h("div", null, h("b", null, t), h("span", null, d)));
  const bars = (n, seed) => h("div", { class: "mini-wave", "aria-hidden": "true" }, ...Array.from({ length: n }, (_, i) => h("i", { style: { height: 20 + Math.round(70 * Math.abs(Math.sin(i * 0.9 + seed) * Math.cos(i * 0.37 + seed * 2))) + "%" } })));
  const vcard = (cls, title, tag, tagCls, seed) => h("div", { class: "s3-card " + cls }, h("div", { class: "s3-top" }, h("b", null, title), h("span", { class: "pill " + tagCls }, tag)), bars(26, seed));
  const scene = h("div", { class: "stack3d", "aria-hidden": "true" },
    h("div", { class: "s3-plane" },
      h("svg", { class: "s3-links", viewBox: "0 0 360 300" }, h("path", { class: "l1", d: "M70,214 C130,190 150,150 190,128" }), h("path", { class: "l2", d: "M250,218 C230,190 215,160 200,134" })),
      vcard("c3", "Database Tutorial", "kept", "green", 3),
      vcard("c2", "Application Setup", "follow-up", "violet", 2),
      vcard("c1", "Server Setup", "linked", "cyan", 1),
      h("div", { class: "s3-badge" }, "as covered earlier")));
  const canvas = h("canvas", { class: "auth-canvas", "aria-hidden": "true" });
  root.append(h("div", { class: "auth-wrap" },
    h("section", { class: "auth-hero" }, canvas, scene,
      h("a", { class: "brand", href: "about.html" }, h("svg", { class: "logo-svg" }, h("use", { href: "#logo" })), h("span", null, "Cloud", h("b", null, "Note"), " AI")),
      h("h2", null, "Videos that ", h("span", { class: "serif grad-text" }, "remember"), " each other."),
      h("p", { class: "lede" }, "Upload a lecture, meeting or tutorial. Get timestamped notes, ask questions in plain language, and see where one recording explains what another only mentions."),
      h("ul", { class: "feats" }, feat("note", "Notes with sources", "Summary, key points, action items and decisions, each linked to the moment."), feat("search", "Ask your library", "Search by meaning and jump to the exact second."), feat("compass", "Context that finds itself", "\"As we covered earlier\" is matched to the video that covered it, now or on a future upload.")),
      h("div", { class: "auth-links" }, h("a", { href: "about.html" }, "About the product"), h("a", { href: "project.html" }, "Project details"))),
    h("section", { class: "auth-card" }, title, sub, form, h("p", { class: "switch" }, switchText, switchBtn),
      auth.mode() === "browser" ? h("p", { class: "hint", style: { marginTop: "18px" } }, "Preview mode: everything runs in this browser and nothing is uploaded. Any email and password works. Video upload and real transcription need the AWS deployment.") : null)));
  const step = (n, t, d) => h("li", { class: "ld-step" }, h("i", null, n), h("b", null, t), h("p", null, d));
  const card = (ic, cls, t, d) => h("article", { class: "ld-card " + cls }, h("span", { class: "ld-ic" }, icon(ic)), h("h3", null, t), h("p", null, d));
  root.append(h("div", { class: "landing" },
    h("section", { class: "ld-sec" }, h("span", { class: "eyebrow-s" }, "How it works"), h("h2", null, "From recording to connected knowledge"),
      h("ol", { class: "ld-steps" }, step("1", "Add a video", "Upload a recording or import a transcript. Speech is transcribed in your own AWS account."), step("2", "Get notes you can trust", "A summary, key points, action items and decisions, each linked to the second it came from."), step("3", "Let videos connect", "When one video points to another, or points to a later one, CloudNote AI keeps track until it is resolved."))),
    h("section", { class: "ld-sec" }, h("span", { class: "eyebrow-s" }, "What makes it different"), h("h2", null, "Built for series of videos, not single files"),
      h("div", { class: "ld-grid" },
        card("link", "indigo", "Context Recovery", "A speaker says \"as we discussed earlier\". CloudNote AI finds where, and lets you jump straight there."),
        card("bookmark", "cyan", "Remember the Missing Explanation", "Save the reference now. When a later video answers it, you get notified with both moments side by side."),
        card("flag", "violet", "Follow-up Tracker", "\"We will cover this in the next video\" is tracked too, so you can see which follow-ups no video has covered."),
        card("graph", "amber", "Library Map", "See what depends on what, the best watch order, and every gap in your library in one view."),
        card("cols", "green", "Notes vs Video", "Compare your own notes with the video and see what you missed or got wrong."),
        card("search", "indigo", "Ask your library", "Ask in plain language across every video and jump to the matching moment."))),
    h("section", { class: "ld-cta" }, h("h2", null, "Ready to try it?"), h("p", null, "Create an account, load the sample videos, and see a missing explanation get resolved in about a minute."), h("button", { class: "btn btn-primary", type: "button", onclick: () => { setMode("signup"); window.scrollTo({ top: 0, behavior: "smooth" }); email.focus({ preventScroll: true }); } }, "Create an account")),
    h("footer", { class: "ld-foot" }, "CloudNote AI, KL University, Department of CSE. Capstone project.")));
  email.focus();
  waves(canvas); parallax(scene);
}
