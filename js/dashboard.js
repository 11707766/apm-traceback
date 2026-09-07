/* Dashboard: role based change traceability with live cross-device sync. */
import { API } from "./api.js?v=20260911";

var esc = APMDiff.escapeHtml;

var session = null;
var isDeveloper = false;
var changes = [];
var editingUid = null;
var unsubscribe = null;

var el = {
  list: document.getElementById("change-list"),
  toasts: document.getElementById("toasts"),
  tester: document.getElementById("f-tester"),
  formMsg: document.getElementById("form-msg"),
  q: document.getElementById("q"),
  status: document.getElementById("f-status")
};

function fmt(iso) {
  return new Date(iso).toLocaleString();
}

function toast(title, body) {
  var node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = "<b>" + esc(title) + "</b>" + esc(body);
  el.toasts.appendChild(node);
  setTimeout(function () { node.remove(); }, 8000);
}

/* ---------- session ---------- */
API.onSession(function (user) {
  if (!user) { location.replace("index.html"); return; }
  session = user;
  isDeveloper = user.role === "developer";

  document.getElementById("who-name").textContent = user.name;
  document.getElementById("who-role").textContent = user.role;
  document.getElementById("dev-panel").hidden = !isDeveloper;
  document.getElementById("tester-note").hidden = isDeveloper;

  fillTesters();
  if (unsubscribe) unsubscribe();
  unsubscribe = API.subscribeChanges(function (list) {
    var firstLoad = changes.length === 0;
    var previous = {};
    changes.forEach(function (c) { previous[c.uid] = c.status; });
    changes = list;
    renderStats();
    renderChanges();
    if (!isDeveloper) notifyTester(previous, firstLoad);
  });
});

function notifyTester(previous, firstLoad) {
  changes
    .filter(function (c) {
      return c.testerEmail === session.email && c.status === "Tester Notified" &&
        (firstLoad || previous[c.uid] !== "Tester Notified");
    })
    .slice(0, 3)
    .forEach(function (c) {
      toast("Review pending: " + c.changeId, c.developer + " updated a " + c.type.toLowerCase() + " in " + c.module + ".");
    });
}

document.getElementById("btn-logout").addEventListener("click", function () {
  if (unsubscribe) unsubscribe();
  // Navigation must not wait on a network request; the local auth session is
  // cleared synchronously by Supabase before its remote sign-out completes.
  API.logout();
  location.replace("index.html");
});

/* ---------- change password modal ---------- */
var modal = document.getElementById("pw-modal");
document.getElementById("btn-change-pw").addEventListener("click", function () {
  document.getElementById("pw-msg").textContent = "";
  document.getElementById("pw-form").reset();
  modal.hidden = false;
});
document.getElementById("pw-cancel").addEventListener("click", function () { modal.hidden = true; });

document.getElementById("pw-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var msg = document.getElementById("pw-msg");
  var next = document.getElementById("pw-new").value;
  if (next !== document.getElementById("pw-confirm").value) {
    msg.className = "msg err";
    msg.textContent = "New passwords do not match.";
    return;
  }

  var result = await API.changePassword(document.getElementById("pw-old").value, next);
  if (!result.ok) {
    msg.className = "msg err";
    msg.textContent = result.error;
    return;
  }
  modal.hidden = true;
  toast("Password updated", "Your account password has been changed.");
});

/* ---------- tester review modal ---------- */
var reviewModal = document.getElementById("review-modal");
var reviewState = { uid: null, accepted: true };

function openReview(change, accepted) {
  reviewState = { uid: change.uid, accepted: accepted };
  document.getElementById("review-title").textContent = (accepted ? "Accept " : "Reject ") + change.changeId;
  document.getElementById("review-submit").textContent = accepted ? "Accept" : "Reject";
  document.getElementById("review-comment").value = "";
  reviewModal.hidden = false;
}

document.getElementById("review-cancel").addEventListener("click", function () {
  reviewModal.hidden = true;
});

document.getElementById("review-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var change = changes.filter(function (c) { return c.uid === reviewState.uid; })[0];
  if (!change || change.testerEmail !== session.email) { reviewModal.hidden = true; return; }

  var accepted = reviewState.accepted;
  reviewModal.hidden = true;
  await API.updateChange(change.uid, {
    status: accepted ? "Accepted" : "Rejected",
    reviewedAt: new Date().toISOString(),
    testerComment: document.getElementById("review-comment").value.trim()
  });
  toast("Review recorded", change.changeId + " marked " + (accepted ? "Accepted" : "Rejected") + ".");
});

