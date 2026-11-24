// Demoläge: samma funktioner som supabase.js men allt sparas i webbläsarens localStorage.
// Reglerna här speglar reglerna i supabase/setup.sql.
import { materializeSeed } from '../seed.js';
import { MENTION_RE, postThemes, MEMORY_THEMES, financeSummary, visibleInFeed, normalizePostInput, normalizeUrl, geocode, eventColumns, sortCategories, resizeImage, blobToDataURL } from '../util.js';

const KEY = 'omstallningsplatser-demo-v7';
// Demodata sparad under appens gamla namn flyttas över.
try { const old = localStorage.getItem('kooperativsystemet-demo-v7'); if (old && !localStorage.getItem(KEY)) { localStorage.setItem(KEY, old); localStorage.removeItem('kooperativsystemet-demo-v7'); } } catch { /* ok */ }
const subs = new Set();
const fresh = () => ({ ...materializeSeed(), credentials: {}, session: null, notifications: [], messages: [] });

function persist(d = db) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); }
  catch { throw new Error('Demolagringen i webbläsaren är full. Använd färre/mindre bilder eller koppla in Supabase.'); }
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* börja om */ }
  const d = fresh();
  try { persist(d); } catch { /* fortsätt utan att spara */ }
  return d;
}
let db = load();
// Redaktionen, anmälningar, historik och feedback (läggs till i äldre demodata också).
db.editors ??= [db.profiles[0]?.id, db.profiles[1]?.id].filter(Boolean);
db.reports ??= [];
db.editorInvites ??= [];
db.adminRequests ??= [];
db.editorLog ??= [];
db.feedback ??= [
  { id: uuid0(), author_id: db.profiles[1]?.id, title: 'Visa evenemang på kartan också', body: 'Det vore smidigt att se vad som händer i närheten direkt på kartan.', status: 'planerad', created_at: new Date(Date.now() - 3 * 864e5).toISOString() },
  { id: uuid0(), author_id: db.profiles[2]?.id, title: 'Mörkt läge', body: 'Ett mörkt läge vore skönare att använda på kvällen.', status: null, created_at: new Date(Date.now() - 864e5).toISOString() },
];
db.feedbackVotes ??= db.feedback.flatMap((f, i) => db.profiles.slice(0, 4 - i * 2).map((p) => ({ feedback_id: f.id, user_id: p.id, value: 1 })));
db.feedbackComments ??= [];
db.postLikes ??= [];
db.commentLikes ??= [];
db.chats ??= [];
db.chatMembers ??= [];
db.chatMessages ??= [];
// Redaktionen (den låsta gruppen) och dess medlemmar är alltid verifierade.
for (const g of db.groups) if (g.locked && !g.verified_at) g.verified_at = new Date().toISOString();
for (const m of db.members) if (db.groups.find((g) => g.id === m.group_id)?.locked) m.verified = true;
function uuid0() { return crypto.randomUUID(); }

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const clone = (x) => JSON.parse(JSON.stringify(x));
const emit = () => subs.forEach((f) => f());

