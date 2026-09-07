/* Supabase Auth + Postgres backend for APMTRACEBACK.
   Data lives in the cloud, so every device sees the same change requests. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "./supabase-config.js";

if (!isConfigured) {
  throw new Error("Supabase is not configured. Fill in js/supabase-config.js.");
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function establishRecoverySession() {
  const code = new URLSearchParams(location.search).get("code");
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return false;
  }
  const { data } = await db.auth.getSession();
  return Boolean(data.session && data.session.user);
}

const COLUMNS = {
  changeId: "change_id",
  type: "type",
  priority: "priority",
  status: "status",
  module: "module",
  previous: "previous_text",
  updated: "updated_text",
  reason: "reason",
  developer: "developer",
  developerEmail: "developer_email",
  tester: "tester",
  testerEmail: "tester_email",
  testerComment: "tester_comment",
  createdAt: "created_at",
  notifiedAt: "notified_at",
  reviewedAt: "reviewed_at",
  updatedAt: "updated_at"
};

function toRow(data) {
  const row = {};
  Object.keys(data).forEach(function (key) {
    if (COLUMNS[key]) row[COLUMNS[key]] = data[key];
  });
  return row;
}

function fromRow(row) {
  const item = { uid: row.id };
  Object.keys(COLUMNS).forEach(function (key) {
    item[key] = row[COLUMNS[key]];
  });
  return item;
}

function friendly(error) {
  const text = String((error && error.message) || "Something went wrong.");
  if (/invalid login credentials/i.test(text)) return "Invalid email or password.";
  if (/already registered|already been registered/i.test(text)) return "An account with this email already exists.";
  if (/password should be at least/i.test(text)) return "Password must be at least 8 characters.";
  if (/invalid email|email address .* invalid/i.test(text)) return "Enter a valid email address.";
  if (/email not confirmed/i.test(text)) return "Confirm your email address first, then log in.";
  if (/rate limit|too many/i.test(text)) return "Too many attempts. Try again in a few minutes.";
  return text;
}

async function currentProfile(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const fallback = {
    id: user.id,
    name: meta.name || user.email,
    email: user.email,
    role: meta.role === "tester" ? "tester" : "developer"
  };
  const lookup = await db.from("profiles").select("id, name, email, role").eq("id", user.id).maybeSingle();
  let profile = lookup.data;

  // The first session after signup has no profile row yet.
  if (!profile) {
    const created = await db.from("profiles").insert(fallback).select("id, name, email, role").single();
    if (created.error) throw created.error;
    profile = created.data;
  }
  return { uid: user.id, email: profile.email, name: profile.name, role: profile.role };
}

export const API = {
  async register(name, email, password, role) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    if (!name) return { ok: false, error: "Full name is required." };
    if (String(password).length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    if (role !== "tester" && role !== "developer") return { ok: false, error: "Select a valid role." };

    const { data, error } = await db.auth.signUp({
      email: email,
      password: password,
      options: { data: { name: name, role: role } }
    });
    if (error) return { ok: false, error: friendly(error) };

    if (data.session) {
      await currentProfile(data.user);
      await db.auth.signOut();
      return { ok: true };
    }
    return { ok: true, needsConfirmation: true };
  },

  async login(email, password) {
    const { error } = await db.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: password
    });
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true };
  },

  logout() { return db.auth.signOut(); },

  async sendReset(email) {
    const redirectTo = location.origin + location.pathname.replace(/[^/]*$/, "index.html");
    const { error } = await db.auth.resetPasswordForEmail(
      String(email).trim().toLowerCase(), { redirectTo: redirectTo }
    );
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true };
  },

  /* Used after following a reset link, where the recovery session is already active. */
  async setPassword(newPassword) {
    if (String(newPassword).length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true };
  },

  async changePassword(currentPassword, newPassword) {
    const { data } = await db.auth.getUser();
    if (!data || !data.user) return { ok: false, error: "You are signed out." };
    if (String(newPassword).length < 8) return { ok: false, error: "New password must be at least 8 characters." };

    const check = await db.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
    if (check.error) return { ok: false, error: "Current password is incorrect." };

    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true };
  },

  /* Calls back with the signed-in profile, null when signed out,
     or (null, "recovery") when the user arrived from a reset link. */
  onSession(callback) {
    db.auth.getSession().then(async function (res) {
      callback(await currentProfile(res.data.session && res.data.session.user));
    });
    return db.auth.onAuthStateChange(async function (event, session) {
      if (event === "PASSWORD_RECOVERY") { callback(null, "recovery"); return; }
      callback(await currentProfile(session && session.user));
    });
  },

  async testers() {
    const { data } = await db.from("profiles").select("name, email").eq("role", "tester");
    return data || [];
  },

  /* Live feed: refetches whenever any device inserts or updates a row. */
  subscribeChanges(callback) {
    async function load() {
      const { data } = await db.from("changes").select("*").order("created_at", { ascending: false });
      callback((data || []).map(fromRow));
    }
    load();
    const channel = db
      .channel("changes-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "changes" }, load)
      .subscribe();
    return function () { db.removeChannel(channel); };
  },

  addChange(data) {
    return db.from("changes").insert(toRow(Object.assign({ status: "Draft" }, data)));
  },

  updateChange(uid, patch) {
    return db.from("changes").update(toRow(patch)).eq("id", uid);
  }
};
