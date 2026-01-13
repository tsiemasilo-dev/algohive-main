// /js/auth.js
import { supabase } from "./supabase.js";

const isLikelyCorsError = (error) => {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("cors") || msg.includes("origin");
};

async function signInViaProxy(email, password) {
  const res = await fetch("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Sign in failed.");
  }

  const { session, user } = await res.json();
  if (session?.access_token && session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  }

  return { user, session };
}

async function signUpViaProxy(email, password, metadata = {}) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, metadata })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Sign up failed.");
  }

  return res.json();
}

// SIGN IN
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return data;          // { user, session }

  if (isLikelyCorsError(error)) {
    return signInViaProxy(email, password);
  }

  throw error;                      // surfaces "Invalid login" or "Email not confirmed"
}

// SIGN UP (send them back to auth.html with a banner after confirming)
export async function signUp(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: "/auth.html?confirmed=1", data: metadata }
  });
  if (!error) return data;          // { user, session }

  if (isLikelyCorsError(error)) {
    return signUpViaProxy(email, password, metadata);
  }

  throw error;                      // surfaces "User already registered" etc.
}

// SIGN OUT
export async function signOut() {
  await supabase.auth.signOut();
  location.replace("/auth.html");
}

// GET CURRENT SESSION
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
