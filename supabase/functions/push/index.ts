// Skickar push-notiser. Anropas av databasen (se notify_push i setup.sql) när ett meddelande eller en ansökan kommer in.
// Sätter också siffran på appikonen: olästa meddelanden + saker att göra med finansiering.
// Driftsätt med "Verify JWT" avstängt; anropet skyddas av en hemlig nyckel i tabellen app_settings.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const kr = (n: number) => new Intl.NumberFormat('sv-SE').format(Math.round(Number(n) || 0)) + ' kr';

// Siffran på appikonen: olästa meddelanden och notiser, finansiering att göra, och för Redaktionen anmälningar och adminförfrågningar.
async function badgeFor(userId: string) {
  const head = { count: 'exact' as const, head: true };
  const { data: ed } = await sb.from('editors').select('user_id').eq('user_id', userId).not('accepted_at', 'is', null).maybeSingle();
  const [m, c, n, t, r, a] = await Promise.all([
    sb.from('messages').select('id', head).eq('to_id', userId).eq('read', false),
    sb.rpc('chat_unread_for', { p_user: userId }).then((r: any) => ({ count: r.data || 0 })),
    sb.from('notifications').select('id', head).eq('user_id', userId).eq('read', false),
    sb.from('comments').select('id, post:posts!inner(author_id)', head).in('status', ['applied', 'granted']).eq('post.author_id', userId),
    ed ? sb.from('reports').select('id', head).is('done_at', null) : Promise.resolve({ count: 0 }),
    ed ? sb.from('admin_requests').select('id', head).eq('status', 'pending') : Promise.resolve({ count: 0 }),
  ]);
  return [m, c, n, t, r, a].reduce((sum, x: any) => sum + (x.count || 0), 0);
}

Deno.serve(async (req) => {
  const { data: rows } = await sb.from('app_settings').select('key, value');
  const s = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  if (!s.push_secret || req.headers.get('x-push-secret') !== s.push_secret) return new Response('Nej', { status: 401 });
  webpush.setVapidDetails(s.vapid_subject || 'mailto:omstallningsplatser@gmail.com', s.vapid_public, s.vapid_private);

  const { type, id } = await req.json();
  let to: string | null = null, title = 'Omställningsplatser', body = '', url = './';
  let many: string[] = [];   // samtal med flera / hela gruppen: alla utom avsändaren och de som stängt av notiser
  if (type === 'messages') {
    const { data: m } = await sb.from('messages').select('from_id, to_id, body, sender:profiles!messages_from_id_fkey(name)').eq('id', id).single();
    if (!m) return new Response('ok');
    to = m.to_id; title = `Meddelande från ${(m as any).sender?.name || 'någon'}`;
    body = String(m.body).replace(/#\/post\/[0-9a-f-]{36}/g, '').trim().slice(0, 120); url = `./#/meddelanden/${m.from_id}`;
  } else if (type === 'comments') {
    const { data: c } = await sb.from('comments').select('post_id, applied_amount, group:groups(name), post:posts(author_id)').eq('id', id).single();
    if (!c) return new Response('ok');
    to = (c as any).post?.author_id; title = 'Ny ansökan om pengar';
    body = `${(c as any).group?.name || 'En grupp'} söker ${kr(c.applied_amount)}`; url = `./#/post/${c.post_id}`;
  } else if (type === 'chat_messages') {
    const { data: m } = await sb.from('chat_messages').select('chat_id, from_id, body, sender:profiles!chat_messages_from_id_fkey(name), chat:chats(title, group_id, group:groups(name))').eq('id', id).single();
    if (!m) return new Response('ok');
    const chat = (m as any).chat;
    const members = chat?.group_id
      ? ((await sb.from('group_members').select('user_id').eq('group_id', chat.group_id)).data || []).map((r: any) => r.user_id)
      : ((await sb.from('chat_members').select('user_id').eq('chat_id', m.chat_id)).data || []).map((r: any) => r.user_id);
    const muted = new Set(((await sb.from('chat_members').select('user_id').eq('chat_id', m.chat_id).eq('muted', true)).data || []).map((r: any) => r.user_id));
    many = members.filter((u: string) => u !== m.from_id && !muted.has(u));
    const who = (m as any).sender?.name || 'Någon';
    title = chat?.group?.name || chat?.title || who;
    body = (title === who ? '' : `${who.split(' ')[0]}: `) + String(m.body).trim().slice(0, 120);
    url = `./#/samtal/${m.chat_id}`;
  }
  const targets = to ? [to] : many;
  if (!targets.length) return new Response('ok');

  for (const user of targets) {
    const badge = await badgeFor(user);
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', user);
    await Promise.all((subs || []).map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, url, badge }));
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }));
  }
  return new Response('ok');
});
