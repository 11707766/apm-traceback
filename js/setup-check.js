import { isConfigured } from "./supabase-config.js";

if (!isConfigured) {
  document.body.insertAdjacentHTML("afterbegin",
    '<div class="setup-banner">Supabase is not configured yet \u2014 paste your project URL and anon key into ' +
    "<code>js/supabase-config.js</code> to enable login and cross-device sync.</div>");
}
