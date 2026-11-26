// Notiser, checklistan och meddelanden (enkla, utan lästkvitton eller andra beroendeskapande finesser).
import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, go, goBack, attempt, refreshBadges, toast, state } from '../store.js';
import { Icon, Avatar, Header, UserRow, Loading, ErrorBox, linkify, useMyPledges, pledgesChanged, swishNote } from '../ui.js';
import { fmtKr, timeAgo, plainText } from '../util.js';

const KIND = { post: 'Inlägg', group: 'Grupp', user: 'Användare', feedback: 'Feedback' };
const targetHref = (r) => ({ post: '#/post/', group: '#/grupp/', user: '#/profil/', feedback: '#/feedback/' }[r.kind] + r.target_id);

// Anmälningar som hela Redaktionen delar, och en kort historik över vad som gjorts (som går att ångra).
function EditorChecklist() {
  const t = useAsync(() => api.editorTodos(), []);
  const [showDone, setShowDone] = useState(false);
  const reports = t.data?.reports || [];
  const open = reports.filter((r) => !r.done_at);
  const done = reports.filter((r) => r.done_at);
  async function check(r, on) {
    if (await attempt(() => api.setReportDone(r.id, on), on ? 'Avbockad – syns i historiken' : 'Öppnad igen')) { refreshBadges(); t.reload(); }
  }
  async function revert(l) {
    if (!confirm(`Ångra: ${l.actor?.name || 'någon'} ${l.summary}?` + (l.actor?.id ? ' Hen får en notis om att det ångrades.' : ''))) return;
    if (await attempt(() => api.revertLog(l.id), 'Ångrat – noterat i historiken')) { refreshBadges(); t.reload(); }
  }
  async function decide(r, yes) {
    if (await attempt(() => api.decideAdminRequest(r.id, yes), yes ? `${r.user?.name} får bekräfta och blir sedan admin` : 'Avslaget')) { refreshBadges(); t.reload(); }
  }
  const adminReqs = t.data?.adminRequests || [];
  const reversible = (l) => !l.reverted_at && ['report_done', 'editor_add', 'editor_remove', 'feedback_status'].includes(l.action);
  const item = (r) => html`<label class=${'todo' + (r.done_at ? ' done' : '')} key=${r.id}>
    <input type="checkbox" checked=${!!r.done_at} onChange=${(e) => check(r, e.target.checked)} />
    <span><span class="kind-tag">${KIND[r.kind]}</span> <a href=${targetHref(r)}><strong>${r.target_name || 'Öppna'}</strong></a>
      <small>”${r.reason}”</small>
      <small class="muted">Anmält av ${r.reporter?.name || 'okänd'} · ${timeAgo(r.created_at)}${r.done_at ? ` · avbockad av ${r.doer?.name || '?'}` : ''}</small></span>
  </label>`;
  if (t.loading && !t.data) return html`<${Loading} />`;
  return html`<section class="todo-sec">
    <h2 class="todo-title">Redaktionens checklista</h2>
    ${adminReqs.length > 0 && html`<div class="label pad-x">Vill bli admin</div><div class="list">${adminReqs.map((r) => html`<div class="todo admin-req" key=${r.id}>
      <span class="todo-dot" aria-hidden="true"></span>
      <span><a href=${'#/profil/' + r.user_id}><strong>${r.user?.name || 'Någon'}</strong></a> vill bli admin för <a href=${'#/grupp/' + r.group_id}><strong>${r.group?.name || 'gruppen'}</strong></a>
        <small>”${r.message}”</small><small class="muted">${timeAgo(r.created_at)}</small>
        <span class="btnrow"><button class="btn primary small" onClick=${() => decide(r, true)}>Godkänn</button><button class="btn small" onClick=${() => decide(r, false)}>Avslå</button></span></span>
    </div>`)}</div>`}
    ${adminReqs.length > 0 && html`<div class="label pad-x">Anmälningar</div>`}
    <ol class="steps-list"><li>Öppna det som anmälts.</li><li>Ta bort det om det bryter mot villkoren (via ··· eller längst ner på sidan).</li><li>Bocka av det här.</li></ol>
    ${open.length ? html`<div class="list">${open.map(item)}</div>` : html`<p class="muted small pad-x">Inga anmälningar att gå igenom.</p>`}
    ${done.length > 0 && html`<button class="link small pad-x" onClick=${() => setShowDone((x) => !x)}>${showDone ? 'Dölj' : 'Visa'} avbockade (${done.length})</button>
      ${showDone && html`<div class="list">${done.map(item)}</div>`}`}
    ${t.data?.log.length > 0 && html`<details class="history"><summary>Historik</summary>
      <ul>${t.data.log.map((l) => html`<li key=${l.id} class=${l.reverted_at ? 'reverted' : ''}>
        <span><b>${l.actor?.name || 'Någon'}</b> ${l.summary} <small class="muted">${timeAgo(l.created_at)}</small>
          ${l.reverted_at && html`<small class="notice">Ångrat av ${l.reverter?.name || '?'} ${timeAgo(l.reverted_at)}</small>`}</span>
        ${reversible(l) && html`<button class="link small" onClick=${() => revert(l)}>Ångra</button>`}
      </li>`)}</ul></details>`}
  </section>`;
}

