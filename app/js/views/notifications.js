import { h, icon, toast } from "../ui.js";
import { api } from "../api.js";
import { momentLink } from "./common.js";

export async function notifPanel(app) {
  const body = h("div", { class: "np-body" }, h("p", { class: "hint" }, "Loading..."));
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); app.refreshNotifs(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const bg = h("div", { class: "modal-bg right", onclick: (e) => { if (e.target === bg) close(); } },
    h("aside", { class: "np", role: "dialog", "aria-modal": "true", "aria-label": "Notifications" }, h("div", { class: "np-head" }, h("h3", null, "Notifications"), h("button", { class: "btn btn-ghost btn-xs", type: "button", "aria-label": "Close", onclick: close }, icon("x"))), body));
  document.body.append(bg); document.addEventListener("keydown", onKey); window.addEventListener("hashchange", close, { once: true });

  async function load() {
    let r; try { r = await api.get("/notifications"); } catch (e) { body.replaceChildren(h("p", { class: "hint" }, e.message)); return; }
    body.replaceChildren();
    if (!r.notifications.length) { body.append(h("p", { class: "hint" }, "Nothing yet. When a new video answers a reference you saved for later, it shows up here, once.")); return; }
    for (const n of r.notifications) {
      const card = h("div", { class: "rcard " + (n.status === "new" ? "pending" : "") },
        h("div", { class: "rh" }, h("span", { class: "pill " + (n.status === "new" ? "amber" : n.status === "accepted" ? "green" : "dim") }, n.status === "new" ? (n.dir === "forward" ? "A follow-up may now be covered" : "Possible explanation found") : n.status === "accepted" ? (n.dir === "forward" ? "Follow-up covered" : "Link confirmed") : "Rejected"), h("span", { class: "pill cyan" }, "similarity " + n.score.toFixed(2))),
        h("div", { class: "cmp" },
          h("div", null, h("small", null, n.dir === "forward" ? "Where it was mentioned" : "Where you asked"), h("b", null, n.origin ? n.origin.title : ""), n.origin ? momentLink(n.origin.videoId, n.origin.start) : null, h("span", null, n.origin ? n.origin.text : "")),
          h("div", null, h("small", null, n.dir === "forward" ? "Possible follow-through" : "Possible explanation"), h("b", null, n.candidate.title), momentLink(n.candidate.videoId, n.candidate.start), h("span", null, n.candidate.text))),
        n.status === "new" ? h("div", { class: "hint" }, "Open both moments, then decide. A score marks a candidate, not proof.") : null,
        n.status === "new" ? h("div", { class: "acts" },
          h("button", { class: "btn btn-ok btn-xs", type: "button", onclick: async () => { try { await api.post(`/notifications/${n.id}/accept`); toast("Link confirmed."); await load(); } catch (e) { toast(e.message, "err"); } } }, icon("check"), " Accept link"),
          h("button", { class: "btn btn-warn btn-xs", type: "button", onclick: async () => { try { await api.post(`/notifications/${n.id}/reject`); toast("Rejected. It will not be suggested again."); await load(); } catch (e) { toast(e.message, "err"); } } }, "Reject")) : null);
      body.append(card);
    }
  }
  await load();
}