/* ---------- developer form ---------- */
async function fillTesters() {
  var testers = await API.testers();
  el.tester.innerHTML = testers.length
    ? testers.map(function (t) {
        return '<option value="' + esc(t.email) + '">' + esc(t.name) + " (" + esc(t.email) + ")</option>";
      }).join("")
    : '<option value="">No tester registered yet</option>';
}

document.getElementById("change-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var testerEmail = el.tester.value;
  if (!testerEmail) {
    el.formMsg.className = "msg err";
    el.formMsg.textContent = "Register a tester account first, then assign the change.";
    return;
  }
  var testers = await API.testers();
  var tester = testers.filter(function (t) { return t.email === testerEmail; })[0];

  var payload = {
    changeId: document.getElementById("f-id").value.trim(),
    type: document.getElementById("f-type").value,
    priority: document.getElementById("f-priority").value,
    module: document.getElementById("f-module").value.trim(),
    previous: document.getElementById("f-prev").value,
    updated: document.getElementById("f-next").value,
    reason: document.getElementById("f-reason").value,
    developer: session.name,
    developerEmail: session.email,
    tester: tester ? tester.name : testerEmail,
    testerEmail: testerEmail
  };

  if (editingUid) {
    // A reviewed change goes back to Draft so the tester is re-notified.
    payload.status = "Draft";
    payload.testerComment = "";
    payload.updatedAt = new Date().toISOString();
    await API.updateChange(editingUid, payload);
    exitEditMode();
    el.formMsg.className = "msg ok";
    el.formMsg.textContent = "Change request updated. Use Notify Tester to send it again.";
  } else {
    await API.addChange(payload);
    e.target.reset();
    el.formMsg.className = "msg ok";
    el.formMsg.textContent = "Change request saved. Use Notify Tester to send it for review.";
  }
});

document.getElementById("cancel-edit").addEventListener("click", function () {
  exitEditMode();
  el.formMsg.textContent = "";
});