export function Notifications() {
  const n = useAsync(async () => {
    const list = await api.listNotifications();
    api.markNotificationsRead().then(refreshBadges);
    return list;
  }, []);
  return html`<div class="page">
    <${Header} title="Notiser" back />
    ${n.loading && !n.data ? html`<${Loading} />` : n.error ? html`<${ErrorBox} error=${n.error} />`
      : n.data.length === 0 ? html`<p class="empty">Inga notiser än. Här hamnar kommentarer, ansökningar och beslut.</p>`
      : html`<div class="list">${n.data.map((x) => html`<a key=${x.id} class=${'row notif' + (x.read ? '' : ' unread')}
          href=${x.link ? x.link : x.post_id ? '#/post/' + x.post_id : x.group_id ? '#/grupp/' + x.group_id : '#/'}>
          ${x.actor ? html`<${Avatar} src=${x.actor.avatar_url} name=${x.actor.name} size=${40} />` : html`<span class="avatar sys">★</span>`}
          <span class="row-main"><span>${x.actor && html`<strong>${x.actor.name}</strong> `}${plainText(x.body)}</span>
            <small class="muted">${timeAgo(x.created_at)}</small></span></a>`)}</div>`}
  </div>`;
}

// Insamlingar: swisha det man lovat när en insamling genomförs, och bestäm nästa steg för egna insamlingar vars tid är ute.
function PledgeTodos() {
  const list = useMyPledges();
  const ended = useAsync(() => api.settlePledges().then(() => api.myEndedFundraisers()), []);
  const due = (list || []).filter((x) => x.post.pledge_state === 'collect');
  const toPay = due.filter((x) => !x.paid_at), paid = due.filter((x) => x.paid_at);
  const decide = ended.data || [];
  if (!toPay.length && !paid.length && !decide.length) return null;
  async function mark(x, on) {
    if (on && !confirm(`Har du swishat ${fmtKr(x.amount)} till ${x.post.swish}?`)) return;
    if (await attempt(() => api.setPledgePaid(x.post_id, on), on ? 'Tack! Markerat som betalt' : 'Ångrat')) pledgesChanged();
  }
  const why = (x) => html`<small>För <a href=${'#/post/' + x.post.id}>”${swishNote(x.post.caption)}”</a>${x.post.group ? ` · ${x.post.group.name}` : ` · ${x.post.author?.name || ''}`}</small>`;
  const item = (x) => html`<label class=${'todo' + (x.paid_at ? ' done' : '')} key=${x.post_id}>
    <input type="checkbox" checked=${!!x.paid_at} onChange=${(e) => { const on = e.target.checked; e.target.checked = !!x.paid_at; mark(x, on); }} />
    <span>Swisha <strong>${fmtKr(x.amount)}</strong> till <strong>${x.post.swish}</strong>${x.post.swish_name ? ` (${x.post.swish_name})` : ''}
      ${why(x)}${!x.paid_at && html`<small class="muted">Märk betalningen ”${swishNote(x.post.caption)}”. Bocka i när du har swishat.</small>`}</span>
  </label>`;
  return html`<section class="todo-sec">
    <h2 class="todo-title">Insamlingar</h2>
    ${decide.length > 0 && html`<div class="label pad-x">Tiden är ute – välj nästa steg</div><div class="list">${decide.map((p) => html`<a class="todo" key=${p.id} href=${'#/post/' + p.id}>
      <span class="todo-dot" aria-hidden="true"></span>
      <span><strong>”${swishNote(p.caption)}”</strong> fick ${fmtKr(p.pledged_total)} av ${fmtKr(p.amount)} (${p.amount ? Math.round((p.pledged_total / p.amount) * 100) : 0} %)
        <small class="muted">Öppna för att samla in ändå, förlänga eller avbryta</small></span></a>`)}</div>`}
    ${toPay.length > 0 && html`<div class="label pad-x">Att swisha</div><div class="list">${toPay.map(item)}</div>`}
    ${paid.length > 0 && html`<div class="label pad-x">Betalt</div><div class="list">${paid.map(item)}</div>`}
  </section>`;
}

