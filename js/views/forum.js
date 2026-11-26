// Forum: ett litet Reddit. Samtal heter o/namn och har trådar med röster och kommentarer.
// o/feedback (förslag och problem med appen) är fäst överst. En tråd kan visa befintliga inlägg från appen.
import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, go, attempt, toast } from '../store.js';
import { Icon, Avatar, Header, Loading, ErrorBox, linkify, ReportForm } from '../ui.js';
import { timeAgo, plainText, forumSlug } from '../util.js';
import { Votes, Reply, Comment } from './help.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const STATUS_TABS = [['forslag', 'Förslag', null], ['planerad', 'Planerade', 'planerad'], ['klar', 'Klara', 'klar']];
const STATUS = [[null, 'Förslag'], ['planerad', 'Planerad'], ['klar', 'Klar']];
const StatusChip = ({ status }) => status ? html`<span class=${'fb-status ' + status}>${status === 'klar' ? '✓ Klar' : 'Planerad'}</span>` : null;
const byVotes = (a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at);
const byActivity = (a, b) => (b.last_activity_at || b.created_at).localeCompare(a.last_activity_at || a.created_at);
const threadHref = (t) => `#/o/${t.forum?.slug || 'feedback'}/${t.id}`;

// ---------- Fliken Forum i flödet: sök överst, o/feedback fäst, sedan alla samtal efter senaste aktivitet ----------
export function ForumHome() {
  const list = useAsync(() => api.listForums(), []);
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem('forum-q') || ''; } catch { return ''; } });
  const [hits, setHits] = useState(null);
  useEffect(() => {
    try { sessionStorage.setItem('forum-q', q); } catch {}
    if (!q.trim()) { setHits(null); return; }
    let alive = true;
    const t = setTimeout(() => api.searchForum(q).then((r) => alive && setHits(r), () => {}), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const all = list.data || [];
  return html`<div class="forum-home">
    <label class="forum-search">
      <${Icon} name="search" size=${18} />
      <input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Sök samtal och trådar" aria-label="Sök i forumet" />
      ${q && html`<button type="button" class="link subtle" aria-label="Rensa" onClick=${() => setQ('')}>✕</button>`}
    </label>
    ${q.trim() ? (!hits ? html`<${Loading} />` : html`
      ${hits.forums.length > 0 && html`<div class="label pad-x">Samtal</div><div class="forum-list">${hits.forums.map((f) => html`<${ForumRow} key=${f.id} f=${f} />`)}</div>`}
      ${hits.threads.length > 0 && html`<div class="label pad-x">Trådar</div><div class="forum-list">${hits.threads.map((t) => html`<${ThreadRow} key=${t.id} t=${t} showForum />`)}</div>`}
      ${!hits.forums.length && !hits.threads.length && html`<p class="empty">Inget samtal eller tråd matchar ”${q.trim()}”.
        <br /><a href=${'#/o-nytt?namn=' + encodeURIComponent(forumSlug(q))}>Starta o/${forumSlug(q) || 'ett-samtal'} ›</a></p>`}`)
    : list.loading && !list.data ? html`<${Loading} />` : list.error ? html`<${ErrorBox} error=${list.error} />`
    : html`<div class="forum-list">${all.map((f) => html`<${ForumRow} key=${f.id} f=${f} />`)}</div>
      ${all.length < 3 && html`<p class="muted small pad-x">Saknas ett samtal? Tryck på <b>+</b> och starta ett – t.ex. o/solceller eller o/odling.</p>`}`}
  </div>`;
}

function ForumRow({ f }) {
  return html`<a class=${'forum-row' + (f.pinned ? ' pinned' : '')} href=${'#/o/' + f.slug}>
    <span class="forum-mark" aria-hidden="true">${f.pinned ? html`<${Icon} name="pin" size=${18} />` : 'o/'}</span>
    <span class="forum-main">
      <strong>o/${f.slug}${f.pinned && html` <span class="pin-tag">Fäst</span>`}</strong>
      ${f.description && html`<span class="forum-desc">${f.description}</span>`}
      <small class="muted">${f.thread_count != null ? plural(f.thread_count, 'tråd', 'trådar') + ' · ' : ''}aktiv ${timeAgo(f.last_activity_at || f.created_at)}</small>
    </span>
    <span class="fb-go" aria-hidden="true">›</span>
  </a>`;
}

function ThreadRow({ t, showForum = false, onChange }) {
  return html`<a class="fb-card" href=${threadHref(t)}>
    <span class="fb-meta">${showForum && html`<b>o/${t.forum?.slug}</b> · `}<${Avatar} src=${t.author?.avatar_url} name=${t.author?.name || '?'} size=${20} /> ${t.author?.name || 'Borttagen'} · ${timeAgo(t.last_activity_at || t.created_at)} <${StatusChip} status=${t.status} /></span>
    <strong class="fb-title">${t.title}</strong>
    ${t.body && html`<span class="fb-excerpt">${t.body}</span>`}
    <span class="fb-bar"><${Votes} f=${t} onChange=${onChange} />
      <span class="pill"><${Icon} name="chat" size=${16} /> ${t.comment_count}</span>
      ${t.post_ids?.length > 0 && html`<span class="pill"><${Icon} name="image" size=${16} /> ${plural(t.post_ids.length, 'inlägg', 'inlägg')}</span>`}</span>
  </a>`;
}

// ---------- Starta ett samtal ----------
export function NewForum({ name }) {
  const [slug, setSlug] = useState(forumSlug(name || ''));
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    const s = await attempt(() => api.createForum({ slug, description: desc }), `o/${forumSlug(slug)} är startat`);
    setBusy(false);
    if (s) go('/o/' + s);
  }
  return html`<div class="page">
    <${Header} title="Starta ett samtal" back />
    <form class="form forum-new" onSubmit=${submit}>
      <label>Namn
        <span class="slug-field"><span class="muted">o/</span><input required autofocus value=${slug} maxlength="40" onInput=${(e) => setSlug(forumSlug(e.target.value) + (/[\s-]$/.test(e.target.value) ? '-' : ''))} placeholder="t.ex. solceller" /></span></label>
      <label>Vad handlar det om? <small class="muted">(valfritt)</small>
        <textarea rows="3" maxlength="500" value=${desc} onInput=${(e) => setDesc(e.target.value)} placeholder="En mening om vad som hör hemma här."></textarea></label>
      <p class="muted small">Alla kan skriva trådar i samtalet, rösta och kommentera. Namnet går inte att ändra efteråt.</p>
      <button class="btn primary" disabled=${busy || forumSlug(slug).length < 2}>${busy ? 'Startar…' : 'Starta o/' + (forumSlug(slug) || '…')}</button>
    </form>
  </div>`;
}

// ---------- Ett samtal: trådar ----------
export function ForumView({ slug }) {
  const s = useStore();
  const forum = useAsync(() => api.getForum(slug), [slug]);
  const f = forum.data;
  const threads = useAsync(() => (f ? api.listFeedback(f.id) : Promise.resolve(null)), [f?.id]);
  const isFeedback = f?.slug === 'feedback';
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('fb-tab') || 'forslag'; } catch { return 'forslag'; } });
  const [sort, setSort] = useState('nytt');
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState('');
  const chooseTab = (t) => { setTab(t); try { sessionStorage.setItem('fb-tab', t); } catch {} };
  const all = threads.data || [];
  const status = STATUS_TABS.find(([k]) => k === tab)?.[2] ?? null;
  const items = isFeedback ? all.filter((t) => (t.status || null) === status).sort(byVotes) : [...all].sort(sort === 'topp' ? byVotes : byActivity);
  const count = (st) => all.filter((t) => (t.status || null) === st).length;
  const canEdit = f && (f.created_by === s.me.id || s.me.is_editor);
  async function saveDesc(e) {
    e.preventDefault();
    if (await attempt(() => api.updateForum(f.id, { description: desc }), 'Sparat')) { setEditing(false); forum.reload(); }
  }
  return html`<div class="page feedback forum">
    <${Header} title=${'o/' + forumSlug(slug)} back />
    ${forum.loading && !f ? html`<${Loading} />` : forum.error ? html`<${ErrorBox} error=${forum.error} />` : html`
      ${editing ? html`<form class="fb-compose" onSubmit=${saveDesc}>
          <textarea rows="3" maxlength="500" value=${desc} onInput=${(e) => setDesc(e.target.value)} aria-label="Beskrivning"></textarea>
          <div class="fb-compose-actions"><button type="button" class="btn small" onClick=${() => setEditing(false)}>Avbryt</button><button class="btn small primary">Spara</button></div></form>`
        : (f.description || canEdit) && html`<p class="fb-intro">${f.description ? linkify(f.description) : html`<span class="muted">Ingen beskrivning än.</span>`}
          ${canEdit && html` <button class="link small" onClick=${() => { setDesc(f.description || ''); setEditing(true); }}>Ändra</button>`}</p>`}
      <div class="fb-compose-wrap"><${NewThread} forum=${f} onDone=${() => { if (isFeedback) chooseTab('forslag'); setSort('nytt'); threads.reload(); }} /></div>
      ${isFeedback
        ? html`<div class="filterbar fb-tabs" role="tablist">${STATUS_TABS.map(([k, label, st]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => chooseTab(k)}>
            ${label}${threads.data ? html` <span class="tab-n">${count(st)}</span>` : ''}</button>`)}</div>`
        : html`<div class="forum-sort"><div class="stance-switch" role="radiogroup" aria-label="Sortera">
            ${[['nytt', 'Senaste'], ['topp', 'Mest röster']].map(([k, label]) => html`<button type="button" role="radio" aria-checked=${sort === k} class=${sort === k ? 'on' : ''} onClick=${() => setSort(k)}>${label}</button>`)}</div></div>`}
      ${threads.loading && !threads.data ? html`<${Loading} />` : threads.error ? html`<${ErrorBox} error=${threads.error} />`
        : !items.length ? html`<p class="empty">${isFeedback ? { forslag: 'Inga förslag än – bli först!', planerad: 'Inget är planerat just nu.', klar: 'Inget är klart än.' }[tab] : 'Inga trådar än – skriv den första!'}</p>`
        : html`<div class="fb-list">${items.map((t) => html`<${ThreadRow} key=${t.id} t=${{ ...t, forum: t.forum || f }} onChange=${threads.reload} />`)}</div>`}`}
  </div>`;
}

// "Skapa tråd": ser ut som ett fält, öppnas till rubrik, text och inlägg från appen.
function NewThread({ forum, onDone }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posts, setPosts] = useState([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const isFeedback = forum.slug === 'feedback';
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    const id = await attempt(() => api.createFeedback({ title, body, forumId: forum.id, postIds: posts.map((p) => p.id) }), 'Publicerat – nu kan andra rösta och kommentera');
    setBusy(false);
    if (id) { setTitle(''); setBody(''); setPosts([]); setOpen(false); onDone(); }
  }
  if (!open) return html`<button class="fb-compose-closed" onClick=${() => setOpen(true)}>
    <${Avatar} src=${s.me.avatar_url} name=${s.me.name} size=${32} /><span>${isFeedback ? 'Skriv ett förslag eller problem…' : `Skriv något i o/${forum.slug}…`}</span></button>`;
  return html`<form class="fb-compose" onSubmit=${submit}>
    <input required autofocus maxlength="140" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder=${isFeedback ? 'Rubrik – en sak per inlägg' : 'Rubrik'} aria-label="Rubrik" />
    <textarea rows="4" maxlength="4000" value=${body} onInput=${(e) => setBody(e.target.value)} aria-label="Text"
      placeholder=${isFeedback ? 'Beskriv mer: vad vill du kunna göra, eller vad hände och vad hade du väntat dig?' : 'Text (valfritt)'}></textarea>
    ${posts.length > 0 && html`<${PostStrip} posts=${posts} onRemove=${(p) => setPosts((xs) => xs.filter((x) => x.id !== p.id))} />`}
    ${picking ? html`<${PostPicker} chosen=${posts} onPick=${(p) => setPosts((xs) => xs.some((x) => x.id === p.id) ? xs.filter((x) => x.id !== p.id) : [...xs, p].slice(0, 20))} onClose=${() => setPicking(false)} />`
      : html`<button type="button" class="link small add-posts" onClick=${() => setPicking(true)}><${Icon} name="image" size=${16} /> Lägg till inlägg från appen</button>`}
    <div class="fb-compose-actions"><button type="button" class="btn small" onClick=${() => setOpen(false)}>Avbryt</button>
      <button class="btn small primary" disabled=${busy || title.trim().length < 3}>${busy ? 'Publicerar…' : 'Publicera'}</button></div>
  </form>`;
}

// Välj befintliga inlägg (alla sorter): de senaste visas direkt, sök för att hitta andra.
function PostPicker({ chosen, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const found = useAsync(() => api.listPosts({ q: debounced, limit: 30 }), [debounced]);
  const ids = new Set(chosen.map((p) => p.id));
  return html`<div class="post-picker">
    <div class="post-picker-head">
      <input type="search" autofocus value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Sök bland inlägg…" aria-label="Sök inlägg" />
      <button type="button" class="btn small" onClick=${onClose}>Klar</button>
    </div>
    ${found.loading && !found.data ? html`<${Loading} />` : html`<div class="post-picker-list">
      ${(found.data || []).map((p) => html`<button type="button" key=${p.id} class=${'pp-item' + (ids.has(p.id) ? ' on' : '')} aria-pressed=${ids.has(p.id)} onClick=${() => onPick(p)}>
        ${p.slides[0] && p.slides[0].media_type !== 'video' ? html`<img src=${p.slides[0].thumb_url || p.slides[0].image_url} alt="" loading="lazy" />` : html`<span class="pp-text">${plainText(p.caption).slice(0, 40)}</span>`}
        <span class="pp-main"><span class="pp-cap">${plainText(p.caption).slice(0, 90) || 'Utan text'}</span><small class="muted">${p.group?.name || p.author?.name} · ${timeAgo(p.created_at)}</small></span>
        <span class="pp-check" aria-hidden="true">${ids.has(p.id) ? '✓' : '+'}</span>
      </button>`)}
      ${found.data && !found.data.length && html`<p class="muted small">Inga inlägg matchar.</p>`}
    </div>`}
  </div>`;
}

// Inläggen i en tråd: små kort som går att svepa i sidled när de inte får plats.
function PostStrip({ posts, onRemove }) {
  return html`<div class=${'post-strip' + (posts.length === 1 ? ' single' : '')}>
    ${posts.map((p) => html`<div class="ps-card" key=${p.id}>
      <a href=${'#/post/' + p.id}>
        ${p.slides[0] && p.slides[0].media_type !== 'video'
          ? html`<span class="ps-img" style=${p.slides[0].placeholder ? `background-image:url(${p.slides[0].placeholder})` : ''}><img src=${p.slides[0].thumb_url || p.slides[0].image_url} alt="" loading="lazy" decoding="async" /></span>`
          : html`<span class="ps-img ps-textimg"><span>${plainText(p.caption).slice(0, 90)}</span></span>`}
        <span class="ps-body"><span class="ps-cap">${plainText(p.caption) || 'Utan text'}</span>
          <small class="muted">${p.group?.name || p.author?.name}</small></span>
      </a>
      ${onRemove && html`<button type="button" class="ps-x" aria-label="Ta bort ur tråden" onClick=${() => onRemove(p)}>✕</button>`}
    </div>`)}
  </div>`;
}

// ---------- En tråd ----------
export function ThreadView({ id }) {
  const s = useStore();
  const f = useAsync(() => api.getFeedback(id), [id]);
  const [reporting, setReporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const x = f.data;
  const mine = x?.author_id === s.me.id;
  const isFeedback = x?.forum?.slug === 'feedback';
  const kids = {};
  for (const c of x?.comments || []) (kids[c.parent_id || 'root'] ||= []).push(c);
  async function del() {
    if (!confirm(mine ? 'Ta bort din tråd?' : 'Ta bort tråden som Redaktionen? Det syns i historiken.')) return;
    if (await attempt(() => api.deleteFeedback(id), 'Borttaget')) go('/o/' + (x.forum?.slug || 'feedback'));
  }
  async function setStatus(st) {
    if ((x.status || null) === st) return;
    if (await attempt(() => api.setFeedbackStatus(id, st), st ? `Flyttat till ${st === 'klar' ? 'Klara' : 'Planerade'}` : 'Flyttat till Förslag')) f.reload();
  }
  async function setPosts(list) {
    if (await attempt(() => api.setThreadPosts(id, list.map((p) => p.id)))) f.reload();
  }
  return html`<div class="page feedback forum">
    <${Header} title=${x?.forum ? 'o/' + x.forum.slug : 'Forum'} back />
    ${f.loading && !x ? html`<${Loading} />` : f.error ? html`<${ErrorBox} error=${f.error} />` : html`
      <article class="fb-post">
        <span class="fb-meta"><a href=${'#/o/' + x.forum?.slug}><b>o/${x.forum?.slug}</b></a> · <${Avatar} src=${x.author?.avatar_url} name=${x.author?.name || '?'} size=${24} />
          <a href=${'#/profil/' + x.author?.id}>${x.author?.name}</a> · ${timeAgo(x.created_at)} <${StatusChip} status=${x.status} /></span>
        <h2>${x.title}</h2>
        ${x.body && html`<p class="fb-body">${linkify(x.body)}</p>`}
        ${x.posts.length > 0 && html`<${PostStrip} posts=${x.posts} onRemove=${mine ? (p) => setPosts(x.posts.filter((y) => y.id !== p.id)) : null} />`}
        ${mine && (picking
          ? html`<${PostPicker} chosen=${x.posts} onPick=${(p) => setPosts(x.posts.some((y) => y.id === p.id) ? x.posts.filter((y) => y.id !== p.id) : [...x.posts, p].slice(0, 20))} onClose=${() => setPicking(false)} />`
          : html`<button type="button" class="link small add-posts" onClick=${() => setPicking(true)}><${Icon} name="image" size=${16} /> Lägg till inlägg från appen</button>`)}
        <div class="fb-bar">
          <${Votes} f=${x} />
          <span class="pill"><${Icon} name="chat" size=${16} /> ${x.comments.length}</span>
          <span class="fb-more">
            ${(mine || s.me.is_editor) && html`<button class="link small muted" onClick=${del}>Ta bort</button>`}
            ${!mine && html`<button class="link small muted" onClick=${() => setReporting(true)}>Anmäl</button>`}
          </span>
        </div>
        ${isFeedback && s.me.is_editor && html`<div class="fb-status-set">
          <span class="muted small">Redaktionen:</span>
          <div class="seg" role="radiogroup" aria-label="Status">${STATUS.map(([st, label]) => html`<button role="radio" aria-checked=${(x.status || null) === st}
            class=${(x.status || null) === st ? 'on' : ''} onClick=${() => setStatus(st)}>${label}</button>`)}</div>
        </div>`}
      </article>
      <div class="fb-comments">
        <${Reply} onSend=${async (b) => { const ok = await attempt(() => api.commentFeedback(id, b)); if (ok) f.reload(); return ok; }} />
        ${!x.comments.length && html`<p class="muted small fb-none">Inga kommentarer än. Vad tycker du?</p>`}
        ${(kids.root || []).map((c) => html`<${Comment} key=${c.id} c=${c} kids=${kids} me=${s.me.id} editor=${s.me.is_editor} feedbackId=${id} reload=${f.reload} />`)}
      </div>
      ${reporting && html`<${ReportForm} kind="feedback" id=${id} name=${x.title.slice(0, 60)} onClose=${() => setReporting(false)} />`}`}
  </div>`;
}