function enterEditMode(change) {
  editingUid = change.uid;
  document.getElementById("f-id").value = change.changeId;
  document.getElementById("f-type").value = change.type;
  document.getElementById("f-priority").value = change.priority;
  document.getElementById("f-module").value = change.module;
  document.getElementById("f-prev").value = change.previous;
  document.getElementById("f-next").value = change.updated;
  document.getElementById("f-reason").value = change.reason;
  el.tester.value = change.testerEmail;
  document.getElementById("dev-panel-title").textContent = "Edit " + change.changeId;
  document.getElementById("form-submit").textContent = "Save changes";
  document.getElementById("cancel-edit").hidden = false;
  document.getElementById("dev-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEditMode() {
  editingUid = null;
  document.getElementById("change-form").reset();
  document.getElementById("dev-panel-title").textContent = "Developer Update";
  document.getElementById("form-submit").textContent = "Raise change request";
  document.getElementById("cancel-edit").hidden = true;
}

/* ---------- change list ---------- */
function visibleChanges() {
  var q = (el.q.value || "").trim().toLowerCase();
  var status = el.status.value;
  return changes.filter(function (c) {
    if (status && c.status !== status) return false;
    if (!q) return true;
    return [c.changeId, c.module, c.developer, c.tester].join(" ").toLowerCase().indexOf(q) !== -1;
  });
}

function metaCell(label, value) {
  return "<div><small>" + esc(label) + "</small><b>" + esc(value || "\u2014") + "</b></div>";
}

function mailtoLink(c) {
  var subject = "[APMTRACEBACK] " + c.changeId + " needs your review";
  var body = [
    "Hello " + c.tester + ",",
    "",
    c.developer + " raised a " + c.type.toLowerCase() + " change.",
    "Change ID: " + c.changeId,
    "Module: " + c.module,
    "Priority: " + c.priority,
    "",
    "Previous: " + c.previous,
    "Updated: " + c.updated,
    "Reason: " + c.reason,
    "",
    "Please review the comparison in APMTRACEBACK and accept or reject the change.",
    c.developer
  ].join("\r\n");
  return "mailto:" + encodeURIComponent(c.testerEmail) +
    "?subject=" + encodeURIComponent(subject) +
    "&body=" + encodeURIComponent(body);
}

function cardHtml(c) {
  var d = APMDiff.diff(c.previous, c.updated);
  var actions = "";
  var isOwner = isDeveloper && c.developerEmail === session.email;
  var isAssignedTester = c.testerEmail === session.email;

  if (isOwner) {
    if (c.status !== "Accepted") {
      actions += '<button class="btn dark sm" data-act="edit" data-uid="' + c.uid + '">Edit</button>';
    }
    if (c.status === "Draft") {
      actions += '<button class="btn green sm" data-act="notify" data-uid="' + c.uid + '">Notify Tester</button>';
    }
    actions += '<button class="btn primary sm" data-act="mail" data-uid="' + c.uid + '">Notify Tester via Mail</button>';
  } else if (isAssignedTester && c.status === "Tester Notified") {
    actions =
      '<button class="btn primary sm" data-act="accept" data-uid="' + c.uid + '">Accept</button>' +
      '<button class="btn danger sm" data-act="reject" data-uid="' + c.uid + '">Reject</button>';
  }

  return '<article class="change">' +
    '<div class="chips">' +
      '<span class="chip type">' + esc(c.type) + "</span>" +
      '<span class="chip st-' + esc(String(c.status).replace(/\s/g, "")) + '">' + esc(c.status) + "</span>" +
      '<span class="chip pr-' + esc(c.priority) + '">Priority: ' + esc(c.priority) + "</span>" +
    "</div>" +
    "<h4>" + esc(c.changeId) + "</h4>" +
    '<p class="muted">Raised ' + esc(fmt(c.createdAt)) + "</p>" +
    '<div class="meta">' +
      metaCell("Module", c.module) +
      metaCell("Developer", c.developer) +
      metaCell("Tester", c.tester) +
    "</div>" +
    '<div class="compare">' +
      '<div class="side old"><h5>Previous requirement / signal</h5><div>' + d.oldHtml + "</div></div>" +
      '<div class="side new"><h5>Updated requirement / signal</h5><div>' + d.newHtml + "</div></div>" +
    "</div>" +
    '<div class="reason"><b>Developer reason:</b> ' + esc(c.reason) + "</div>" +
    (c.testerComment ? '<div class="reason"><b>Tester comment:</b> ' + esc(c.testerComment) + "</div>" : "") +
    (actions ? '<div class="card-actions">' + actions + "</div>" : "") +
    "</article>";
}

function renderChanges() {
  var items = visibleChanges();
  el.list.innerHTML = items.length
    ? items.map(cardHtml).join("")
    : '<p class="empty">No change requests to show yet.</p>';
}

el.list.addEventListener("click", async function (e) {
  var btn = e.target.closest("button[data-act]");
  if (!btn) return;
  var change = changes.filter(function (c) { return c.uid === btn.dataset.uid; })[0];
  if (!change) return;

  if (btn.dataset.act === "edit") {
    if (change.developerEmail !== session.email) return;
    enterEditMode(change);
  }

  if (btn.dataset.act === "notify") {
    if (change.developerEmail !== session.email) return;
    await API.updateChange(change.uid, { status: "Tester Notified", notifiedAt: new Date().toISOString() });
    toast("Tester notified", change.tester + " was notified about " + change.changeId + ".");
  }

  if (btn.dataset.act === "mail") {
    if (change.developerEmail !== session.email) return;
    await API.updateChange(change.uid, { status: "Tester Notified", notifiedAt: new Date().toISOString() });
    window.location.href = mailtoLink(change);
    toast("Mail draft opened", "A mail to " + change.testerEmail + " was prepared in your mail client.");
  }

  if (btn.dataset.act === "accept" || btn.dataset.act === "reject") {
    if (change.testerEmail !== session.email) return;
    openReview(change, btn.dataset.act === "accept");
  }
});

el.q.addEventListener("input", renderChanges);
el.status.addEventListener("change", renderChanges);

/* ---------- stats ---------- */
function renderStats() {
  var by = function (s) { return changes.filter(function (c) { return c.status === s; }).length; };
  document.getElementById("st-total").textContent = changes.length;
  document.getElementById("st-notified").textContent = by("Tester Notified") + by("Accepted") + by("Rejected");
  document.getElementById("st-pending").textContent = by("Draft") + by("Tester Notified");
  document.getElementById("st-accepted").textContent = by("Accepted");
  document.getElementById("st-rejected").textContent = by("Rejected");
}

/* ---------- export ---------- */
function csvCell(value) {
  var text = String(value === undefined || value === null ? "" : value);
  // Guard against spreadsheet formula injection on export.
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function exportCsv() {
  var rows = visibleChanges();
  if (!rows.length) { toast("Nothing to export", "There are no change requests in the current view."); return; }
  var header = ["Change ID", "Type", "Priority", "Status", "Module", "Developer", "Tester",
    "Previous", "Updated", "Reason", "Tester Comment", "Created"];
  var csv = [header.map(csvCell).join(",")].concat(rows.map(function (c) {
    return [c.changeId, c.type, c.priority, c.status, c.module,
      c.developer, c.tester, c.previous, c.updated, c.reason, c.testerComment || "", c.createdAt]
      .map(csvCell).join(",");
  })).join("\r\n");

  var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "apmtraceback-changes.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

["btn-export", "btn-export-tester"].forEach(function (id) {
  var btn = document.getElementById(id);
  if (btn) btn.addEventListener("click", exportCsv);
});