export function Todos() {
  const s = useStore();
  const t = useAsync(() => api.listTodos(), []);
  const pl = useMyPledges();
  async function pay(x) {
    if (!confirm(`Har du skickat ${fmtKr(x.applied_amount)} till ${x.group?.name || x.author.name}?`)) return;
    if (await attempt(() => api.markPaid(x.id), 'Markerat som utbetalt')) { refreshBadges(); t.reload(); }
  }
  const all = t.data || [];
  const decide = all.filter((x) => x.status === 'applied');
  const open = all.filter((x) => x.status === 'granted');
  const done = all.filter((x) => x.status === 'paid');
  const who = (x) => html`<strong>${x.group?.name || x.author.name}</strong>${x.group ? html` <span class="muted">(via ${x.author.name})</span>` : ''}`;
  const postLink = (x) => html`<small><a href=${'#/post/' + x.post.id}>${plainText(x.post.caption).slice(0, 60)}${plainText(x.post.caption).length > 60 ? '…' : ''}</a></small>`;
  const payItem = (x) => {
    const bank = x.payout?.startsWith('Bankkonto');
    const to = x.payout?.replace(/^(Swish|Bankkonto):\s*/, '') || '(uppgift saknas)';
    return html`<label class=${'todo' + (x.status === 'paid' ? ' done' : '')} key=${x.id}>
      <input type="checkbox" checked=${x.status === 'paid'} disabled=${x.status === 'paid'} onChange=${(e) => { e.target.checked = false; pay(x); }} />
      <span>${bank ? 'Betala' : 'Swisha'} ${who(x)} ${fmtKr(x.applied_amount)} till ${bank ? 'bankkonto ' : ''}<strong>${to}</strong>${postLink(x)}</span>
    </label>`;
  };
  return html`<div class="page">
    <${Header} title="Checklista" back />
    ${s.me.is_editor && html`<${EditorChecklist} />`}
    <${PledgeTodos} />
    ${t.loading && !t.data ? html`<${Loading} />` : t.error ? html`<${ErrorBox} error=${t.error} />` : all.length === 0
      ? !(pl || []).some((x) => x.post.pledge_state === 'collect') && html`<p class="empty">Inget att göra just nu. Här hamnar det du ska swisha när en insamling du stöttar genomförs.</p>`
      : html`<section class="todo-sec">
      <h2 class="todo-title">Ansökningar</h2>
      ${decide.length > 0 && html`<div class="label pad-x">Ansökningar att besluta om</div>
        <div class="list">${decide.map((x) => html`<a class="todo" key=${x.id} href=${'#/post/' + x.post.id}>
          <span class="todo-dot" aria-hidden="true"></span>
          <span>${who(x)} söker ${fmtKr(x.applied_amount)}<small class="muted">Öppna inlägget för att bevilja eller avslå</small></span></a>`)}</div>`}
      ${open.length > 0 && html`<div class="label pad-x">Att betala ut</div><div class="list">${open.map(payItem)}</div>`}
      ${done.length > 0 && html`<div class="label pad-x">Klart</div><div class="list">${done.map(payItem)}</div>`}
    </section>`}
  </div>`;
}

const dayLabel = (iso) => {
  const d = new Date(iso), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Idag';
  if (d.toDateString() === y.toDateString()) return 'Igår';
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
};
const clock = (iso) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

