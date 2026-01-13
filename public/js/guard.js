// js/guard.js
import { supabase } from "./supabase.js";

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname);
    location.replace(`/index.html?redirect=${next}`);
  }
})();
