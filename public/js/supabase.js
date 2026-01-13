// js/supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://aazofjsssobejhkyyiqv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTI1NDUsImV4cCI6MjA3MzY4ODU0NX0.guYlxaV5RwTlTVFoUhpER0KWEIGPay8svLsxMwyRUyM"; // public, safe in client

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