function needMe() { if (!db.session) throw new Error('Du är inte inloggad.'); return db.session; }
const membership = (gid, uid) => db.members.find((m) => m.group_id === gid && m.user_id === uid);
function needMember(gid) { const me = needMe(); if (!membership(gid, me)) throw new Error('Bara gruppens medlemmar kan göra det.'); return me; }
// En grupp utan admin sköts av Redaktionen.
// Samma regel som i databasen: alla ser inlägget, om det inte bara är för vissa grupper.
function canSee(p) {
  const me = db.session;
  if (!p.visible_to?.length || p.author_id === me || db.editors.includes(me)) return true;
  return db.members.some((m) => m.user_id === me && p.visible_to.includes(m.group_id));
}
// Samtal: med utvalda personer, eller med en hel grupp (alla medlemmar är med).
function inChat(c, me) { return c.group_id ? !!membership(c.group_id, me) : db.chatMembers.some((m) => m.chat_id === c.id && m.user_id === me); }
function chatRow(id, me) {
  let r = db.chatMembers.find((m) => m.chat_id === id && m.user_id === me);
  if (!r) { r = { chat_id: id, user_id: me, muted: false, last_read_at: membership(db.chats.find((c) => c.id === id)?.group_id, me)?.joined_at || now() }; db.chatMembers.push(r); }
  return r;
}
function chatsFor(me) {
  return db.chats.filter((c) => inChat(c, me)).map((c) => {
    const msgs = db.chatMessages.filter((m) => m.chat_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const row = db.chatMembers.find((m) => m.chat_id === c.id && m.user_id === me);
    const since = row?.last_read_at || membership(c.group_id, me)?.joined_at || c.created_at;
    const g = c.group_id ? groupOf(c.group_id) : null;
    const others = db.chatMembers.filter((m) => m.chat_id === c.id && m.user_id !== me).map((m) => profileOf(m.user_id).name).sort((a, b) => a.localeCompare(b, 'sv'));
    return { id: c.id, title: c.title, group_id: c.group_id, group_name: g?.name || null, group_avatar: g?.avatar_url || null, last_message_at: c.last_message_at,
      last_body: msgs[0]?.body || null, last_from: msgs[0]?.from_id || null, last_from_name: msgs[0] ? profileOf(msgs[0].from_id).name : null,
      unread: msgs.filter((m) => m.from_id !== me && m.created_at > since).length, muted: !!row?.muted, member_names: others.join(', '),
      member_count: c.group_id ? db.members.filter((m) => m.group_id === c.group_id).length : db.chatMembers.filter((m) => m.chat_id === c.id).length };
  }).filter((c) => !c.group_id || c.last_body || db.chatMembers.some((m) => m.chat_id === c.id && m.user_id === me))
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}
// Omnämnanden: den som nämns (och får se inlägget) får en notis.
function notifyMentions(text, me, post, what, once = false) {
  const ids = [...new Set([...String(text || '').matchAll(MENTION_RE)].map((m) => m[2]))];
  for (const u of ids) {
    if (u === me || !db.profiles.some((p) => p.id === u)) continue;
    if (post.visible_to?.length && !db.editors.includes(u) && !db.members.some((m) => m.user_id === u && post.visible_to.includes(m.group_id))) continue;
    if (once && db.notifications.some((n) => n.user_id === u && n.kind === 'mention' && n.post_id === post.id && n.body === what)) continue;
    notify(u, 'mention', what, { actor_id: me, post_id: post.id });
  }
}
function needAdmin(gid) {
  const me = needMe();
  const noAdmin = !db.members.some((m) => m.group_id === gid && m.role === 'admin');
  if (membership(gid, me)?.role !== 'admin' && !(noAdmin && db.editors.includes(me))) throw new Error('Bara gruppens admins kan göra det.');
  return me;
}

const profileOf = (id) => {
  const p = db.profiles.find((x) => x.id === id);
  return p ? { id: p.id, name: p.name, avatar_url: p.avatar_url } : { id, name: 'Borttagen användare', avatar_url: null };
};
const groupOf = (id) => {
  const g = id && db.groups.find((x) => x.id === id);
  return g ? { id: g.id, name: g.name, avatar_url: g.avatar_url, city: g.city || null, region: g.region || null, country: g.country || null, postcode: g.postcode || null } : null;
};

function shapePost(p) {
  const cs = db.comments.filter((c) => c.post_id === p.id);
  return clone({
    ...p, slides: [...p.slides].sort((a, b) => a.position - b.position),
    author: profileOf(p.author_id), group: groupOf(p.group_id),
    comment_count: cs.length, finance: financeSummary(p, cs), first_comment: firstComment(cs),
    memory_count: (db.memory || []).filter((m) => m.post_id === p.id).length,
    memory_mine: (db.memory || []).some((m) => m.post_id === p.id && m.user_id === db.session),
    memory_themes: postThemes(p, (db.memory || []).filter((m) => m.post_id === p.id)),
    rsvp_interested: (db.rsvps || []).filter((r) => r.post_id === p.id && r.status === 'interested').length,
    rsvp_going: (db.rsvps || []).filter((r) => r.post_id === p.id && r.status === 'going').length,
    rsvp_mine: (db.rsvps || []).find((r) => r.post_id === p.id && r.user_id === db.session)?.status || null,
    like_count: db.postLikes.filter((l) => l.post_id === p.id).length, liked: db.postLikes.some((l) => l.post_id === p.id && l.user_id === db.session),
    author_verified: !!p.group_id && db.members.some((m) => m.group_id === p.group_id && m.user_id === p.author_id && m.verified),
  });
}
function firstComment(cs) {
  const c = cs.filter((x) => !x.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return c ? { body: c.body, author: profileOf(c.author_id), group: groupOf(c.group_id) } : null;
}
function bump(post) {
  const t = now();
  post.last_activity_at = t;
  const g = post.group_id && db.groups.find((x) => x.id === post.group_id);
  if (g) g.last_activity_at = t;
}
function notify(user_id, kind, body, extra = {}) {
  db.notifications.push({ id: uuid(), user_id, kind, body, actor_id: extra.actor_id ?? null,
    post_id: extra.post_id ?? null, group_id: extra.group_id ?? null, read: false, created_at: now() });
}
// Ingen blir admin automatiskt längre: en grupp utan admin sköts av Redaktionen.
function ensureAdmin() {}
function needEditor() { const me = needMe(); if (!db.editors.includes(me)) throw new Error('Bara Redaktionen kan göra det.'); return me; }
function log(actor_id, action, target_id, summary) { db.editorLog.push({ id: uuid(), actor_id, action, target_id, summary, created_at: now(), reverted_at: null, reverted_by: null }); }
function removeFeedback(id) {
  db.feedback = db.feedback.filter((x) => x.id !== id);
  db.feedbackVotes = db.feedbackVotes.filter((x) => x.feedback_id !== id);
  db.feedbackComments = db.feedbackComments.filter((x) => x.feedback_id !== id);
}
function removeUser(id) {
  const postIds = new Set(db.posts.filter((p) => p.author_id === id).map((p) => p.id));
  db.posts = db.posts.filter((p) => !postIds.has(p.id));
  db.comments = db.comments.filter((c) => c.author_id !== id && !postIds.has(c.post_id));
  const gids = db.members.filter((m) => m.user_id === id).map((m) => m.group_id);
  db.members = db.members.filter((m) => m.user_id !== id);
  gids.forEach(ensureAdmin);
  db.profiles = db.profiles.filter((p) => p.id !== id);
  db.messages = db.messages.filter((m) => m.from_id !== id && m.to_id !== id);
  db.notifications = db.notifications.filter((n) => n.user_id !== id);
  db.editors = db.editors.filter((x) => x !== id);
  db.feedback.filter((f) => f.author_id === id).forEach((f) => removeFeedback(f.id));
  for (const [email, c] of Object.entries(db.credentials)) if (c.id === id) delete db.credentials[email];
}
const shapeFeedback = (f) => {
  const v = db.feedbackVotes.filter((x) => x.feedback_id === f.id);
  return { ...clone(f), author: profileOf(f.author_id), score: v.reduce((n, x) => n + x.value, 0), ups: v.filter((x) => x.value > 0).length,
    downs: v.filter((x) => x.value < 0).length, my_vote: v.find((x) => x.user_id === db.session)?.value || 0,
    comment_count: db.feedbackComments.filter((c) => c.feedback_id === f.id).length };
};
const usedAmount = (pid) => db.comments
  .filter((c) => c.post_id === pid && (c.status === 'granted' || c.status === 'paid'))
  .reduce((s, c) => s + Number(c.applied_amount), 0);

async function storeImage(file, max = 1080) { return blobToDataURL(await resizeImage(file, max, 0.72)); }
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function buildSlides(slides) {
  const out = [];
  for (const [i, s] of slides.entries()) {
    const video = s.file ? s.file.type.startsWith('video/') : s.media_type === 'video';
    // Demoläge: en video sparas bara tills sidan laddas om (den ryms inte i webbläsarens lagring).
    out.push({ id: s.id || uuid(), position: i, media_type: video ? 'video' : 'image', image_url: s.file ? (video ? URL.createObjectURL(s.file) : await storeImage(s.file)) : s.image_url, text: (s.text || '').trim() });
  }
  return out;
}
const place = ({ country, region, city }) => ({ country: (country || '').trim() || null, region: (region || '').trim() || null, city: (city || '').trim() || null });
// Plats + adress + kartposition (slås upp automatiskt).
async function located({ country, region, city, address, postcode, lat, lng }) {
  const p = { ...place({ country, region, city }), address: (address || '').trim() || null,
    // Postnumret (för stadsdelen) tas ur adressen om det inte valts ur adresslistan.
    postcode: (postcode || '').trim() || (String(address || '').match(/\b\d{3} ?\d{2}\b/) || [null])[0]?.replace(/^(\d{3})(\d{2})$/, '$1 $2') || null };
  const pos = lat != null && lng != null ? { lat, lng } : await geocode(p);   // vald adress har redan en position
  return { ...p, lat: pos?.lat ?? null, lng: pos?.lng ?? null };
}
function addCategories(cats) {
  for (const c of cats) if (!db.categories.some((x) => x.name.toLowerCase() === c.toLowerCase())) db.categories.push({ name: c, created_at: now() });
}

export const api = {
  mode: 'demo',

  // ---- Konto ----
  onAuthChange(cb) { subs.add(cb); return () => subs.delete(cb); },
  async getMe() {
    const me = db.session && db.profiles.find((p) => p.id === db.session);
    return me ? { ...clone(me), is_editor: db.editors.includes(me.id), editor_invited: db.editorInvites.includes(me.id) } : null;
  },
  async signUp({ email, password, name, nickname, avatarFile, home }) {
    email = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Ange en giltig e-postadress.');
    if (!name.trim()) throw new Error('Skriv ditt namn.');
    if (password.length < 6) throw new Error('Lösenordet måste vara minst 6 tecken.');
    if (db.credentials[email]) throw new Error('Det finns redan ett konto med den e-postadressen.');
    const id = uuid();
    const avatar_url = avatarFile ? await storeImage(avatarFile, 400) : null;
    db.profiles.push({ id, name: name.trim(), nickname: (nickname || '').trim() || null, avatar_url, home: home ? clone(home) : null, created_at: now(), last_seen_at: now() });
    db.credentials[email] = { id, hash: await sha(password) };
    db.editors.push(id);   // i demoläget är man med i Redaktionen, så att man kan prova
    db.session = id;
    persist(); emit();
    return { needsConfirmation: false };
  },
  async signIn({ email, password }) {
    const c = db.credentials[email.trim().toLowerCase()];
    if (!c || c.hash !== await sha(password)) throw new Error('Fel e-post eller lösenord.');
    db.session = c.id; persist(); emit();
  },
  async signOut() { db.session = null; persist(); emit(); },
  isRecovering() { return false; },
  async signInWithProvider() { throw new Error('Inloggning med Google/Apple fungerar bara med Supabase.'); },
  async requestPasswordReset() { throw new Error('I demoläget skickas inga mejl. Skapa ett nytt konto i stället.'); },
  async setNewPassword() {},
  async beginVisit() {
    const p = db.profiles.find((x) => x.id === db.session);
    if (!p) return null;
    const fresh = !p.visit_started_at || Date.now() - new Date(p.last_seen_at) > 30 * 60e3;
    if (fresh) { p.prev_visit_at = p.last_seen_at || null; p.visit_started_at = now(); }
    p.last_seen_at = now(); persist();
    return p.prev_visit_at || null;
  },
  async touch() { const p = db.profiles.find((x) => x.id === db.session); if (p) { p.last_seen_at = now(); persist(); } },
  async updateProfile({ name, nickname, avatarFile, home }) {
    const p = db.profiles.find((x) => x.id === needMe());
    if (home) p.home = clone(home);
    if (name?.trim()) p.name = name.trim();
    if (nickname !== undefined) p.nickname = nickname.trim() || null;
    if (avatarFile) p.avatar_url = await storeImage(avatarFile, 400);
    persist();
  },
  async resetDemo() { db = fresh(); persist(); emit(); },

  // ---- Personer ----
  async listUsers(q = '') {
    q = q.trim().toLowerCase();
    return db.profiles.filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv')).map((p) => profileOf(p.id));
  },
  async getUser(id) {
    const p = db.profiles.find((x) => x.id === id);
    if (!p) throw new Error('Användaren finns inte.');
    return clone({ ...profileOf(id), nickname: p.nickname || null, created_at: p.created_at, is_editor: db.editors.includes(id),
      groups: db.members.filter((m) => m.user_id === id).map((m) => ({ ...groupOf(m.group_id), role: m.role })) });
  },

  // ---- Grupper ----
  async listPlaces() { return db.groups.map((g) => ({ country: g.country, region: g.region, city: g.city })); },
  async listContentPlaces() {
    const rows = [
      ...db.groups.map((g) => ({ country: g.country, region: g.region, city: g.city, postcode: g.postcode, district: null })),
      ...db.posts.filter((p) => !p.group_id && p.country).map((p) => ({ country: p.country, region: p.region, city: p.city, postcode: p.postcode, district: null })),
      ...db.profiles.filter((p) => p.home?.country).map((p) => ({ country: p.home.country, region: p.home.region, city: p.home.city, postcode: p.home.postcode, district: p.home.district })),
    ];
    return rows.filter((r) => r.country);
  },
  async listCountries() {
    const all = [...db.groups.map((g) => g.country), ...db.posts.filter((p) => !p.group_id).map((p) => p.country), ...db.profiles.map((p) => p.home?.country)];
    return [...new Set(all.map((c) => (c || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv'));
  },
  async listGroups(q = '') {
    const me = db.session; q = q.trim().toLowerCase();
    return clone(db.groups.filter((g) => !q || [g.name, g.description, g.city, g.region, g.country].some((x) => (x || '').toLowerCase().includes(q)))
      .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
      .map((g) => ({ ...g, member_count: db.members.filter((m) => m.group_id === g.id).length, member_ids: db.members.filter((m) => m.group_id === g.id).map((m) => m.user_id), is_member: !!membership(g.id, me) })));
  },
  async myGroups() {
    const me = needMe();
    return db.members.filter((m) => m.user_id === me).map((m) => ({ ...groupOf(m.group_id), role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  },
  async getGroup(id) {
    const g = db.groups.find((x) => x.id === id);
    if (!g) throw new Error('Gruppen finns inte.');
    const members = db.members.filter((m) => m.group_id === id)
      .sort((a, b) => (a.role === b.role ? a.joined_at.localeCompare(b.joined_at) : a.role === 'admin' ? -1 : 1))
      .map((m) => ({ user: profileOf(m.user_id), role: m.role, joined_at: m.joined_at, verified: !!m.verified }));
    const highlights = db.highlights.filter((h) => h.group_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return clone({ ...g, members, highlights });
  },
  async createGroup({ name, description, homepage, country, region, city, address, postcode, lat, lng, avatarFile }) {
    const me = needMe();
    name = (name || '').trim();
    if (!name) throw new Error('Ge gruppen ett namn.');
    if (db.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) throw new Error('Det finns redan en grupp med det namnet.');
    const g = { id: uuid(), name, description: (description || '').trim(), homepage: normalizeUrl(homepage), ...(await located({ country, region, city, address, postcode, lat, lng })), avatar_url: avatarFile ? await storeImage(avatarFile, 400) : null,
      created_by: me, created_at: now(), last_activity_at: now() };
    db.groups.push(g);
    db.members.push({ group_id: g.id, user_id: me, role: 'admin', joined_at: now() });
    persist();
    return clone(g);
  },
  async updateGroup(id, { name, description, homepage, country, region, city, address, postcode, lat, lng, avatarFile }) {
    needAdmin(id);
    const g = db.groups.find((x) => x.id === id);
    if (name?.trim()) g.name = name.trim();
    if (description !== undefined) g.description = description.trim();
    if (homepage !== undefined) g.homepage = normalizeUrl(homepage);
    if (country !== undefined) Object.assign(g, await located({ country, region, city, address, postcode, lat, lng }));
    if (avatarFile) g.avatar_url = await storeImage(avatarFile, 400);
    persist();
  },
  async deleteGroup(id) {
    needAdmin(id);
    for (const p of db.posts.filter((x) => x.group_id === id)) await api.deletePost(p.id);
    db.highlights = db.highlights.filter((h) => h.group_id !== id);
    db.members = db.members.filter((m) => m.group_id !== id);
    db.groups = db.groups.filter((g) => g.id !== id);
    db.notifications = db.notifications.filter((n) => n.group_id !== id);
    persist();
  },
  async joinGroup(id) {
    const me = needMe();
    if (db.groups.find((g) => g.id === id)?.locked) throw new Error('Gruppen är låst.');
    if (!membership(id, me)) db.members.push({ group_id: id, user_id: me, role: 'member', joined_at: now() });
    persist();
  },
  async leaveGroup(id) {
    const me = needMe();
    db.members = db.members.filter((m) => !(m.group_id === id && m.user_id === me));
    ensureAdmin(id); persist();
  },
  async setMemberRole(gid, uid, role) {
    const me = needAdmin(gid);
    const m = membership(gid, uid);
    if (!m) return;
    const was = m.role;
    m.role = role === 'admin' ? 'admin' : 'member';
    if (m.role === 'admin' && was !== 'admin' && uid !== me) notify(uid, 'admin', `gjorde dig till admin för ${groupOf(gid).name}`, { actor_id: me, group_id: gid });
    ensureAdmin(gid); persist();
  },
  async addMember(gid, uid) {
    const me = needAdmin(gid);
    const g = db.groups.find((x) => x.id === gid);
    if (g.locked) throw new Error('Gruppen är låst – medlemmarna är Redaktionen.');
    if (!membership(gid, uid)) { db.members.push({ group_id: gid, user_id: uid, role: 'member', joined_at: now() }); if (uid !== me) notify(uid, 'admin', `lade till dig i ${g.name}`, { actor_id: me, group_id: gid }); }
    persist();
  },
  async removeMember(gid, uid) {
    if (uid !== needMe()) needAdmin(gid);
    db.members = db.members.filter((m) => !(m.group_id === gid && m.user_id === uid));
    ensureAdmin(gid); persist();
  },
  async saveHighlight(gid, { id, title, post_ids }) {
    needMember(gid);
    if (!title?.trim()) throw new Error('Ge höjdpunkten ett namn.');
    const h = id && db.highlights.find((x) => x.id === id);
    if (h) { h.title = title.trim(); h.post_ids = post_ids; }
    else db.highlights.push({ id: uuid(), group_id: gid, title: title.trim(), post_ids, created_at: now() });
    persist();
  },
  async deleteHighlight(id) {
    const h = db.highlights.find((x) => x.id === id);
    if (!h) return;
    needMember(h.group_id);
    db.highlights = db.highlights.filter((x) => x.id !== id);
    persist();
  },

  // ---- Inlägg ----
  async listCategories() { return sortCategories(db.categories.map((c) => c.name)); },
  async listPosts({ kind = null, tag = null, groupId = null, authorId = null, q = '', feed = false, before = null, limit = 200 } = {}) {
    q = q.trim().toLowerCase();
    let ps = db.posts.filter((p) => canSee(p) &&
      (!kind || (p.kind || 'vanlig') === kind) && (!tag || p.categories.includes(tag)) &&
      (!groupId || p.group_id === groupId) && (!authorId || p.author_id === authorId) &&
      (!q || p.caption.toLowerCase().includes(q) || p.slides.some((s) => s.text.toLowerCase().includes(q))));
    ps = ps.filter((p) => !before || p.created_at < before).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map(shapePost);
    return feed ? ps.filter(visibleInFeed) : ps;
  },
  async getPost(id) {
    const p = db.posts.find((x) => x.id === id);
    if (!p || !canSee(p)) throw new Error('Inlägget finns inte (längre).');
    const me = db.session;
    const post = shapePost(p);
    post.comments = db.comments.filter((c) => c.post_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({ ...clone(c), author: profileOf(c.author_id), group: groupOf(c.group_id),
        payout: c.author_id === me || p.author_id === me ? db.payouts[c.id] ?? null : null,
        like_count: db.commentLikes.filter((l) => l.comment_id === c.id).length, liked: db.commentLikes.some((l) => l.comment_id === c.id && l.user_id === me) }));
    return post;
  },
  async createPost(input) {
    const me = needMe();
    const v = normalizePostInput(input);
    if (v.groupId && !membership(v.groupId, me)) throw new Error('Du kan bara posta i grupper du är med i.');
    const t = now();
    const post = {
      id: uuid(), author_id: me, group_id: v.groupId, country: v.place?.country ?? null, region: v.place?.region ?? null, city: v.place?.city ?? null, postcode: v.place?.postcode ?? null, as_group: v.asGroup && membership(v.groupId, me)?.role === 'admin', visible_to: v.visibleTo?.length ? v.visibleTo : null, caption: v.caption, kind: v.kind, is_resource: v.isResource, categories: v.categories,
      space_functions: v.space?.functions || [], space_cost: v.space?.cost ?? null, space_price: v.space?.price ?? null, ...eventColumns(v.event),
      fin_total: v.finance?.total ?? null, fin_mode: v.finance?.mode ?? null, fin_expires_at: v.finance?.expiresAt ?? null, fin_closed: false,
      created_at: t, updated_at: t, last_activity_at: t, slides: await buildSlides(v.slides),
    };
    addCategories(v.categories);
    db.posts.push(post); bump(post);
    notifyMentions(post.caption, me, post, 'nämnde dig i ett inlägg', true);
    persist();
    return post.id;
  },
  async updatePost(id, input) {
    const me = needMe();
    const p = db.posts.find((x) => x.id === id);
    if (!p || p.author_id !== me) throw new Error('Bara den som postat kan redigera.');
    const v = normalizePostInput(input);
    if (p.fin_total != null && !v.finance) throw new Error('Ett finansieringsinlägg kan inte byta typ. Stäng det i stället via ··· på inlägget.');
    if (v.groupId && v.groupId !== p.group_id && !membership(v.groupId, me)) throw new Error('Du kan bara posta i grupper du är med i.');
    Object.assign(p, { group_id: v.groupId, country: v.place?.country ?? null, region: v.place?.region ?? null, city: v.place?.city ?? null, postcode: v.place?.postcode ?? null, as_group: v.asGroup && membership(v.groupId, me)?.role === 'admin', visible_to: v.visibleTo?.length ? v.visibleTo : null, caption: v.caption, kind: v.kind, is_resource: v.isResource, categories: v.categories, updated_at: now(),
      space_functions: v.space?.functions || [], space_cost: v.space?.cost ?? null, space_price: v.space?.price ?? null, ...eventColumns(v.event) });
    if (v.finance) {
      if (p.fin_total == null) Object.assign(p, { fin_total: v.finance.total, fin_mode: v.finance.mode });
      p.fin_expires_at = v.finance.expiresAt;
    }
    p.slides = await buildSlides(v.slides);
    addCategories(v.categories);
    notifyMentions(p.caption, me, p, 'nämnde dig i ett inlägg', true);
    persist();
  },
  async deletePost(id) {
    const me = needMe();
    const p = db.posts.find((x) => x.id === id);
    if (!p) return;
    if (p.author_id !== me && !(p.group_id && membership(p.group_id, me)?.role === 'admin')) throw new Error('Du får inte ta bort det här inlägget.');
    const cids = new Set(db.comments.filter((c) => c.post_id === id).map((c) => c.id));
    db.posts = db.posts.filter((x) => x.id !== id);
    db.comments = db.comments.filter((c) => !cids.has(c.id));
    for (const cid of cids) delete db.payouts[cid];
    db.notifications = db.notifications.filter((n) => n.post_id !== id);
    db.memory = (db.memory || []).filter((m) => m.post_id !== id);
    for (const h of db.highlights) h.post_ids = h.post_ids.filter((x) => x !== id);
    persist();
  },
  async deleteComment(id) {
    const me = needMe();
    const c = db.comments.find((x) => x.id === id);
    if (!c || c.author_id !== me) throw new Error('Du kan bara ta bort dina egna kommentarer.');
    if (c.status === 'granted' || c.status === 'paid') throw new Error('En beviljad ansökan kan inte tas bort.');
    const gone = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const x of db.comments) if (x.parent_id && gone.has(x.parent_id) && !gone.has(x.id)) { gone.add(x.id); grew = true; } }
    db.comments = db.comments.filter((x) => !gone.has(x.id));
    delete db.payouts[id];
    persist();
  },
  async calendarUrl() { throw new Error('Kalenderprenumeration fungerar bara med Supabase.'); },
  async savePushSubscription() { throw new Error('Push-notiser fungerar bara med Supabase.'); },
  async removePushSubscription() {},
  async setRsvp(postId, status) {
    const me = needMe();
    db.rsvps = (db.rsvps || []).filter((r) => !(r.post_id === postId && r.user_id === me));
    if (status) db.rsvps.push({ post_id: postId, user_id: me, status, created_at: now() });
    persist();
  },
  async listEvents() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return db.posts.filter((p) => p.is_event && p.event_start && new Date(p.event_start) >= today)
      .sort((a, b) => a.event_start.localeCompare(b.event_start)).map(shapePost);
  },
  async toggleMemory(postId, themes = []) {
    const me = needMe();
    db.memory ||= [];
    const list = [...new Set((Array.isArray(themes) ? themes : [themes]).map((t) => (t || '').trim()).filter(Boolean))];
    const has = db.memory.some((m) => m.post_id === postId && m.user_id === me);
    db.memory = has ? db.memory.filter((m) => !(m.post_id === postId && m.user_id === me)) : [...db.memory, { post_id: postId, user_id: me, theme: list[0] || null, themes: list, created_at: now() }];
    db.memoryThemes ??= MEMORY_THEMES.map((t) => t.name);
    for (const t of list) if (!db.memoryThemes.includes(t)) db.memoryThemes.push(t);
    persist();
    return !has;
  },
  async listMemoryThemes() {
    db.memoryThemes ??= MEMORY_THEMES.map((t) => t.name);
    return [...db.memoryThemes];
  },
  async addMemoryTheme(name) {
    needEditor();
    const n = (name || '').trim();
    if (!n || n.length > 40) throw new Error('Skriv ett namn (högst 40 tecken).');
    db.memoryThemes ??= MEMORY_THEMES.map((t) => t.name);
    if (!db.memoryThemes.includes(n)) db.memoryThemes.push(n);
    persist();
  },
  async renameMemoryTheme(from, to) {
    const me = needEditor();
    const n = (to || '').trim();
    if (!n || n.length > 40) throw new Error('Skriv ett namn (högst 40 tecken).');
    db.memoryThemes ??= MEMORY_THEMES.map((t) => t.name);
    db.memoryThemes = db.memoryThemes.includes(n) ? db.memoryThemes.filter((t) => t !== from) : db.memoryThemes.map((t) => (t === from ? n : t));
    for (const m of db.memory || []) { if (m.theme === from) m.theme = n; if (m.themes) m.themes = [...new Set(m.themes.map((t) => (t === from ? n : t)))]; }
    for (const p of db.posts) { if (p.memory_theme === from) p.memory_theme = n; if (p.memory_themes) p.memory_themes = [...new Set(p.memory_themes.map((t) => (t === from ? n : t)))]; }
    log(me, 'theme_rename', null, `bytte namn på kategorin ”${from}” till ”${n}” i Minne`);
    persist();
  },
  async setPostThemes(postId, themes) {
    const me = needEditor();
    const p = db.posts.find((x) => x.id === postId);
    if (!p) throw new Error('Inlägget finns inte.');
    const list = [...new Set((themes || []).map((t) => t.trim()).filter(Boolean))];
    db.memoryThemes ??= MEMORY_THEMES.map((t) => t.name);
    for (const t of list) if (!db.memoryThemes.includes(t)) db.memoryThemes.push(t);
    p.memory_themes = list.length ? list : null; p.memory_theme = null;
    log(me, 'post_theme', postId, `satte kategorierna för ”${(p.caption || 'inlägg').slice(0, 50)}” i Minne: ${list.join(', ') || 'de sparade'}`);
    persist();
  },

  async setFinanceClosed(id, closed) {
    const p = db.posts.find((x) => x.id === id);
    if (!p || p.author_id !== needMe()) throw new Error('Bara den som postat kan ändra.');
    p.fin_closed = !!closed; persist();
  },

  // ---- Kommentarer och finansiering ----
  async addComment(postId, body, parentId = null) {
    const me = needMe();
    body = (body || '').trim();
    if (!body) throw new Error('Skriv något först.');
    const p = db.posts.find((x) => x.id === postId);
    const parent = parentId && db.comments.find((c) => c.id === parentId);
    if (parentId && parent?.post_id !== postId) throw new Error('Svaret hör inte till samma inlägg.');
    db.comments.push({ id: uuid(), post_id: postId, author_id: me, group_id: null, parent_id: parentId || null, body, created_at: now(), applied_amount: null, status: null });
    bump(p);
    if (p.author_id !== me) notify(p.author_id, 'comment', `${parent ? 'svarade i en tråd på ditt inlägg' : 'kommenterade'}: ${body.slice(0, 80)}`, { actor_id: me, post_id: postId });
    if (parent && parent.author_id !== me && parent.author_id !== p.author_id) notify(parent.author_id, 'reply', `svarade på din kommentar: ${body.slice(0, 80)}`, { actor_id: me, post_id: postId });
    notifyMentions(body, me, p, 'nämnde dig i en kommentar');
    persist();
  },
  async applyForFunding(postId, { groupId, body, amount, payout }) {
    const me = needMe();
    if (!groupId || !membership(groupId, me)) throw new Error('Välj en grupp du är med i att söka för.');
    const p = db.posts.find((x) => x.id === postId);
    if (!p || p.fin_total == null) throw new Error('Inlägget är ingen finansiering.');
    if (p.author_id === me) throw new Error('Du kan inte söka från din egen finansiering.');
    if (p.fin_closed || (p.fin_expires_at && new Date(p.fin_expires_at) < new Date())) throw new Error('Finansieringen är stängd.');
    const amt = p.fin_mode === 'single' ? Number(p.fin_total) : Number(amount);
    if (!(amt > 0)) throw new Error('Ange ett belopp.');
    const left = Number(p.fin_total) - usedAmount(postId);
    if (amt > left) throw new Error(`Beloppet är större än det som finns kvar (${left} kr).`);
    if (!body?.trim()) throw new Error('Skriv en motivering.');
    if (!payout?.trim()) throw new Error('Ange swishnummer eller bankkonto.');
    const c = { id: uuid(), post_id: postId, author_id: me, group_id: groupId, parent_id: null, body: body.trim(), created_at: now(), applied_amount: amt, status: 'applied' };
    db.comments.push(c);
    db.payouts[c.id] = payout.trim();
    bump(p);
    notify(p.author_id, 'application', `ansökte om ${amt} kr för ${groupOf(groupId).name}`, { actor_id: me, post_id: postId });
    persist();
  },
  async decideApplication(commentId, decision) {
    const me = needMe();
    const c = db.comments.find((x) => x.id === commentId);
    const p = c && db.posts.find((x) => x.id === c.post_id);
    if (!p || p.author_id !== me) throw new Error('Bara den som delar ut pengarna kan besluta.');
    if (c.status !== 'applied') throw new Error('Ansökan är redan behandlad.');
    if (decision === 'granted' && Number(c.applied_amount) > Number(p.fin_total) - usedAmount(p.id)) throw new Error('Det finns inte tillräckligt kvar för att bevilja.');
    c.status = decision === 'granted' ? 'granted' : 'denied';
    c.decided_at = now();
    notify(c.author_id, 'decision', c.status === 'granted' ? `beviljade din ansökan på ${c.applied_amount} kr` : 'avslog din ansökan', { actor_id: me, post_id: p.id });
    db.messages.push({ id: uuid(), from_id: me, to_id: c.author_id, read: false, created_at: now(), body: c.status === 'granted'
      ? `Er ansökan på ${c.applied_amount} kr har beviljats. Jag hör av mig när pengarna är skickade. #/post/${p.id}`
      : `Er ansökan på ${c.applied_amount} kr fick tyvärr avslag den här gången. #/post/${p.id}` });
    persist();
  },
  async markPaid(commentId) {
    const me = needMe();
    const c = db.comments.find((x) => x.id === commentId);
    const p = c && db.posts.find((x) => x.id === c.post_id);
    if (!p || p.author_id !== me) throw new Error('Bara den som delar ut pengarna kan markera utbetalningar.');
    if (c.status !== 'granted') throw new Error('Ansökan är inte beviljad.');
    c.status = 'paid'; c.paid_at = now();
    notify(c.author_id, 'paid', `har skickat ${c.applied_amount} kr till dig`, { actor_id: me, post_id: p.id });
    db.messages.push({ id: uuid(), from_id: me, to_id: c.author_id, read: false, created_at: now(), body: `Nu har jag skickat ${c.applied_amount} kr till er. #/post/${p.id}` });
    persist();
  },
  async listTodos() {
    const me = needMe();
    const mine = new Set(db.posts.filter((p) => p.author_id === me).map((p) => p.id));
    return db.comments.filter((c) => mine.has(c.post_id) && ['applied', 'granted', 'paid'].includes(c.status))
      .sort((a, b) => (b.decided_at || '').localeCompare(a.decided_at || ''))
      .map((c) => {
        const p = db.posts.find((x) => x.id === c.post_id);
        return { ...clone(c), author: profileOf(c.author_id), group: groupOf(c.group_id), payout: db.payouts[c.id] ?? null, post: { id: p.id, caption: p.caption, group: groupOf(p.group_id) } };
      });
  },

  // ---- Notiser ----
  async listNotifications() {
    const me = needMe();
    return db.notifications.filter((n) => n.user_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100)
      .map((n) => ({ ...clone(n), actor: n.actor_id ? profileOf(n.actor_id) : null }));
  },
  async markNotificationsRead() {
    const me = needMe();
    for (const n of db.notifications) if (n.user_id === me) n.read = true;
    persist();
  },

  // ---- Meddelanden ----
  async listConversations() {
    const me = needMe();
    const map = new Map();
    for (const m of [...db.messages].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      if (m.from_id !== me && m.to_id !== me) continue;
      const other = m.from_id === me ? m.to_id : m.from_id;
      if (!map.has(other)) map.set(other, { user: profileOf(other), last: clone(m), unread: 0 });
      if (m.to_id === me && !m.read) map.get(other).unread++;
    }
    return [...map.values()];
  },
  async getThread(userId) {
    const me = needMe();
    const msgs = db.messages.filter((m) => (m.from_id === me && m.to_id === userId) || (m.from_id === userId && m.to_id === me));
    for (const m of msgs) if (m.to_id === me) m.read = true;
    persist();
    return clone(msgs.sort((a, b) => a.created_at.localeCompare(b.created_at)));
  },
  async sendMessage(userId, body) {
    const me = needMe();
    if (!body?.trim()) throw new Error('Skriv något först.');
    if (userId === me) throw new Error('Du kan inte skicka till dig själv.');
    db.messages.push({ id: uuid(), from_id: me, to_id: userId, body: body.trim(), read: false, created_at: now() });
    persist();
  },

  // ---- Gilla ----
  async likePost(id, on) {
    const me = needMe();
    db.postLikes = db.postLikes.filter((l) => !(l.post_id === id && l.user_id === me));
    if (on) {
      db.postLikes.push({ post_id: id, user_id: me, created_at: now() });
      const p = db.posts.find((x) => x.id === id);
      if (p && p.author_id !== me) notify(p.author_id, 'like', 'gillade ditt inlägg', { actor_id: me, post_id: id });
    }
    persist();
  },
  async likeComment(id, on) {
    const me = needMe();
    db.commentLikes = db.commentLikes.filter((l) => !(l.comment_id === id && l.user_id === me));
    if (on) db.commentLikes.push({ comment_id: id, user_id: me, created_at: now() });
    persist();
  },

  // ---- Verifiering ----
  async setGroupVerified(id, on) {
    const me = needMe();
    if (!db.editors.includes(me)) throw new Error('Bara Redaktionen kan göra det.');
    const g = db.groups.find((x) => x.id === id);
    g.verified_at = on ? now() : null; g.verified_by = on ? me : null;
    log(me, 'group_verify', id, (on ? 'verifierade gruppen ' : 'tog bort verifieringen av ') + g.name);
    persist();
  },
  async setMemberVerified(groupId, userId, on) {
    const me = needAdmin(groupId);
    const m = membership(groupId, userId);
    if (!m) throw new Error('Personen är inte med i gruppen.');
    m.verified = on;
    if (on && userId !== me) notify(userId, 'admin', 'verifierade dig som medlem i ' + groupOf(groupId).name, { actor_id: me, group_id: groupId });
    persist();
  },

  // ---- Samtal med flera / med en hel grupp ----
  async listChats() { return clone(chatsFor(needMe())); },
  async getChat(id) {
    const me = needMe();
    const c = db.chats.find((x) => x.id === id);
    if (!c || !inChat(c, me)) throw new Error('Samtalet finns inte, eller så är du inte med i det.');
    chatRow(id, me).last_read_at = now(); persist();
    const members = c.group_id ? db.members.filter((m) => m.group_id === c.group_id).map((m) => profileOf(m.user_id)) : db.chatMembers.filter((m) => m.chat_id === id).map((m) => profileOf(m.user_id));
    return clone({ ...c, group: c.group_id ? groupOf(c.group_id) : null, members, muted: !!chatRow(id, me).muted,
      messages: db.chatMessages.filter((m) => m.chat_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({ ...m, from: profileOf(m.from_id) })) });
  },
  async sendChatMessage(id, body) {
    const me = needMe();
    if (!body?.trim()) throw new Error('Skriv något först.');
    const c = db.chats.find((x) => x.id === id);
    if (!c || !inChat(c, me)) throw new Error('Du är inte med i samtalet.');
    const t = now();
    db.chatMessages.push({ id: uuid(), chat_id: id, from_id: me, body: body.trim(), created_at: t });
    c.last_message_at = t; chatRow(id, me).last_read_at = t;
    persist();
  },
  async createChat(title, userIds) {
    const me = needMe();
    const ids = [...new Set([...userIds, me])];
    if (ids.length < 2) throw new Error('Välj minst en person.');
    const c = { id: uuid(), title: (title || '').trim() || null, group_id: null, created_by: me, created_at: now(), last_message_at: now() };
    db.chats.push(c);
    for (const u of ids) db.chatMembers.push({ chat_id: c.id, user_id: u, muted: false, last_read_at: now() });
    persist();
    return c.id;
  },
  async groupChat(groupId) {
    const me = needMember(groupId);
    let c = db.chats.find((x) => x.group_id === groupId);
    if (!c) { c = { id: uuid(), title: null, group_id: groupId, created_by: me, created_at: now(), last_message_at: now() }; db.chats.push(c); persist(); }
    return c.id;
  },
  async setChatMuted(id, muted) { chatRow(id, needMe()).muted = muted; persist(); },

  // ---- Redaktionen ----
  async listEditors() {
    return { editors: db.editors.map(profileOf), groupId: db.groups.find((g) => g.name === 'Omställningsplatser')?.id || null };
  },
  async setEditor(uid, on) {
    const me = needEditor();
    const has = db.editors.includes(uid);
    if (on && !has && !db.editorInvites.includes(uid)) { db.editorInvites.push(uid); log(me, 'editor_add', uid, `bjöd in ${profileOf(uid).name} till Redaktionen`); notify(uid, 'admin', 'bjöd in dig till Redaktionen – öppna appen för att läsa och godkänna', { actor_id: me }); }
    if (!on && has) {
      if (db.editors.length <= 1) throw new Error('Redaktionen måste ha minst en person.');
      db.editors = db.editors.filter((x) => x !== uid); log(me, 'editor_remove', uid, `tog bort ${profileOf(uid).name} ur Redaktionen`);
    }
    persist();
  },
  async acceptEditor(yes) {
    const me = needMe();
    if (!db.editorInvites.includes(me)) throw new Error('Ingen inbjudan att svara på.');
    db.editorInvites = db.editorInvites.filter((x) => x !== me);
    if (yes) db.editors.push(me);
    log(me, yes ? 'editor_accept' : 'editor_decline', me, yes ? 'godkände sina befogenheter och är nu med i Redaktionen' : 'tackade nej till Redaktionen');
    persist();
  },
  async requestAdmin(gid, message) {
    const me = needMe();
    const g = db.groups.find((x) => x.id === gid);
    if (!g || g.locked) throw new Error('Det går inte för den här gruppen.');
    if (!membership(gid, me)) throw new Error('Gå med i gruppen först.');
    if (db.members.some((m) => m.group_id === gid && m.role === 'admin')) throw new Error('Gruppen har redan en admin – fråga dem.');
    if ((message || '').trim().length < 3) throw new Error('Skriv kort om din roll i gruppen.');
    if (db.adminRequests.some((r) => r.group_id === gid && r.user_id === me && ['pending', 'approved'].includes(r.status))) throw new Error('Du har redan frågat.');
    db.adminRequests.push({ id: uuid(), group_id: gid, user_id: me, message: message.trim(), status: 'pending', created_at: now() });
    for (const e of db.editors) if (e !== me) notify(e, 'admin', `vill bli admin för ${g.name} – finns i Redaktionens checklista`, { actor_id: me, group_id: gid });
    persist();
  },
  async decideAdminRequest(id, approve) {
    const me = needEditor();
    const r = db.adminRequests.find((x) => x.id === id);
    if (!r || r.status !== 'pending') throw new Error('Förfrågan är redan behandlad.');
    r.status = approve ? 'approved' : 'rejected'; r.decided_by = me; r.decided_at = now();
    const g = groupOf(r.group_id);
    notify(r.user_id, 'admin', approve ? `godkände att du blir admin för ${g.name} – öppna appen och bekräfta` : `godkände inte att du blir admin för ${g.name}`, { actor_id: me, group_id: r.group_id });
    log(me, 'admin_request', id, `${approve ? 'godkände' : 'avslog'} ${profileOf(r.user_id).name} som admin för ${g.name}`);
    persist();
  },
  async acceptAdminRole(id) {
    const me = needMe();
    const r = db.adminRequests.find((x) => x.id === id && x.user_id === me);
    if (!r || r.status !== 'approved') throw new Error('Det finns inget godkännande att bekräfta.');
    const m = membership(r.group_id, me);
    if (m) m.role = 'admin'; else db.members.push({ group_id: r.group_id, user_id: me, role: 'admin', joined_at: now() });
    r.status = 'accepted';
    persist();
  },
  async myAdminRequests() {
    const me = db.session;
    return db.adminRequests.filter((r) => r.user_id === me && ['pending', 'approved'].includes(r.status)).map((r) => ({ ...clone(r), group: groupOf(r.group_id) }));
  },
  async report(kind, id, name, reason) {
    const me = needMe();
    if (!reason?.trim()) throw new Error('Skriv kort vad det gäller.');
    db.reports.push({ id: uuid(), kind, target_id: id, target_name: name || null, reason: reason.trim(), reporter_id: me, created_at: now(), done_at: null, done_by: null });
    for (const e of db.editors) if (e !== me) notify(e, 'report', `anmälde ${name || 'något'}: ”${reason.trim().slice(0, 120)}” – finns i Redaktionens checklista`, { actor_id: me });
    persist();
  },
  async editorTodos() {
    if (!db.editors.includes(db.session)) return { reports: [], log: [], adminRequests: [] };
    return {
      adminRequests: db.adminRequests.filter((r) => r.status === 'pending').map((r) => ({ ...clone(r), user: profileOf(r.user_id), group: groupOf(r.group_id) })),
      reports: [...db.reports].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ ...clone(r), reporter: profileOf(r.reporter_id), doer: r.done_by ? profileOf(r.done_by) : null })),
      log: [...db.editorLog].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30).map((l) => ({ ...clone(l), actor: profileOf(l.actor_id), reverter: l.reverted_by ? profileOf(l.reverted_by) : null })),
    };
  },
  async setReportDone(id, done) {
    const me = needEditor();
    const r = db.reports.find((x) => x.id === id);
    if (!r) throw new Error('Anmälan finns inte.');
    r.done_at = done ? now() : null; r.done_by = done ? me : null;
    if (done) log(me, 'report_done', id, `bockade av anmälan om ${r.target_name || 'innehåll'}: ”${r.reason.slice(0, 80)}”`);
    persist();
  },
  async revertLog(id) {
    const me = needEditor();
    const l = db.editorLog.find((x) => x.id === id);
    if (!l || l.reverted_at) throw new Error('Redan ångrat.');
    if (l.action === 'report_done') { const r = db.reports.find((x) => x.id === l.target_id); if (r) { r.done_at = null; r.done_by = null; } }
    else if (l.action === 'editor_add') { if (db.editors.length <= 1) throw new Error('Redaktionen måste ha minst en person.'); db.editors = db.editors.filter((x) => x !== l.target_id); }
    else if (l.action === 'editor_remove') { if (!db.editors.includes(l.target_id)) db.editors.push(l.target_id); }
    else if (l.action === 'feedback_status') { const f = db.feedback.find((x) => x.id === l.target_id); if (f) f.status = null; }
    else throw new Error('Det här går inte att ångra.');
    l.reverted_at = now(); l.reverted_by = me;
    if (l.actor_id !== me) notify(l.actor_id, 'admin', `ångrade att du ${l.summary}`, { actor_id: me });
    persist();
  },
  async editorDelete(kind, id) {
    const me = needEditor();
    let n;
    if (kind === 'post') { const p = db.posts.find((x) => x.id === id); n = p && `inlägget ”${(p.caption || 'inlägg').slice(0, 60)}”`; if (p) { p.author_id = me; await api.deletePost(id); } }
    else if (kind === 'group') { const g = db.groups.find((x) => x.id === id); n = g && `gruppen ${g.name}`; if (g) { db.members.push({ group_id: id, user_id: me, role: 'admin', joined_at: now() }); await api.deleteGroup(id); } }
    else if (kind === 'user') {
      if (id === me) throw new Error('Ta bort ditt eget konto under Hjälp → Radera ditt konto.');
      const u = db.profiles.find((x) => x.id === id); n = u && `användaren ${u.name}`; if (u) removeUser(id);
    } else if (kind === 'feedback') { const f = db.feedback.find((x) => x.id === id); n = f && `feedbacken ”${f.title.slice(0, 60)}”`; if (f) removeFeedback(id); }
    if (!n) throw new Error('Det finns inte (längre).');
    for (const r of db.reports) if (r.target_id === id && !r.done_at) { r.done_at = now(); r.done_by = me; }
    log(me, 'delete_' + kind, id, 'tog bort ' + n);
    persist();
  },
  async deleteMyAccount() {
    const me = needMe();
    if (db.editors.includes(me) && db.editors.length <= 1) throw new Error('Du är sista personen i Redaktionen. Lägg till någon annan först.');
    removeUser(me);
    db.session = null; persist(); emit();
  },

  // ---- Feedback på appen ----
  async listFeedback() { return db.feedback.map(shapeFeedback).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
  async getFeedback(id) {
    const f = db.feedback.find((x) => x.id === id);
    if (!f) throw new Error('Inlägget finns inte (längre).');
    return { ...shapeFeedback(f), comments: db.feedbackComments.filter((c) => c.feedback_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((c) => ({ ...clone(c), author: profileOf(c.author_id) })) };
  },
  async createFeedback({ title, body }) {
    const me = needMe();
    if ((title || '').trim().length < 3) throw new Error('Skriv en rubrik (minst tre tecken).');
    if (!(body || '').trim()) throw new Error('Beskriv förslaget eller problemet.');
    const f = { id: uuid(), author_id: me, title: title.trim(), body: (body || '').trim(), status: null, created_at: now() };
    db.feedback.push(f); db.feedbackVotes.push({ feedback_id: f.id, user_id: me, value: 1 });
    persist(); return f.id;
  },
  async voteFeedback(id, value) {
    const me = needMe();
    db.feedbackVotes = db.feedbackVotes.filter((v) => !(v.feedback_id === id && v.user_id === me));
    if (value) db.feedbackVotes.push({ feedback_id: id, user_id: me, value });
    persist();
  },
  async commentFeedback(id, body, parentId = null) {
    const me = needMe();
    if (!body?.trim()) throw new Error('Skriv något först.');
    db.feedbackComments.push({ id: uuid(), feedback_id: id, parent_id: parentId, author_id: me, body: body.trim(), created_at: now() });
    persist();
  },
  async deleteFeedback(id) {
    const f = db.feedback.find((x) => x.id === id);
    if (f && f.author_id === needMe()) { removeFeedback(id); persist(); } else await api.editorDelete('feedback', id);
  },
  async deleteFeedbackComment(id) {
    const me = needMe();
    const c = db.feedbackComments.find((x) => x.id === id);
    if (!c || (c.author_id !== me && !db.editors.includes(me))) throw new Error('Det gick inte att ta bort.');
    const gone = new Set([id]);
    for (let n = 0; n !== gone.size;) { n = gone.size; db.feedbackComments.forEach((x) => { if (gone.has(x.parent_id)) gone.add(x.id); }); }
    db.feedbackComments = db.feedbackComments.filter((x) => !gone.has(x.id)); persist();
  },
  async setFeedbackStatus(id, status) {
    const me = needEditor();
    const f = db.feedback.find((x) => x.id === id);
    if (!f) throw new Error('Finns inte.');
    f.status = status || null;
    if (status) {
      log(me, 'feedback_status', id, `satte ”${f.title.slice(0, 60)}” som ${status}`);
      if (f.author_id !== me) notify(f.author_id, 'admin', `markerade din feedback ”${f.title.slice(0, 60)}” som ${status}`, { actor_id: me });
    }
    persist();
  },

  async badges() {
    const me = db.session;
    if (!me) return { notifications: 0, messages: 0, todos: 0 };
    const mine = new Set(db.posts.filter((p) => p.author_id === me).map((p) => p.id));
    return {
      notifications: db.notifications.filter((n) => n.user_id === me && !n.read).length,
      messages: db.messages.filter((m) => m.to_id === me && !m.read).length + chatsFor(me).filter((c) => !c.muted).reduce((n, c) => n + c.unread, 0),
      todos: db.comments.filter((c) => mine.has(c.post_id) && (c.status === 'granted' || c.status === 'applied')).length
        + (db.editors.includes(me) ? db.reports.filter((r) => !r.done_at).length + db.adminRequests.filter((r) => r.status === 'pending').length : 0),
    };
  },
};
