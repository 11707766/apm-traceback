/* Firebase Auth + Firestore backend for APMTRACEBACK.
   Data lives in the cloud, so every device sees the same change requests. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, sendPasswordResetEmail, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, onSnapshot, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

if (!isConfigured) {
  throw new Error("Firebase is not configured. Fill in js/firebase-config.js.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

const USERS = collection(db, "users");
const CHANGES = collection(db, "changes");

function friendly(error) {
  const map = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/invalid-login-credentials": "Invalid email or password.",
    "auth/wrong-password": "Invalid email or password.",
    "auth/user-not-found": "Invalid email or password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
    "auth/network-request-failed": "Network error. Check your connection."
  };
  return map[error && error.code] || (error && error.message) || "Something went wrong.";
}

export const API = {
  async register(name, email, password, role) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    if (!name) return { ok: false, error: "Full name is required." };
    if (String(password).length < 8) return { ok: false, error: "Password must be at least 8 characters." };
    if (role !== "tester" && role !== "developer") return { ok: false, error: "Select a valid role." };

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(USERS, cred.user.uid), {
        name: name,
        email: email,
        role: role,
        createdAt: new Date().toISOString()
      });
      await signOut(auth);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  },

  async login(email, password) {
    try {
      await signInWithEmailAndPassword(auth, String(email).trim().toLowerCase(), password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  },

  logout() { return signOut(auth); },

  async sendReset(email) {
    try {
      await sendPasswordResetEmail(auth, String(email).trim().toLowerCase());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  },

  async changePassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) return { ok: false, error: "You are signed out." };
    if (String(newPassword).length < 8) return { ok: false, error: "New password must be at least 8 characters." };
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  },

  /* Resolves with the signed-in profile, or null when signed out. */
  onSession(callback) {
    return onAuthStateChanged(auth, async function (user) {
      if (!user) { callback(null); return; }
      const snap = await getDoc(doc(USERS, user.uid));
      const profile = snap.exists() ? snap.data() : {};
      callback({
        uid: user.uid,
        email: user.email,
        name: profile.name || user.email,
        role: profile.role || "developer"
      });
    });
  },

  async testers() {
    const snap = await getDocs(query(USERS, where("role", "==", "tester")));
    return snap.docs.map(function (d) { return d.data(); });
  },

  /* Live feed: fires again on every remote insert or update. */
  subscribeChanges(callback) {
    return onSnapshot(query(CHANGES, orderBy("createdAt", "desc")), function (snap) {
      callback(snap.docs.map(function (d) {
        return Object.assign({ uid: d.id }, d.data());
      }));
    });
  },

  addChange(data) {
    return addDoc(CHANGES, Object.assign({
      status: "Draft",
      createdAt: new Date().toISOString()
    }, data));
  },

  updateChange(uid, patch) {
    return updateDoc(doc(CHANGES, uid), patch);
  }
};
