import { h, icon, clear, toast } from "../ui.js";
import { momentCard } from "./common.js";
import { markDone } from "./home.js";

const SAMPLES = ["Which port should the application use?", "How do I restart the service?", "Where was the firewall rule configured?"];

export async function askView({ view, api, app, q }) {
  const input = h("input", { type: "text", id: "askq", placeholder: "Ask anything about your videos...", "aria-label": "Question", autocomplete: "off", value: q.q || "" });
  const out = h("div", { "aria-live": "polite", class: "ask-out" });
  async function run(text) {
    text = (text || "").trim(); if (!text) { input.focus(); return; }
    clear(out); out.append(h("div", { class: "hint" }, "Searching..."));
    markDone("ask");
    try {
      const r = await api.get("/search", { q: text });
      clear(out);
      if (!r.results.length) out.append(h("div", { class: "nomatch" }, h("b", null, "Nothing close enough. "), "Try other words, or add the video that covers it."));
      else { out.append(h("div", { class: "hint" }, `${r.results.length} closest moment${r.results.length === 1 ? "" : "s"}. Click a timestamp to jump there.`)); r.results.forEach((x) => out.append(momentCard(x))); }
    } catch (e) { clear(out); toast(e.message, "err"); }
  }
  view.append(h("div", { class: "page-head" }, h("div", null, h("h1", null, "Ask your library"), h("p", { class: "sub" }, "Search every video by meaning. Answers are moments, not paragraphs, so you can check the source."))),
    h("div", { class: "card" }, h("form", { class: "askbar", onsubmit: (e) => { e.preventDefault(); run(input.value); } }, input, h("button", { class: "btn btn-primary", type: "submit" }, icon("search"), " Ask")),
      h("div", { class: "chips", style: { marginTop: "12px" } }, ...SAMPLES.map((s) => h("button", { type: "button", class: "chip", onclick: () => { input.value = s; run(s); } }, s))), out));
  if (q.q) run(q.q);
  input.focus();
  return () => {};
}
