// Riktig backend: Supabase (Postgres + inloggning + bildlagring). Se supabase/setup.sql för tabeller och regler.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { postThemes, financeSummary, visibleInFeed, normalizePostInput, normalizeUrl, geocode, eventColumns, sortCategories, resizeImage } from '../util.js';

// Kommer man hit via länken i ett "återställ lösenord"-mejl står det type=recovery i adressen.
// Läses av innan Supabase hinner ta bort det.
let recovering = /type=recovery/.test(location.hash);
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let meId = null;
let meEditor = false;
let linkError = null;

// Länken i vårt eget återställningsmejl pekar direkt på appen: ?token_hash=…&type=recovery
// (att länka till appens egen adress i stället för supabase.co gör att mejlet ser mindre misstänkt ut).
const qp = new URLSearchParams(location.search);
if (qp.get('token_hash') && qp.get('type') === 'recovery') {
  const { error } = await sb.auth.verifyOtp({ token_hash: qp.get('token_hash'), type: 'recovery' });
  history.replaceState(null, '', location.pathname);
  if (error) linkError = 'Länken har gått ut eller redan använts. Be om en ny.';
  else recovering = true;
}

const ok = ({ data, error }) => {
  if (error) throw new Error(translate(error.message));
  return data;
};
function translate(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'Fel e-post eller lösenord.';
  if (/already registered/i.test(msg)) return 'Det finns redan ett konto med den e-postadressen.';
  if (/Email not confirmed/i.test(msg)) return 'Bekräfta din e-post först (kolla inkorgen).';
  if (/row-level security/i.test(msg)) return 'Du har inte behörighet att göra det.';
  if (/Password should be/i.test(msg)) return 'Lösenordet måste vara minst 6 tecken.';
  return msg;
}
function needMe() { if (!meId) throw new Error('Du är inte inloggad.'); return meId; }

