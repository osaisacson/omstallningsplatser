// Kalenderprenumeration: /functions/v1/kalender?t=<hemlig nyckel>
// Ger en .ics med evenemangen personen är intresserad av, kommer på eller själv lagt upp.
// Telefonens kalender hämtar länken regelbundet, så ändrade eller borttagna evenemang uppdateras av sig själva.
// Driftsätt med "Verify JWT" avstängt (kalenderappar skickar ingen inloggning).
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = 'https://osaisacson.github.io/omstallningsplatser/';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const z = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (t: string) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
// Samma regel som i appen: alla ser evenemanget, om det inte bara är för vissa grupper.
const open = (p: any) => !p.visible_to || p.visible_to.length === 0;
const title = (c: string) => (c || '').split(/\n|(?<=[.!?])\s/)[0].slice(0, 80) || 'Evenemang';

function ics(posts: any[], feed = false) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Omställningsplatser//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (feed) lines.push('X-WR-CALNAME:Omställningsplatser', 'X-WR-TIMEZONE:Europe/Stockholm', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
  for (const p of posts) {
    if (!p.event_start) continue;
    const end = p.event_end || new Date(new Date(p.event_start).getTime() + 2 * 3600e3).toISOString();
    const url = `${APP_URL}#/post/${p.id}`;
    lines.push('BEGIN:VEVENT', `UID:${p.id}@kooperativsystemet`,   // appens gamla namn – UID får inte ändras, då dubbleras evenemangen i kalendrar
      `SEQUENCE:${Math.floor(new Date(p.updated_at || p.created_at).getTime() / 1000) % 2147483647}`,
      `DTSTAMP:${z(new Date().toISOString())}`, `LAST-MODIFIED:${z(p.updated_at || p.created_at)}`,
      `DTSTART:${z(p.event_start)}`, `DTEND:${z(end)}`, `SUMMARY:${esc(title(p.caption))}`,
      `LOCATION:${esc([p.event_address, p.event_city].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${esc((p.caption || '') + '\n\n' + url)}`, `URL:${url}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  // Ett enskilt evenemang: ?e=<inläggets id> (används av "Lägg till i min kalender" på iPhone)
  const one = params.get('e');
  if (one) {
    if (!/^[0-9a-f-]{36}$/.test(one)) return new Response('Fel id', { status: 400 });
    const { data: p } = await sb.from('posts').select('id, caption, event_start, event_end, event_address, event_city, created_at, updated_at, visible_to').eq('id', one).eq('is_event', true).maybeSingle();
    // Länken kräver ingen inloggning, så den lämnar bara ut evenemang som alla får se.
    if (!p || !open(p)) return new Response('Evenemanget finns inte', { status: 404 });
    return new Response(ics([p]), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="evenemang.ics"' } });
  }
  const token = params.get('t');
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) return new Response('Saknar kalendernyckel', { status: 400 });
  const { data: who } = await sb.from('user_secrets').select('user_id').eq('calendar_token', token).maybeSingle();
  if (!who) return new Response('Okänd kalender', { status: 404 });

  const [{ data: rsvps }, { data: own }, { data: groups }, { data: editor }] = await Promise.all([
    sb.from('event_rsvps').select('post_id').eq('user_id', who.user_id),
    sb.from('posts').select('id').eq('author_id', who.user_id).eq('is_event', true),
    sb.from('group_members').select('group_id').eq('user_id', who.user_id),
    sb.from('editors').select('user_id').eq('user_id', who.user_id).not('accepted_at', 'is', null).maybeSingle(),
  ]);
  const mine = new Set((groups || []).map((g) => g.group_id));
  // Bara evenemang personen får se i appen: öppna för alla, egna, eller för en grupp personen är med i (Redaktionen ser allt).
  const canSee = (p: any) => open(p) || p.author_id === who.user_id || !!editor || p.visible_to.some((g: string) => mine.has(g));
  const ids = [...new Set([...(rsvps || []).map((r) => r.post_id), ...(own || []).map((p) => p.id)])];
  const { data: posts } = ids.length
    ? await sb.from('posts').select('id, caption, event_start, event_end, event_address, event_city, created_at, updated_at, author_id, visible_to').in('id', ids).eq('is_event', true)
    : { data: [] };

  return new Response(ics((posts || []).filter(canSee), true), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900', 'Content-Disposition': 'inline; filename="omstallningsplatser.ics"' },
  });
});
