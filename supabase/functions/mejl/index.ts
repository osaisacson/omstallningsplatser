// Skickar mejlen i email_outbox via Gmail (omstallningsplatser@gmail.com).
// Anropas av databasen när nya mejl läggs i kön (och en gång i timmen för att försöka igen).
// Driftsätt med "Verify JWT" avstängt; skyddas av push_secret i app_settings, som push-funktionen.
// Kräver två hemligheter under Edge Functions → Secrets:
//   GMAIL_USER          = omstallningsplatser@gmail.com
//   GMAIL_APP_PASSWORD  = applösenordet från Google (16 tecken)
import nodemailer from 'npm:nodemailer@6.9.16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const { data: rows } = await sb.from('app_settings').select('key, value').eq('key', 'push_secret');
  const secret = rows?.[0]?.value;
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('Nej', { status: 401 });

  const user = Deno.env.get('GMAIL_USER'), pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) return new Response('Gmail är inte inställt (GMAIL_USER, GMAIL_APP_PASSWORD)', { status: 500 });

  // Port 465 (SSL) – Supabase släpper inte igenom 25 och 587.
  const mail = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });

  // Hämtar och "låser" upp till 40 mejl åt gången, så att två anrop aldrig skickar samma mejl.
  const { data: batch, error } = await sb.rpc('claim_outbox', { p_limit: 40 });
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0, failed = 0;
  for (const m of batch || []) {
    try {
      await mail.sendMail({ from: `Omställningsplatser <${user}>`, to: m.to_email, subject: m.subject, text: m.body });
      await sb.from('email_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', m.id);
      sent++;
    } catch (e) {
      await sb.from('email_outbox').update({ error: String((e as Error)?.message || e).slice(0, 500), claimed_at: null }).eq('id', m.id);
      failed++;
    }
  }
  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } });
});
