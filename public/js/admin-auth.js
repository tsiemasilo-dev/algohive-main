import { supabase } from "./supabase.js";

const ADMIN_EMAILS = [
  "tsie.masilo@thealgohive.com"
];

export async function checkAdminAccess() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    redirectToLogin();
    return null;
  }
  
  const userEmail = session.user?.email?.toLowerCase();
  
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    redirectToUnauthorized();
    return null;
  }
  
  supabase.auth.onAuthStateChange((_ev, sess) => {
    if (!sess) redirectToLogin();
  });
  
  return session;
}

function redirectToLogin() {
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  location.replace(`/auth.html?tab=in&redirect=${next}`);
}

function redirectToUnauthorized() {
  location.replace("/home.html");
}

export function isAdmin(email) {
  return ADMIN_EMAILS.includes(email?.toLowerCase());
}

export { ADMIN_EMAILS };