async function upload(file, max = 1280) {
  const blob = await resizeImage(file, max);
  const path = `${needMe()}/${crypto.randomUUID()}.jpg`;
  ok(await sb.storage.from('media').upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

const PROFILE = 'id,name,avatar_url';
const POST_SELECT = `*, author:profiles!posts_author_id_fkey(${PROFILE}), group:groups(id,name,avatar_url,city,region,country,postcode), slides:post_slides(id,position,image_url,text), comments(id,applied_amount,status,body,created_at,parent_id,author:profiles(id,name),group:groups(id,name)), memory_votes(user_id,theme,themes,created_at), event_rsvps(user_id,status)`;

function shapePost(p) {
  const cs = p.comments || [];
  const { comments, ...rest } = p;
  const votes = p.memory_votes || [];
  const first = cs.filter((c) => !c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return {
    ...rest, slides: (p.slides || []).sort((a, b) => a.position - b.position), comment_count: cs.length, finance: financeSummary(p, cs),
    first_comment: first ? { body: first.body, author: first.author, group: first.group } : null,
    memory_count: votes.length, memory_mine: votes.some((v) => v.user_id === meId), memory_votes: undefined,
    memory_themes: postThemes(p, votes),
    rsvp_interested: (p.event_rsvps || []).filter((r) => r.status === 'interested').length,
    rsvp_going: (p.event_rsvps || []).filter((r) => r.status === 'going').length,
    rsvp_mine: (p.event_rsvps || []).find((r) => r.user_id === meId)?.status || null, event_rsvps: undefined,
  };
}
// Inläggets egen plats används bara när det saknar grupp.
const placeCols = (v) => ({ country: v.place?.country ?? null, region: v.place?.region ?? null, city: v.place?.city ?? null, postcode: v.place?.postcode ?? null });
// Poäng = upp minus ner; min röst följer med.
const shapeFeedback = ({ feedback_votes: v = [], feedback_comments: c = [], ...f }) => ({
  ...f, score: v.reduce((n, x) => n + x.value, 0), ups: v.filter((x) => x.value > 0).length, downs: v.filter((x) => x.value < 0).length,
  my_vote: v.find((x) => x.user_id === meId)?.value || 0, comment_count: c[0]?.count ?? 0,
});
const place = ({ country, region, city }) => ({ country: (country || '').trim() || null, region: (region || '').trim() || null, city: (city || '').trim() || null });
// Plats + adress + kartposition (slås upp automatiskt).
const cleanHome = (h) => ({ country: (h.country || '').trim() || null, region: (h.region || '').trim() || null, city: (h.city || '').trim() || null,
  postcode: (h.postcode || '').trim() || null, district: h.district || null, level: ['country', 'region', 'city', 'district'].includes(h.level) ? h.level : 'city' });
async function located({ country, region, city, address, postcode, lat, lng }) {
  const p = { ...place({ country, region, city }), address: (address || '').trim() || null,
    // Postnumret (för stadsdelen) tas ur adressen om det inte valts ur adresslistan.
    postcode: (postcode || '').trim() || (String(address || '').match(/\b\d{3} ?\d{2}\b/) || [null])[0]?.replace(/^(\d{3})(\d{2})$/, '$1 $2') || null };
  const pos = lat != null && lng != null ? { lat, lng } : await geocode(p);   // vald adress har redan en position
  return { ...p, lat: pos?.lat ?? null, lng: pos?.lng ?? null };
}
async function ensureCategories(cats) {
  if (cats.length) ok(await sb.from('categories').upsert(cats.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true }));
}
async function writeSlides(postId, slides) {
  const keep = slides.filter((s) => s.id).map((s) => s.id);
  let del = sb.from('post_slides').delete().eq('post_id', postId);
  if (keep.length) del = del.not('id', 'in', `(${keep.join(',')})`);
  ok(await del);
  for (const [i, s] of slides.entries()) {
    const row = { post_id: postId, position: i, text: (s.text || '').trim(), image_url: s.file ? await upload(s.file) : s.image_url };
    if (s.id) ok(await sb.from('post_slides').update(row).eq('id', s.id));
    else ok(await sb.from('post_slides').insert(row));
  }
}

export const api = {
  mode: 'supabase',

  // ---- Konto ----
  onAuthChange(cb) {
    // Supabase rekommenderar att inte göra egna anrop direkt i den här callbacken.
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') recovering = true;
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) setTimeout(cb, 0);
    });
    return () => data.subscription.unsubscribe();
  },
  async getMe() {
    const { data: { session } } = await sb.auth.getSession();
    meId = session?.user?.id ?? null;
    if (!meId) return null;
    const [me, home, editor] = await Promise.all([
      sb.from('profiles').select('*').eq('id', meId).maybeSingle().then(ok),
      sb.from('home_places').select('*').eq('user_id', meId).maybeSingle().then((r) => r.data ?? null, () => null),
      sb.from('editors').select('user_id, accepted_at').eq('user_id', meId).maybeSingle().then((r) => r.data, () => null),
    ]);
    meEditor = !!editor?.accepted_at;
    // Inbjuden till Redaktionen men inte godkänt än: räknas inte som Redaktionen förrän man godkänt.
    return me && { ...me, home, is_editor: meEditor, editor_invited: !!editor && !editor.accepted_at };
  },
  async signUp({ email, password, name, nickname, avatarFile, home }) {
    if (!name.trim()) throw new Error('Skriv ditt namn.');
    // Platsen följer med kontot och sparas av databasen när kontot skapas (även om e-posten måste bekräftas först).
    const data = ok(await sb.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim(), nickname: (nickname || '').trim(), home: home ? cleanHome(home) : null } } }));
    if (!data.session) return { needsConfirmation: true };
    meId = data.user.id;
    if (avatarFile) await api.updateProfile({ avatarFile });
    return { needsConfirmation: false };
  },
  async signIn({ email, password }) { ok(await sb.auth.signInWithPassword({ email: email.trim(), password })); },
  async signOut() { await sb.auth.signOut(); meId = null; },
  async signInWithProvider(provider) {
    ok(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } }));
  },
  isRecovering() { return recovering; },
  takeLinkError() { const e = linkError; linkError = null; return e; },
  async requestPasswordReset(email) {
    if (!/^\S+@\S+\.\S+$/.test((email || '').trim())) throw new Error('Ange din e-postadress.');
    ok(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname }));
  },
  async setNewPassword(password) {
    if ((password || '').length < 6) throw new Error('Lösenordet måste vara minst 6 tecken.');
    ok(await sb.auth.updateUser({ password }));
    recovering = false;
  },
  async touch() { if (meId) await sb.rpc('touch'); },
  // Börjar ett besök (om man varit borta mer än 30 min) och svarar när man var här förra gången.
  async beginVisit() { if (!meId) return null; return ok(await sb.rpc('begin_visit')); },
  async updateProfile({ name, nickname, avatarFile, home }) {
    if (home) ok(await sb.from('home_places').upsert({ user_id: needMe(), ...cleanHome(home), updated_at: new Date().toISOString() }));
    const patch = {};
    if (name?.trim()) patch.name = name.trim();
    if (nickname !== undefined) patch.nickname = nickname.trim() || null;
    if (avatarFile) patch.avatar_url = await upload(avatarFile, 400);
    if (Object.keys(patch).length) ok(await sb.from('profiles').update(patch).eq('id', needMe()));
  },

  // ---- Personer ----
  async listUsers(q = '') {
    let query = sb.from('profiles').select(PROFILE).order('name');
    if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);
    return ok(await query);
  },
  async getUser(id) {
    const p = ok(await sb.from('profiles').select(`${PROFILE}, nickname, created_at, group_members(role, group:groups(id,name,avatar_url))`).eq('id', id).single());
    const { group_members, ...rest } = p;
    const ed = ok(await sb.from('editors').select('accepted_at').eq('user_id', id))[0];
    const editor = !!ed?.accepted_at;
    return { ...rest, is_editor: editor, editor_invited: !!ed && !ed.accepted_at, groups: group_members.map((m) => ({ ...m.group, role: m.role })) };
  },

  // ---- Grupper ----
  async listPlaces() { return ok(await sb.rpc('group_places')); },
  async listContentPlaces() { return ok(await sb.rpc('content_places')); },
  async listCountries() { return ok(await sb.rpc('available_countries')).map((r) => r.country); },
  async listGroups(q = '') {
    let query = sb.from('groups').select('*, group_members(user_id)').order('last_activity_at', { ascending: false });
    if (q.trim()) query = query.or(`name.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%,city.ilike.%${q.trim()}%,region.ilike.%${q.trim()}%,country.ilike.%${q.trim()}%`);
    return ok(await query).map(({ group_members, ...g }) => ({ ...g, member_count: group_members.length, member_ids: group_members.map((m) => m.user_id), is_member: group_members.some((m) => m.user_id === meId) }));
  },
  async myGroups() {
    const rows = ok(await sb.from('group_members').select('role, group:groups(id,name,avatar_url,city,region,country,postcode,locked)').eq('user_id', needMe()));
    return rows.map((r) => ({ ...r.group, role: r.role })).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  },
  async getGroup(id) {
    const g = ok(await sb.from('groups').select(`*, group_members(role, joined_at, user:profiles(${PROFILE})), highlights(*)`).eq('id', id).single());
    const { group_members, highlights, ...rest } = g;
    return {
      ...rest,
      members: group_members.sort((a, b) => (a.role === b.role ? a.joined_at.localeCompare(b.joined_at) : a.role === 'admin' ? -1 : 1)),
      highlights: highlights.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  },
  async createGroup({ name, description, homepage, country, region, city, address, postcode, lat, lng, avatarFile }) {
    if (!name?.trim()) throw new Error('Ge gruppen ett namn.');
    const url = normalizeUrl(homepage);
    const avatar_url = avatarFile ? await upload(avatarFile, 400) : null;
    return ok(await sb.from('groups').insert({ name: name.trim(), description: (description || '').trim(), homepage: url, ...(await located({ country, region, city, address, postcode, lat, lng })), avatar_url, created_by: needMe() }).select().single());
  },
  async updateGroup(id, { name, description, homepage, country, region, city, address, postcode, lat, lng, avatarFile }) {
    const patch = {};
    if (name?.trim()) patch.name = name.trim();
    if (description !== undefined) patch.description = description.trim();
    if (homepage !== undefined) patch.homepage = normalizeUrl(homepage);
    if (country !== undefined) Object.assign(patch, await located({ country, region, city, address, postcode, lat, lng }));
    if (avatarFile) patch.avatar_url = await upload(avatarFile, 400);
    ok(await sb.from('groups').update(patch).eq('id', id));
  },
  async deleteGroup(id) {
    // Gruppens inlägg tas bort först (annars blir de kvar som personliga inlägg).
    ok(await sb.from('posts').delete().eq('group_id', id));
    const rows = ok(await sb.from('groups').delete().eq('id', id).select('id'));
    if (!rows.length) throw new Error('Bara gruppens admins kan ta bort gruppen.');
  },
  async joinGroup(id) { ok(await sb.from('group_members').insert({ group_id: id, user_id: needMe() })); },
  async leaveGroup(id) { ok(await sb.from('group_members').delete().eq('group_id', id).eq('user_id', needMe())); },
  async setMemberRole(gid, uid, role) { ok(await sb.from('group_members').update({ role }).eq('group_id', gid).eq('user_id', uid)); },
  async addMember(gid, uid) { ok(await sb.rpc('add_member', { p_group: gid, p_user: uid })); },
  async removeMember(gid, uid) { ok(await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', uid)); },
  async saveHighlight(gid, { id, title, post_ids }) {
    if (!title?.trim()) throw new Error('Ge höjdpunkten ett namn.');
    if (id) ok(await sb.from('highlights').update({ title: title.trim(), post_ids }).eq('id', id));
    else ok(await sb.from('highlights').insert({ group_id: gid, title: title.trim(), post_ids }));
  },
  async deleteHighlight(id) { ok(await sb.from('highlights').delete().eq('id', id)); },

  // ---- Inlägg ----
  async listCategories() { return sortCategories(ok(await sb.from('categories').select('name')).map((c) => c.name)); },
  async listPosts({ kind = null, tag = null, groupId = null, authorId = null, q = '', feed = false, before = null, limit = 200 } = {}) {
    let query = sb.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).limit(limit);
    if (before) query = query.lt('created_at', before);
    if (kind) query = query.eq('kind', kind);
    if (tag) query = query.contains('categories', [tag]);
    if (groupId) query = query.eq('group_id', groupId);
    if (authorId) query = query.eq('author_id', authorId);
    if (q.trim()) query = query.ilike('caption', `%${q.trim()}%`);
    const ps = ok(await query).map(shapePost);
    return feed ? ps.filter(visibleInFeed) : ps;
  },
  async getPost(id) {
    const p = ok(await sb.from('posts').select(POST_SELECT).eq('id', id).maybeSingle());
    if (!p) throw new Error('Inlägget finns inte (längre).');
    const comments = ok(await sb.from('comments').select(`*, author:profiles(${PROFILE}), group:groups(id,name,avatar_url)`).eq('post_id', id).order('created_at'));
    const ids = comments.filter((c) => c.status).map((c) => c.id);
    const payouts = ids.length ? ok(await sb.from('payouts').select('*').in('comment_id', ids)) : [];
    const byId = Object.fromEntries(payouts.map((x) => [x.comment_id, x.details]));
    return { ...shapePost(p), comments: comments.map((c) => ({ ...c, payout: byId[c.id] ?? null })) };
  },
  async createPost(input) {
    const v = normalizePostInput(input);
    await ensureCategories(v.categories);
    const post = ok(await sb.from('posts').insert({
      author_id: needMe(), group_id: v.groupId, as_group: v.asGroup, visible_to: v.visibleTo?.length ? v.visibleTo : null, ...placeCols(v), caption: v.caption, kind: v.kind, is_resource: v.isResource, categories: v.categories,
      space_functions: v.space?.functions || [], space_cost: v.space?.cost ?? null, space_price: v.space?.price ?? null, ...eventColumns(v.event),
      fin_total: v.finance?.total ?? null, fin_mode: v.finance?.mode ?? null, fin_expires_at: v.finance?.expiresAt ?? null,
    }).select('id').single());
    await writeSlides(post.id, v.slides);
    return post.id;
  },
  async updatePost(id, input) {
    const v = normalizePostInput(input);
    await ensureCategories(v.categories);
    const current = ok(await sb.from('posts').select('fin_total').eq('id', id).single());
    if (current.fin_total != null && !v.finance) throw new Error('Ett finansieringsinlägg kan inte byta typ. Stäng det i stället via ··· på inlägget.');
    const patch = { group_id: v.groupId, as_group: v.asGroup, visible_to: v.visibleTo?.length ? v.visibleTo : null, ...placeCols(v), caption: v.caption, kind: v.kind, is_resource: v.isResource, categories: v.categories, updated_at: new Date().toISOString(),
      space_functions: v.space?.functions || [], space_cost: v.space?.cost ?? null, space_price: v.space?.price ?? null, ...eventColumns(v.event) };
    if (v.finance) {
      if (current.fin_total == null) Object.assign(patch, { fin_total: v.finance.total, fin_mode: v.finance.mode });
      patch.fin_expires_at = v.finance.expiresAt;
    }
    ok(await sb.from('posts').update(patch).eq('id', id));
    await writeSlides(id, v.slides);
  },
  async deletePost(id) {
    const rows = ok(await sb.from('posts').delete().eq('id', id).select('id'));
    if (!rows.length) throw new Error('Du får inte ta bort det här inlägget.');
  },
  async deleteComment(id) {
    const rows = ok(await sb.from('comments').delete().eq('id', id).select('id'));
    if (!rows.length) throw new Error('Det gick inte att ta bort (en beviljad ansökan kan inte tas bort).');
  },
  async calendarUrl() {
    const token = ok(await sb.rpc('my_calendar_token'));
    return `${SUPABASE_URL}/functions/v1/kalender?t=${token}`;
  },
  async savePushSubscription(sub) {
    const j = sub.toJSON();
    ok(await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: needMe(), p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }));
  },
  async removePushSubscription(endpoint) { ok(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); },
  async setRsvp(postId, status) {
    const me = needMe();
    if (!status) ok(await sb.from('event_rsvps').delete().eq('post_id', postId).eq('user_id', me));
    else ok(await sb.from('event_rsvps').upsert({ post_id: postId, user_id: me, status }, { onConflict: 'post_id,user_id' }));
  },
  async listEvents() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return ok(await sb.from('posts').select(POST_SELECT).eq('is_event', true).gte('event_start', today.toISOString()).order('event_start').limit(300)).map(shapePost);
  },
  // Spara i Minne med en kategori, eller ta bort om man redan sparat.
  async toggleMemory(postId, themes = []) {
    const me = needMe();
    const has = ok(await sb.from('memory_votes').select('post_id').eq('post_id', postId).eq('user_id', me)).length > 0;
    if (has) ok(await sb.from('memory_votes').delete().eq('post_id', postId).eq('user_id', me));
    else {
      const list = [...new Set((Array.isArray(themes) ? themes : [themes]).map((t) => (t || '').trim()).filter(Boolean))];
      if (list.length) await sb.from('memory_themes').upsert(list.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
      ok(await sb.from('memory_votes').insert({ post_id: postId, user_id: me, theme: list[0] || null, themes: list.length ? list : null }));
    }
    return !has;
  },
  async listMemoryThemes() {
    return ok(await sb.from('memory_themes').select('name').order('position').order('name')).map((r) => r.name);
  },
  async addMemoryTheme(name) {
    const n = (name || '').trim();
    if (!n || n.length > 40) throw new Error('Skriv ett namn (högst 40 tecken).');
    ok(await sb.from('memory_themes').upsert({ name: n }, { onConflict: 'name', ignoreDuplicates: true }));
  },
  async renameMemoryTheme(from, to) { ok(await sb.rpc('rename_memory_theme', { p_old: from, p_new: to })); },
  async setPostThemes(postId, themes) { ok(await sb.rpc('set_post_themes', { p_post: postId, p_themes: themes })); },
  async setFinanceClosed(id, closed) { ok(await sb.from('posts').update({ fin_closed: !!closed }).eq('id', id)); },

  // ---- Kommentarer och finansiering ----
  async addComment(postId, body, parentId = null) {
    if (!body?.trim()) throw new Error('Skriv något först.');
    ok(await sb.from('comments').insert({ post_id: postId, author_id: needMe(), parent_id: parentId, body: body.trim() }));
  },
  async applyForFunding(postId, { groupId, body, amount, payout }) {
    if (!groupId) throw new Error('Välj en grupp du är med i att söka för.');
    ok(await sb.rpc('apply_for_funding', { p_post: postId, p_group: groupId, p_body: body, p_amount: amount, p_payout: payout }));
  },
  async decideApplication(commentId, decision) { ok(await sb.rpc('decide_application', { p_comment: commentId, p_decision: decision })); },
  async markPaid(commentId) { ok(await sb.rpc('mark_paid', { p_comment: commentId })); },
  async listTodos() {
    const rows = ok(await sb.from('comments')
      .select(`*, author:profiles(${PROFILE}), group:groups(id,name,avatar_url), post:posts!inner(id, caption, author_id, group:groups(id,name,avatar_url))`)
      .in('status', ['applied', 'granted', 'paid']).eq('post.author_id', needMe()).order('decided_at', { ascending: false }));
    const payouts = rows.length ? ok(await sb.from('payouts').select('*').in('comment_id', rows.map((r) => r.id))) : [];
    const byId = Object.fromEntries(payouts.map((x) => [x.comment_id, x.details]));
    return rows.map((r) => ({ ...r, payout: byId[r.id] ?? null }));
  },

  // ---- Notiser ----
  async listNotifications() {
    return ok(await sb.from('notifications').select(`*, actor:profiles!notifications_actor_id_fkey(${PROFILE})`)
      .eq('user_id', needMe()).order('created_at', { ascending: false }).limit(100));
  },
  async markNotificationsRead() { ok(await sb.from('notifications').update({ read: true }).eq('user_id', needMe()).eq('read', false)); },

  // ---- Meddelanden ----
  async listConversations() {
    const me = needMe();
    const msgs = ok(await sb.from('messages').select('*').or(`from_id.eq.${me},to_id.eq.${me}`).order('created_at', { ascending: false }).limit(500));
    const map = new Map();
    for (const m of msgs) {
      const other = m.from_id === me ? m.to_id : m.from_id;
      if (!map.has(other)) map.set(other, { userId: other, last: m, unread: 0 });
      if (m.to_id === me && !m.read) map.get(other).unread++;
    }
    const ids = [...map.keys()];
    const people = ids.length ? ok(await sb.from('profiles').select(PROFILE).in('id', ids)) : [];
    const byId = Object.fromEntries(people.map((p) => [p.id, p]));
    return [...map.values()].map(({ userId, ...c }) => ({ ...c, user: byId[userId] || { id: userId, name: 'Borttagen användare' } }));
  },
  async getThread(userId) {
    const me = needMe();
    const msgs = ok(await sb.from('messages').select('*')
      .or(`and(from_id.eq.${me},to_id.eq.${userId}),and(from_id.eq.${userId},to_id.eq.${me})`).order('created_at'));
    ok(await sb.from('messages').update({ read: true }).eq('to_id', me).eq('from_id', userId).eq('read', false));
    return msgs;
  },
  async sendMessage(userId, body) {
    if (!body?.trim()) throw new Error('Skriv något först.');
    ok(await sb.from('messages').insert({ from_id: needMe(), to_id: userId, body: body.trim() }));
  },

  // ---- Redaktionen ----
  async listEditors() {
    const [rows, grp] = await Promise.all([
      sb.from('editors').select(`added_at, user:profiles!editors_user_id_fkey(${PROFILE})`).not('accepted_at', 'is', null).order('added_at').then(ok),
      sb.from('groups').select('id').eq('locked', true).limit(1).maybeSingle().then((r) => r.data, () => null),
    ]);
    return { editors: rows.map((r) => r.user), groupId: grp?.id || null };
  },
  async setEditor(uid, on) { ok(await sb.rpc('set_editor', { p_user: uid, p_on: !!on })); },
  async acceptEditor(yes) { ok(await sb.rpc('accept_editor', { p_yes: !!yes })); },
  // Gruppadmins: en medlem i en grupp utan admin ber om att bli admin; Redaktionen godkänner; personen bekräftar.
  async requestAdmin(gid, message) { ok(await sb.rpc('request_admin', { p_group: gid, p_message: message })); },
  async decideAdminRequest(id, approve) { ok(await sb.rpc('decide_admin_request', { p_id: id, p_approve: !!approve })); },
  async acceptAdminRole(id) { ok(await sb.rpc('accept_admin_role', { p_id: id })); },
  async myAdminRequests() {
    if (!meId) return [];
    return ok(await sb.from('admin_requests').select('*, group:groups(id,name,avatar_url)').eq('user_id', meId).in('status', ['pending', 'approved']));
  },
  async report(kind, id, name, reason) {
    if (!reason?.trim()) throw new Error('Skriv kort vad det gäller.');
    ok(await sb.from('reports').insert({ kind, target_id: id, target_name: name || null, reason: reason.trim(), reporter_id: needMe() }));
  },
  async editorTodos() {
    if (!meEditor) return { reports: [], log: [], adminRequests: [] };
    const [reports, log, adminRequests] = await Promise.all([
      sb.from('reports').select(`*, reporter:profiles!reports_reporter_id_fkey(${PROFILE}), doer:profiles!reports_done_by_fkey(${PROFILE})`).order('created_at', { ascending: false }).limit(100).then(ok),
      sb.from('editor_log').select(`*, actor:profiles!editor_log_actor_id_fkey(${PROFILE}), reverter:profiles!editor_log_reverted_by_fkey(${PROFILE})`).order('created_at', { ascending: false }).limit(30).then(ok),
      sb.from('admin_requests').select(`*, user:profiles!admin_requests_user_id_fkey(${PROFILE}), group:groups(id,name,avatar_url)`).eq('status', 'pending').order('created_at').then(ok, () => []),
    ]);
    return { reports, log, adminRequests };
  },
  async setReportDone(id, done) { ok(await sb.rpc('set_report_done', { p_id: id, p_done: !!done })); },
  async revertLog(id) { ok(await sb.rpc('revert_log', { p_id: id })); },
  async editorDelete(kind, id) { ok(await sb.rpc('editor_delete', { p_kind: kind, p_id: id })); },
  async deleteMyAccount() { ok(await sb.rpc('delete_my_account')); await sb.auth.signOut(); meId = null; },

  // ---- Feedback på appen ----
  async listFeedback() {
    const rows = ok(await sb.from('feedback').select(`*, author:profiles!feedback_author_id_fkey(${PROFILE}), feedback_votes(user_id,value), feedback_comments(count)`).order('created_at', { ascending: false }).limit(300));
    return rows.map(shapeFeedback);
  },
  async getFeedback(id) {
    const f = ok(await sb.from('feedback').select(`*, author:profiles!feedback_author_id_fkey(${PROFILE}), feedback_votes(user_id,value), feedback_comments(count)`).eq('id', id).maybeSingle());
    if (!f) throw new Error('Inlägget finns inte (längre).');
    const comments = ok(await sb.from('feedback_comments').select(`*, author:profiles!feedback_comments_author_id_fkey(${PROFILE})`).eq('feedback_id', id).order('created_at'));
    return { ...shapeFeedback(f), comments };
  },
  async createFeedback({ title, body }) {
    if ((title || '').trim().length < 3) throw new Error('Skriv en rubrik (minst tre tecken).');
    if (!(body || '').trim()) throw new Error('Beskriv förslaget eller problemet.');
    const f = ok(await sb.from('feedback').insert({ title: title.trim(), body: (body || '').trim(), author_id: needMe() }).select('id').single());
    ok(await sb.from('feedback_votes').insert({ feedback_id: f.id, user_id: needMe(), value: 1 }));
    return f.id;
  },
  async voteFeedback(id, value) {
    if (!value) ok(await sb.from('feedback_votes').delete().eq('feedback_id', id).eq('user_id', needMe()));
    else ok(await sb.from('feedback_votes').upsert({ feedback_id: id, user_id: needMe(), value }, { onConflict: 'feedback_id,user_id' }));
  },
  async commentFeedback(id, body, parentId = null) {
    if (!body?.trim()) throw new Error('Skriv något först.');
    ok(await sb.from('feedback_comments').insert({ feedback_id: id, parent_id: parentId, author_id: needMe(), body: body.trim() }));
  },
  async deleteFeedback(id) {
    const rows = ok(await sb.from('feedback').delete().eq('id', id).select('id'));
    if (!rows.length) await api.editorDelete('feedback', id);
  },
  async deleteFeedbackComment(id) {
    const rows = ok(await sb.from('feedback_comments').delete().eq('id', id).select('id'));
    if (!rows.length) throw new Error('Det gick inte att ta bort.');
  },
  async setFeedbackStatus(id, status) { ok(await sb.rpc('set_feedback_status', { p_id: id, p_status: status || null })); },

  async badges() {
    if (!meId) return { notifications: 0, messages: 0, todos: 0 };
    const count = async (q) => (await q).count ?? 0;
    const [notifications, messages, todos, reports, adminReqs] = await Promise.all([
      count(sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', meId).eq('read', false)),
      count(sb.from('messages').select('id', { count: 'exact', head: true }).eq('to_id', meId).eq('read', false)),
      count(sb.from('comments').select('id, post:posts!inner(author_id)', { count: 'exact', head: true }).in('status', ['applied', 'granted']).eq('post.author_id', meId)),
      meEditor ? count(sb.from('reports').select('id', { count: 'exact', head: true }).is('done_at', null)) : 0,
      meEditor ? count(sb.from('admin_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')) : 0,
    ]);
    return { notifications, messages, todos: todos + reports + adminReqs };
  },
};
