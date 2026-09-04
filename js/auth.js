/* Login, registration and password reset for APMTRACEBACK. */
(function () {
  "use strict";

  if (Store.session()) {
    location.replace("dashboard.html");
    return;
  }

  function say(el, text, ok) {
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "err");
  }

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".pane").forEach(function (p) { p.classList.remove("active"); });
      tab.classList.add("active");
      document.getElementById(tab.dataset.pane).classList.add("active");
    });
  });

  /* ---------- login ---------- */
  document.getElementById("pane-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = document.getElementById("login-msg");
    var result = Store.login(
      document.getElementById("login-email").value,
      document.getElementById("login-password").value
    );
    if (!result.ok) { say(msg, result.error, false); return; }
    location.href = "dashboard.html";
  });

  /* ---------- register ---------- */
  document.getElementById("pane-register").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = document.getElementById("reg-msg");
    var password = document.getElementById("reg-password").value;
    if (password !== document.getElementById("reg-confirm").value) {
      say(msg, "Passwords do not match.", false);
      return;
    }
    var result = Store.register(
      document.getElementById("reg-name").value,
      document.getElementById("reg-email").value,
      password,
      document.getElementById("reg-role").value
    );
    if (!result.ok) { say(msg, result.error, false); return; }

    e.target.reset();
    say(msg, "Account created. You can log in now.", true);
  });

  /* ---------- reset ---------- */
  document.getElementById("btn-token").addEventListener("click", function () {
    var msg = document.getElementById("rst-msg");
    var result = Store.requestReset(document.getElementById("rst-email").value);
    if (!result.ok) { say(msg, result.error, false); return; }
    document.getElementById("rst-token").value = result.token;
    say(msg, "Reset token " + result.token + " issued and written to the mail log. Valid 15 minutes.", true);
  });

  document.getElementById("pane-reset").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = document.getElementById("rst-msg");
    var password = document.getElementById("rst-password").value;
    if (password !== document.getElementById("rst-confirm").value) {
      say(msg, "Passwords do not match.", false);
      return;
    }
    var result = Store.resetPassword(
      document.getElementById("rst-email").value,
      document.getElementById("rst-token").value,
      password
    );
    if (!result.ok) { say(msg, result.error, false); return; }

    e.target.reset();
    say(msg, "Password updated. Log in with your new password.", true);
  });
})();