// Reaktioner på meddelanden: tryck på en bubbla för hjärta eller tumme upp – + öppnar telefonens emojitangentbord (dubbeltryck ger ett hjärta).
// Reaktionerna visas under bubblan; tryck på en för att lägga till eller ta bort din egen.
const QUICK = ['❤️', '👍'];
// Första emojin i det man skrivit (telefonens emojitangentbord), annars null.
function firstEmoji(text) {
  const parts = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('sv', { granularity: 'grapheme' }).segment(text)].map((x) => x.segment) : [...text];
  return parts.find((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)) || null;
}
function Bubble({ kind, m, mine, tail }) {
  const me = state.me?.id;
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);   // + öppnar telefonens tangentbord för valfri emoji
  const [rs, setRs] = useState(m.reactions || []);
  const wrap = useRef();
  const emojiInput = useRef();   // fokuseras direkt i trycket, annars öppnar iPhone inte tangentbordet
  useEffect(() => setRs(m.reactions || []), [m.reactions]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!wrap.current?.contains(e.target)) { setOpen(false); setTyping(false); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  async function toggle(emoji) {
    const has = rs.some((r) => r.user_id === me && r.emoji === emoji);
    const before = rs;
    setRs(has ? rs.filter((r) => !(r.user_id === me && r.emoji === emoji)) : [...rs, { user_id: me, emoji }]);
    setOpen(false); setTyping(false);
    try { await api.react(kind, m.id, emoji, !has); } catch (e) { setRs(before); toast(e.message); }
  }
  const groups = [];
  for (const r of rs) {
    let g = groups.find((x) => x.emoji === r.emoji);
    if (!g) groups.push(g = { emoji: r.emoji, n: 0, mine: false });
    g.n++; if (r.user_id === me) g.mine = true;
  }
  return html`<div class=${'bubble-row' + (mine ? ' mine' : '')}>
    <div class="bubble-wrap" ref=${wrap}>
      ${open && html`<div class="react-picker" role="menu" aria-label="Reagera">
        ${QUICK.map((e) => html`<button type="button" role="menuitem" key=${e}
          class=${rs.some((r) => r.user_id === me && r.emoji === e) ? 'on' : ''} onClick=${() => toggle(e)} aria-label=${`Reagera med ${e}`}>${e}</button>`)}
        <input ref=${emojiInput} class=${'react-input' + (typing ? '' : ' hidden')} enterkeyhint="done" aria-label="Välj en emoji med tangentbordet" placeholder="🙂"
          onInput=${(e) => { const em = firstEmoji(e.target.value); if (em) toggle(em); else e.target.value = ''; }} />
        ${!typing && html`<button type="button" class="react-more" aria-label="Annan emoji" title="Annan emoji – öppnar tangentbordet"
          onClick=${() => { setTyping(true); emojiInput.current?.focus(); }}>+</button>`}
      </div>`}
      <div class=${'bubble' + (tail ? ' tail' : '') + (m.pending ? ' pending' : '')} title="Tryck för att reagera" onClick=${() => !m.pending && setOpen((o) => !o)} onDblClick=${(e) => { e.preventDefault(); if (!m.pending) toggle('❤️'); }}>${linkify(m.body)}</div>
      ${groups.length > 0 && html`<div class="reactions">${groups.map((g) => html`<button type="button" key=${g.emoji} class=${'react-chip' + (g.mine ? ' on' : '')}
        onClick=${() => toggle(g.emoji)} aria-label=${`${g.emoji} ${g.n}${g.mine ? ', du har reagerat' : ''}`}>${g.emoji}${g.n > 1 ? html`<span>${g.n}</span>` : ''}</button>`)}</div>`}
    </div>
  </div>`;
}

