/* Paste your Firebase web app config here.
   Console -> Project settings -> Your apps -> Web app -> SDK setup and configuration. */
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE.firebaseapp.com",
  projectId: "REPLACE",
  storageBucket: "REPLACE.appspot.com",
  messagingSenderId: "REPLACE",
  appId: "REPLACE"
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("REPLACE");
