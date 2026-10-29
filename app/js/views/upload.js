import { h, icon, clear, toast, fmtSize } from "../ui.js";
import { putFile } from "../api.js";

export async function uploadView({ view, api, app, go }) {
  const me = app.me, canMedia = me.capabilities.transcription;
  let tab = canMedia ? "media" : "text", file = null, busy = false;
  const err = h("div", { class: "form-err", role: "alert" });
  const title = h("input", { type: "text", id: "vtitle", maxlength: "120", placeholder: "e.g. Week 3 lecture: databases", "aria-label": "Title" });
  const lang = h("select", { class: "sel", id: "vlang", "aria-label": "Spoken language" }, ...Object.entries(me.limits.languages).map(([k, v]) => h("option", { value: k }, v)));
  const drop = h("div", { class: "drop", tabindex: "0", role: "button", "aria-label": "Choose a video or audio file" });
  const fileIn = h("input", { type: "file", id: "vfile", accept: me.limits.formats.map((f) => "." + f).join(","), hidden: true });
  const prog = h("div", { class: "prog", hidden: true }, h("div", { class: "bar" }, h("i", { style: { "--w": "0%" } })), h("span", { class: "hint" }, ""));
  const paste = h("textarea", { class: "notes-ta", id: "vtext", placeholder: "Paste a transcript here. SRT, WebVTT, Amazon Transcribe JSON, or plain text (lines may start with [mm:ss]).", rows: "10", "aria-label": "Transcript text" });
  const tfile = h("input", { type: "file", id: "tfile", accept: ".srt,.vtt,.txt,.json,text/plain", hidden: true });
  const go_ = h("button", { class: "btn btn-primary", type: "button", id: "vgo" }, icon("upload"), " Add to library");
  const mediaPane = h("div", { class: "pane-in" }, drop, fileIn, h("div", { class: "row2" }, h("div", null, h("label", { for: "vlang" }, "Spoken language"), lang)), prog);
  const textPane = h("div", { class: "pane-in" }, paste, h("div", { class: "row2" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => tfile.click() }, icon("file"), " Choose a file instead"), h("span", { class: "hint", id: "tfname" }, "")), tfile);

  function paintDrop() {
    clear(drop);
    if (!file) drop.append(icon("upload", "big"), h("b", null, "Drop a video or audio file here"), h("span", null, `or click to browse. ${me.limits.formats.join(", ")} up to ${me.limits.maxMediaMB} MB.`));
    else drop.append(icon("film", "big"), h("b", null, file.name), h("span", null, fmtSize(file.size)));
  }
  function setFile(f) {
    err.textContent = "";
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!me.limits.formats.includes(ext)) { err.textContent = `Unsupported file type. Use: ${me.limits.formats.join(", ")}.`; return; }
    if (f.size > me.limits.maxMediaMB * 1048576) { err.textContent = `That file is larger than ${me.limits.maxMediaMB} MB.`; return; }
    file = f; if (!title.value.trim()) title.value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120); paintDrop();
  }
  drop.addEventListener("click", () => fileIn.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", () => setFile(fileIn.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
  tfile.addEventListener("change", async () => {
    const f = tfile.files[0]; if (!f) return;
    if (f.size > 5e6) { err.textContent = "That transcript file is too large (5 MB max)."; return; }
    paste.value = await f.text(); document.getElementById("tfname").textContent = f.name; if (!title.value.trim()) title.value = f.name.replace(/\.[^.]+$/, "");
  });

  async function submit() {
    if (busy) return; err.textContent = "";
    const t = title.value.trim();
    if (!t) { err.textContent = "Give the video a title."; title.focus(); return; }
    if (tab === "media" && !file) { err.textContent = "Choose a file first."; return; }
    if (tab === "text" && !paste.value.trim()) { err.textContent = "Paste or choose a transcript first."; return; }
    busy = true; go_.disabled = true;
    let created = null;
    try {
      if (tab === "media") {
        const c = await api.post("/videos", { title: t, kind: "media", filename: file.name, size: file.size, language: lang.value }); created = c.video;
        prog.hidden = false; const bar = prog.querySelector(".bar i"), lbl = prog.querySelector(".hint");
        lbl.textContent = "Uploading...";
        await putFile(c.upload, file, (p) => { bar.style.setProperty("--w", Math.round(p * 100) + "%"); lbl.textContent = `Uploading ${Math.round(p * 100)}%`; });
        lbl.textContent = "Starting transcription...";
        await api.post(`/videos/${created.id}/start`);
        toast("Upload complete. Transcribing now.");
      } else {
        const c = await api.post("/videos", { title: t, kind: "transcript" }); created = c.video;
        await api.post(`/videos/${created.id}/transcript`, { text: paste.value });
        toast("Transcript imported. Analyzing now.");
      }
      app.refreshNotifs(); go(`/v/${created.id}`);
    } catch (e) {
      err.textContent = e.message; busy = false; go_.disabled = false; prog.hidden = true;
      if (created) api.del(`/videos/${created.id}`).catch(() => {});
    }
  }
  go_.addEventListener("click", submit);

  const tabs = h("div", { class: "seg", role: "tablist" });
  const setTab = (t) => { tab = t; err.textContent = ""; [...tabs.children].forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === t))); mediaPane.hidden = t !== "media"; textPane.hidden = t !== "text"; };
  if (canMedia) tabs.append(h("button", { role: "tab", dataset: { t: "media" }, type: "button", onclick: () => setTab("media") }, icon("film"), " Video or audio"));
  tabs.append(h("button", { role: "tab", dataset: { t: "text" }, type: "button", onclick: () => setTab("text") }, icon("file"), " Transcript"));
  paintDrop();
  view.append(h("div", { class: "page-head" }, h("div", null, h("h1", null, "Add a video"), h("p", { class: "sub" }, canMedia ? "Upload a recording to transcribe, or import an existing transcript." : "Video transcription is not enabled on this server. Import a transcript instead."))),
    h("div", { class: "card form-card" }, tabs, h("label", { for: "vtitle" }, "Title"), title, mediaPane, textPane, err, h("div", { class: "form-foot" }, go_, h("span", { class: "hint" }, tab === "media" ? "Transcription usually takes a fraction of the video's length." : ""))));
  setTab(tab);
  return () => {};
}