let inboxCache = { c: null, ch: null };   // listan visas direkt nästa gång, och hämtas om i bakgrunden
export function Inbox() {
  const s = useStore();
  const c0 = useAsync(() => api.listConversations(), []);
  const ch0 = useAsync(() => api.listChats(), []);
  if (c0.data) inboxCache.c = c0.data;
  if (ch0.data) inboxCache.ch = ch0.data;
  const c = { ...c0, data: c0.data || inboxCache.c };
  const ch = { ...ch0, data: ch0.data || inboxCache.ch };
  // Alla samtal i en lista, senaste först: två personer (som förut) och samtal med flera eller med en hel grupp.
  const rows = [
    ...(c.data || []).map((x) => ({ key: 'u' + x.user.id, at: x.last.created_at, href: '#/meddelanden/' + x.user.id, unread: x.unread, muted: false,
      avatar: html`<${Avatar} src=${x.user.avatar_url} name=${x.user.name} size=${52} />`, title: x.user.name,
      snippet: `${x.last.from_id === s.me.id ? 'Du: ' : ''}${x.last.body}` })),
    ...(ch.data || []).map((x) => ({ key: 'c' + x.id, at: x.last_message_at, href: '#/samtal/' + x.id, unread: x.unread, muted: x.muted,
      avatar: x.group_id ? html`<span class="chat-av group"><${Avatar} src=${x.group_avatar} name=${x.group_name} size=${52} /></span>` : html`<span class="chat-av many"><${Avatar} name=${x.title || x.member_names || 'Samtal'} size=${52} /></span>`,
      title: x.group_id ? x.group_name : x.title || x.member_names || 'Samtal',
      snippet: x.last_body ? `${x.last_from === s.me.id ? 'Du' : (x.last_from_name || '').split(' ')[0]}: ${x.last_body}` : `${x.member_count} deltagare`,
      sub: x.group_id ? 'Hela gruppen' : null })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const loading = (c.loading && !c.data) || (ch.loading && !ch.data);
  return html`<div class="page">
    <${Header} title="Meddelanden" back right=${html`<a class="iconbtn" href="#/meddelanden/ny" aria-label="Nytt meddelande"><${Icon} name="edit" /></a>`} />
    ${loading ? html`<${Loading} />` : c.error ? html`<${ErrorBox} error=${c.error} />`
      : rows.length === 0 ? html`<div class="empty">
          <p>Inga meddelanden än.</p><a class="btn primary" href="#/meddelanden/ny">Skriv ett meddelande</a></div>`
      : html`<div class="list">${rows.map((x) => html`<a key=${x.key} class=${'row convo' + (x.unread && !x.muted ? ' unread' : '')} href=${x.href}>
          ${x.avatar}
          <span class="row-main"><strong>${x.title}${x.sub && html` <small class="chat-kind">${x.sub}</small>`}</strong>
            <small class="snippet">${x.snippet.replace(/\s+/g, ' ')}</small></span>
          <span class="convo-side"><small class="muted">${timeAgo(x.at)}</small>
            ${x.muted ? html`<span class="muted-ico" title="Notiser avstängda"><${Icon} name="bellOff" size=${16} /></span>`
              : x.unread > 0 && html`<span class="unread-dot" aria-label=${`${x.unread} olästa`}></span>`}</span>
        </a>`)}</div>`}
  </div>`;
}

export function Thread({ userId }) {
  const s = useStore();
  const u = useAsync(() => api.getUser(userId), [userId]);
  const t = useAsync(() => api.getThread(userId), [userId]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);   // skickade men inte bekräftade – visas direkt
  const end = useRef();
  const count = (t.data?.length ?? 0) + pending.length;
  useEffect(() => { if (count) { end.current?.scrollIntoView({ block: 'end' }); refreshBadges(); } }, [count]);   // bara när det kommit något nytt
  useEffect(() => { const i = setInterval(() => { if (!document.hidden) t.reload(); }, 15000); return () => clearInterval(i); }, [userId]); // hämtar nya meddelanden då och då
  async function send(e) {
    e?.preventDefault();
    if (!body.trim() || busy) return;
    const text = body;
    setBody(''); setPending((p) => [...p, { id: 'p' + Date.now(), from_id: s.me.id, to_id: userId, body: text, created_at: new Date().toISOString(), pending: true }]);
    if (await attempt(() => api.sendMessage(userId, text))) await t.reload(); else setBody(text);
    setPending([]);
  }
  const user = u.data;
  const msgs = [...(t.data || []), ...pending];
  return html`<div class="page chat">
    <header class="topbar">
      <div class="topbar-side"><button class="iconbtn" aria-label="Tillbaka" onClick=${() => goBack('/meddelanden')}><${Icon} name="back" /></button></div>
      <a class="chat-title" href=${'#/profil/' + userId}>${user && html`<${Avatar} src=${user.avatar_url} name=${user.name} size=${30} />`}<strong>${user?.name || ''}</strong></a>
      <div class="topbar-side right"></div>
    </header>
    <div class="bubbles">
      ${t.loading && !t.data ? html`<${Loading} />` : msgs.length === 0 && user ? html`<div class="chat-start">
          <${Avatar} src=${user.avatar_url} name=${user.name} size=${72} /><strong>${user.name}</strong>
          <small class="muted">Skriv det första meddelandet.</small></div>` : null}
      ${msgs.map((m, i) => {
        const mine = m.from_id === s.me.id;
        const prev = msgs[i - 1], next = msgs[i + 1];
        const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
        const lastInRun = !next || next.from_id !== m.from_id || new Date(next.created_at) - new Date(m.created_at) > 5 * 60e3;
        return html`<${'div'} key=${m.id}>
          ${newDay && html`<div class="day">${dayLabel(m.created_at)}</div>`}
          <${Bubble} kind="dm" m=${m} mine=${mine} tail=${lastInRun} />
          ${lastInRun && html`<div class=${'stamp' + (mine ? ' mine' : '')}>${clock(m.created_at)}</div>`}
        <//>`;
      })}
      <div ref=${end}></div>
    </div>
    <form class="composer" onSubmit=${send}>
      <textarea rows="1" value=${body} placeholder="Meddelande…" aria-label="Meddelande"
        onInput=${(e) => { setBody(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
        onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <button class="send" disabled=${!body.trim() || busy}>Skicka</button>
    </form>
  </div>`;
}

export function NewMessage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const users = useAsync(() => api.listUsers(q), [q]);
  async function openGroup(g) { const id = await attempt(() => api.groupChat(g.id)); if (id) go('/samtal/' + id); }
  return html`<div class="page">
    <${Header} title="Nytt meddelande" back />
    <div class="searchbar"><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Sök efter en person" aria-label="Sök efter en person" autofocus /></div>
    ${!q.trim() && html`<div class="list">
      <a class="row" href="#/meddelanden/flera"><span class="avatar sys new-chat-ico"><${Icon} name="add" size=${22} /></span>
        <span class="row-main"><strong>Samtal med flera</strong><small class="muted">Välj personer och ge samtalet ett namn</small></span></a>
      ${s.myGroups.map((g) => html`<button class="row" key=${g.id} onClick=${() => openGroup(g)}>
        <${Avatar} src=${g.avatar_url} name=${g.name} size=${40} />
        <span class="row-main"><strong>${g.name}</strong><small class="muted">Samtal med hela gruppen</small></span></button>`)}
    </div>
    <div class="label pad-x">Personer</div>`}
    <div class="list">${(users.data || []).filter((u) => u.id !== s.me.id).map((u) => html`<${UserRow} key=${u.id} user=${u} href=${'#/meddelanden/' + u.id} />`)}</div>
  </div>`;
}

// Nytt samtal med flera: bocka i personer, ge ett namn om man vill.
export function NewChat() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState([]);
  const users = useAsync(() => api.listUsers(q), [q]);
  const toggle = (u) => setPicked((xs) => (xs.some((x) => x.id === u.id) ? xs.filter((x) => x.id !== u.id) : [...xs, u]));
  async function create() {
    const id = await attempt(() => api.createChat(title, picked.map((u) => u.id)));
    if (id) go('/samtal/' + id);
  }
  return html`<div class="page">
    <${Header} title="Samtal med flera" back />
    <div class="pad form">
      <label>Namn på samtalet <small class="muted">(valfritt)</small><input value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="T.ex. Odlingsgänget" /></label>
      ${picked.length > 0 && html`<div class="tag-input">${picked.map((u) => html`<span class="chip on" key=${u.id}>${u.name}<button type="button" aria-label=${`Ta bort ${u.name}`} onClick=${() => toggle(u)}>×</button></span>`)}</div>`}
      <button class="btn primary block" disabled=${!picked.length} onClick=${create}>Starta samtalet${picked.length ? ` (${picked.length + 1} personer)` : ''}</button>
    </div>
    <div class="searchbar"><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Sök efter personer" aria-label="Sök efter personer" /></div>
    <div class="list">${(users.data || []).filter((u) => u.id !== s.me.id).map((u) => html`<label class="row pick" key=${u.id}>
      <${Avatar} src=${u.avatar_url} name=${u.name} size=${40} /><span class="row-main"><strong>${u.name}</strong></span>
      <input type="checkbox" checked=${picked.some((x) => x.id === u.id)} onChange=${() => toggle(u)} /></label>`)}</div>
  </div>`;
}

// Ett samtal med flera eller med en hel grupp. Klockan uppe till höger stänger av eller slår på notiserna.
export function ChatView({ chatId }) {
  const s = useStore();
  const t = useAsync(() => api.getChat(chatId), [chatId]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(null);
  const [pending, setPending] = useState([]);
  const end = useRef();
  const count = (t.data?.messages.length ?? 0) + pending.length;
  useEffect(() => { if (count) { end.current?.scrollIntoView({ block: 'end' }); refreshBadges(); } }, [count]);
  useEffect(() => { const i = setInterval(() => { if (!document.hidden) t.reload(); }, 15000); return () => clearInterval(i); }, [chatId]);
  const chat = t.data;
  const isMuted = muted ?? chat?.muted ?? false;
  async function send(e) {
    e?.preventDefault();
    if (!body.trim() || busy) return;
    const text = body;
    setBody(''); setPending((p) => [...p, { id: 'p' + Date.now(), from_id: s.me.id, body: text, created_at: new Date().toISOString(), pending: true }]);
    if (await attempt(() => api.sendChatMessage(chatId, text))) await t.reload(); else setBody(text);
    setPending([]);
  }
  async function toggleMute() {
    const next = !isMuted;
    setMuted(next);
    if (!(await attempt(() => api.setChatMuted(chatId, next), next ? 'Notiser avstängda för samtalet' : 'Notiser påslagna'))) setMuted(!next);
    refreshBadges();
  }
  const title = chat ? (chat.group ? chat.group.name : chat.title || chat.members.filter((m) => m.id !== s.me.id).map((m) => m.name.split(' ')[0]).join(', ')) : '';
  const msgs = [...(chat?.messages || []), ...pending];
  return html`<div class="page chat">
    <header class="topbar">
      <div class="topbar-side"><button class="iconbtn" aria-label="Tillbaka" onClick=${() => goBack('/meddelanden')}><${Icon} name="back" /></button></div>
      <${chat?.group ? 'a' : 'span'} class="chat-title" href=${chat?.group ? '#/grupp/' + chat.group.id : undefined}>
        ${chat?.group ? html`<${Avatar} src=${chat.group.avatar_url} name=${chat.group.name} size=${30} />` : chat && html`<${Avatar} name=${title} size=${30} />`}
        <span class="chat-title-text"><strong>${title}</strong>${chat && html`<small class="muted">${chat.group ? 'Hela gruppen' : `${chat.members.length} deltagare`}</small>`}</span><//>
      <div class="topbar-side right">${chat && html`<button class=${'iconbtn' + (isMuted ? ' muted-on' : '')} onClick=${toggleMute}
        aria-pressed=${isMuted} aria-label=${isMuted ? 'Slå på notiser för samtalet' : 'Stäng av notiser för samtalet'} title=${isMuted ? 'Notiser avstängda – tryck för att slå på' : 'Tryck för att stänga av notiser'}>
        <${Icon} name=${isMuted ? 'bellOff' : 'bell'} /></button>`}</div>
    </header>
    <div class="bubbles">
      ${t.loading && !t.data ? html`<${Loading} />` : t.error ? html`<${ErrorBox} error=${t.error} />`
        : msgs.length === 0 ? html`<div class="chat-start"><strong>${title}</strong><small class="muted">${chat.group ? 'Alla i gruppen ser det som skrivs här.' : 'Skriv det första meddelandet.'}</small></div>` : null}
      ${msgs.map((m, i) => {
        const mine = m.from_id === s.me.id;
        const prev = msgs[i - 1], next = msgs[i + 1];
        const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
        const firstInRun = !prev || prev.from_id !== m.from_id || newDay;
        const lastInRun = !next || next.from_id !== m.from_id || new Date(next.created_at) - new Date(m.created_at) > 5 * 60e3;
        return html`<${'div'} key=${m.id}>
          ${newDay && html`<div class="day">${dayLabel(m.created_at)}</div>`}
          ${!mine && firstInRun && html`<div class="bubble-name">${m.from?.name || 'Borttagen användare'}</div>`}
          <${Bubble} kind="chat" m=${m} mine=${mine} tail=${lastInRun} />
          ${lastInRun && html`<div class=${'stamp' + (mine ? ' mine' : '')}>${clock(m.created_at)}</div>`}
        <//>`;
      })}
      <div ref=${end}></div>
    </div>
    ${chat && html`<form class="composer" onSubmit=${send}>
      <textarea rows="1" value=${body} placeholder="Meddelande…" aria-label="Meddelande"
        onInput=${(e) => { setBody(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
        onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <button class="send" disabled=${!body.trim() || busy}>Skicka</button>
    </form>`}
  </div>`;
}
