/* Login, registration and password reset backed by Firebase Auth. */
import { API, establishRecoverySession } from "./api.js?v=20260911";

function say(el, text, ok) {
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "err");
}

function busy(form, on) {
  form.querySelectorAll("button, input, select").forEach(function (n) { n.disabled = on; });
}

// createUser signs the new account in briefly; don't bounce to the dashboard for it.
var registering = false;
var recovering = /(?:[?#&])type=recovery(?:[&#]|$)/.test(location.href) ||
  new URLSearchParams(location.search).has("code");
var recoveryReady = false;

document.querySelectorAll(".tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".pane").forEach(function (p) { p.classList.remove("active"); });
    tab.classList.add("active");
    document.getElementById(tab.dataset.pane).classList.add("active");
  });
});

/* ---------- login ---------- */
document.getElementById("pane-login").addEventListener("submit", async function (e) {
  e.preventDefault();
  var msg = document.getElementById("login-msg");
  say(msg, "Signing in\u2026", true);
  busy(e.target, true);

  var result = await API.login(
    document.getElementById("login-email").value,
    document.getElementById("login-password").value
  );
  busy(e.target, false);
  if (!result.ok) { say(msg, result.error, false); return; }
  say(msg, "Signed in. Opening dashboard\u2026", true);
  setTimeout(function () { location.href = "dashboard.html"; }, 100);
});

/* ---------- register ---------- */
document.getElementById("pane-register").addEventListener("submit", async function (e) {
  e.preventDefault();
  var msg = document.getElementById("reg-msg");
  var password = document.getElementById("reg-password").value;
  if (password !== document.getElementById("reg-confirm").value) {
    say(msg, "Passwords do not match.", false);
    return;
  }

  say(msg, "Creating account\u2026", true);
  busy(e.target, true);
  registering = true;
  var result = await API.register(
    document.getElementById("reg-name").value,
    document.getElementById("reg-email").value,
    password,
    document.getElementById("reg-role").value
  );
  registering = false;
  busy(e.target, false);
  if (!result.ok) { say(msg, result.error, false); return; }

  e.target.reset();
  say(msg, result.needsConfirmation
    ? "Account created. Confirm your email from the link we sent, then log in."
    : "Account created. You can log in now.", true);
});

/* ---------- reset ---------- */
document.getElementById("pane-reset").addEventListener("submit", async function (e) {
  e.preventDefault();
  var msg = document.getElementById("rst-msg");
  say(msg, "Sending\u2026", true);
  busy(e.target, true);

  var result = await API.sendReset(document.getElementById("rst-email").value);
  busy(e.target, false);
  if (!result.ok) { say(msg, result.error, false); return; }

  e.target.reset();
  say(msg, "If that email is registered, a reset link is on its way. Check your inbox and spam folder.", true);
});

/* ---------- new password from a reset link ---------- */
function showPane(id) {
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
  document.querySelectorAll(".pane").forEach(function (p) { p.classList.remove("active"); });
  document.getElementById(id).classList.add("active");
}

if (recovering) {
  showPane("pane-newpw");
  recoveryReady = new URLSearchParams(location.hash.slice(1)).has("access_token");
  establishRecoverySession().then(function (ready) {
    recoveryReady = recoveryReady || ready;
    if (!ready) {
      say(document.getElementById("np-msg"), "This reset link is invalid or has expired. Request a new one.", false);
    }
  });
}

document.getElementById("pane-newpw").addEventListener("submit", async function (e) {
  e.preventDefault();
  var msg = document.getElementById("np-msg");
  var password = document.getElementById("np-password").value;
  if (password !== document.getElementById("np-confirm").value) {
    say(msg, "Passwords do not match.", false);
    return;
  }
  if (!recoveryReady) {
    say(msg, "Waiting for reset link verification. Request a new link if this continues.", false);
    return;
  }

  busy(e.target, true);
  var result = await API.setPassword(password);
  busy(e.target, false);
  if (!result.ok) { say(msg, result.error, false); return; }

  e.target.reset();
  say(msg, "Password updated. Redirecting to the dashboard\u2026", true);
  setTimeout(function () { location.href = "dashboard.html"; }, 1200);
});

var redirected = false;
API.onSession(function (session, mode) {
  if (mode === "recovery") {
    recovering = true;
    recoveryReady = true;
    showPane("pane-newpw");
    return;
  }
  if (recovering) {
    showPane("pane-newpw");
    return;
  }
  if (session && !redirected && !registering) {
    redirected = true;
    location.replace("dashboard.html");
  }
});
