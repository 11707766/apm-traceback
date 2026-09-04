/* Local persistence layer for APMTRACEBACK (browser localStorage). */
(function (global) {
  "use strict";

  var KEYS = {
    users: "apm_users",
    changes: "apm_changes",
    mail: "apm_mail_log",
    audit: "apm_audit",
    resets: "apm_resets",
    session: "apm_session"
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  var Store = {
    KEYS: KEYS,

    /* ---------- users ---------- */
    users: function () { return read(KEYS.users, []); },

    findUser: function (email) {
      var target = normEmail(email);
      return Store.users().filter(function (u) { return u.email === target; })[0] || null;
    },

    testers: function () {
      return Store.users().filter(function (u) { return u.role === "tester"; });
    },

    register: function (name, email, password, role) {
      name = String(name || "").trim();
      email = normEmail(email);
      if (!name) return { ok: false, error: "Full name is required." };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
      if (String(password).length < 8) return { ok: false, error: "Password must be at least 8 characters." };
      if (role !== "tester" && role !== "developer") return { ok: false, error: "Select a valid role." };
      if (Store.findUser(email)) return { ok: false, error: "An account with this email already exists." };

      var salt = APMHash.newSalt();
      var users = Store.users();
      users.push({
        id: APMHash.randomHex(8),
        name: name,
        email: email,
        role: role,
        salt: salt,
        hash: APMHash.hashPassword(password, salt),
        createdAt: new Date().toISOString()
      });
      write(KEYS.users, users);
      Store.audit("Account created", name + " registered as " + role, email);
      return { ok: true };
    },

    login: function (email, password) {
      var user = Store.findUser(email);
      // Same message for unknown account and wrong password (no user enumeration).
      var failed = { ok: false, error: "Invalid email or password." };
      if (!user) return failed;
      if (APMHash.hashPassword(password, user.salt) !== user.hash) return failed;

      sessionStorage.setItem(KEYS.session, JSON.stringify({
        id: user.id, email: user.email, name: user.name, role: user.role
      }));
      Store.audit("Login", user.name + " signed in", user.email);
      return { ok: true, user: user };
    },

    session: function () {
      try { return JSON.parse(sessionStorage.getItem(KEYS.session) || "null"); }
      catch (e) { return null; }
    },

    logout: function () {
      var s = Store.session();
      if (s) Store.audit("Logout", s.name + " signed out", s.email);
      sessionStorage.removeItem(KEYS.session);
    },

    changePassword: function (email, oldPassword, newPassword) {
      var users = Store.users();
      var target = normEmail(email);
      var user = users.filter(function (u) { return u.email === target; })[0];
      if (!user) return { ok: false, error: "Account not found." };
      if (APMHash.hashPassword(oldPassword, user.salt) !== user.hash) {
        return { ok: false, error: "Current password is incorrect." };
      }
      if (String(newPassword).length < 8) return { ok: false, error: "New password must be at least 8 characters." };

      user.salt = APMHash.newSalt();
      user.hash = APMHash.hashPassword(newPassword, user.salt);
      write(KEYS.users, users);
      Store.audit("Password changed", user.name + " updated the account password", user.email);
      return { ok: true };
    },

    /* ---------- password reset ---------- */
    requestReset: function (email) {
      var user = Store.findUser(email);
      if (!user) return { ok: false, error: "No account is registered with this email." };

      var token = APMHash.randomHex(4).toUpperCase();
      var resets = read(KEYS.resets, {});
      resets[user.email] = {
        tokenHash: APMHash.sha256(token),
        expiresAt: Date.now() + 15 * 60 * 1000
      };
      write(KEYS.resets, resets);
      Store.mail(user.email, "APMTRACEBACK password reset",
        "A password reset was requested for your account. Reset token: " + token + " (valid 15 minutes).");
      Store.audit("Reset requested", "Password reset token issued", user.email);
      return { ok: true, token: token };
    },

    resetPassword: function (email, token, newPassword) {
      var users = Store.users();
      var target = normEmail(email);
      var user = users.filter(function (u) { return u.email === target; })[0];
      var resets = read(KEYS.resets, {});
      var entry = user ? resets[user.email] : null;

      if (!user || !entry) return { ok: false, error: "Invalid or expired reset token." };
      if (Date.now() > entry.expiresAt) {
        delete resets[user.email];
        write(KEYS.resets, resets);
        return { ok: false, error: "Invalid or expired reset token." };
      }
      if (APMHash.sha256(String(token).trim().toUpperCase()) !== entry.tokenHash) {
        return { ok: false, error: "Invalid or expired reset token." };
      }
      if (String(newPassword).length < 8) return { ok: false, error: "Password must be at least 8 characters." };

      user.salt = APMHash.newSalt();
      user.hash = APMHash.hashPassword(newPassword, user.salt);
      write(KEYS.users, users);
      delete resets[user.email];
      write(KEYS.resets, resets);
      Store.audit("Password reset", user.name + " reset the account password", user.email);
      return { ok: true };
    },

    /* ---------- change requests ---------- */
    changes: function () { return read(KEYS.changes, []); },

    addChange: function (data) {
      var changes = Store.changes();
      var record = Object.assign({
        uid: APMHash.randomHex(8),
        status: "Draft",
        createdAt: new Date().toISOString(),
        history: []
      }, data);
      changes.unshift(record);
      write(KEYS.changes, changes);
      Store.audit("Change raised", record.changeId, record.developerEmail);
      return record;
    },

    updateChange: function (uid, patch) {
      var changes = Store.changes();
      var item = changes.filter(function (c) { return c.uid === uid; })[0];
      if (!item) return null;
      Object.assign(item, patch);
      write(KEYS.changes, changes);
      return item;
    },

    /* ---------- logs ---------- */
    mailLog: function () { return read(KEYS.mail, []); },

    mail: function (to, subject, body) {
      var log = Store.mailLog();
      log.unshift({
        id: APMHash.randomHex(6),
        to: to,
        subject: subject,
        body: body,
        sentAt: new Date().toISOString()
      });
      write(KEYS.mail, log.slice(0, 200));
    },

    auditLog: function () { return read(KEYS.audit, []); },

    audit: function (action, detail, actor) {
      var log = Store.auditLog();
      log.unshift({
        id: APMHash.randomHex(6),
        action: action,
        detail: detail,
        actor: actor || "system",
        at: new Date().toISOString()
      });
      write(KEYS.audit, log.slice(0, 300));
    }
  };

  global.Store = Store;
})(window);
