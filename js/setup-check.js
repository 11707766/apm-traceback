import { isConfigured } from "./firebase-config.js";

if (!isConfigured) {
  document.body.insertAdjacentHTML("afterbegin",
    '<div class="setup-banner">Firebase is not configured yet \u2014 paste your project config into ' +
    "<code>js/firebase-config.js</code> to enable login and cross-device sync.</div>");
}
