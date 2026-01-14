const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aazofjsssobejhkyyiqv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9manNzc29iZWpoa3l5aXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTI1NDUsImV4cCI6MjA3MzY4ODU0NX0.guYlxaV5RwTlTVFoUhpER0KWEIGPay8svLsxMwyRUyM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const email = (body.email || '').trim().toLowerCase();
  const fullName = (body.full_name || '').trim();
  const invitedBy = (body.invited_by || '').trim();

  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!fullName) return res.status(400).json({ error: 'Full name is required' });
  if (!invitedBy) return res.status(400).json({ error: 'Invited by is required' });

  const { data: existingInvite, error: lookupError } = await supabase
    .from('invites')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) return res.status(500).json({ error: lookupError.message });
  if (existingInvite) {
    return res.status(409).json({ error: 'You have already accepted the invite.' });
  }

  const payload = {
    email,
    full_name: fullName,
    invited_by: invitedBy,
    accepted_at: new Date().toISOString(),
    status: 'accepted'
  };

  const { data, error } = await supabase
    .from('invites')
    .insert(payload)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ data });
};
