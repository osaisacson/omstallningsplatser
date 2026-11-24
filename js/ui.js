// Delade komponenter: ikoner, avatarer, inläggskort, kommentarer m.m.
import { html, useState, useEffect, useRef } from './lib.js';
import { api } from './api/index.js';
import { SUPABASE_URL } from './config.js';
import { state, go, goBack, toast, refreshBadges, refreshMe, attempt, useAsync } from './store.js';
import { fmtKr, fmtDate, timeAgo, PAYOUT_BANK_LIMIT, SPACE_COSTS, postType, fmtEventTime, eventTitle, calendarSubscribed, MEMORY_THEMES } from './util.js';

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20.5l1.4-5A8.5 8.5 0 1 1 21 11.5z"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="m8 12.2 2.8 2.8L16.5 9"/>',
  dots: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  memory: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.3-2.4 3.8"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 5 5 13h4.5v6h5v-6H19z"/>',
  down: '<path d="M12 19l7-8h-4.5V5h-5v6H5z"/>',
  layers: '<rect x="8" y="3" width="13" height="13" rx="2"/><path d="M16 21H5a2 2 0 0 1-2-2V8"/>',
};
export const Icon = ({ name, size = 24 }) => html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
  dangerouslySetInnerHTML=${{ __html: ICONS[name] }}></svg>`;

function hue(s = '') { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
export function Avatar({ src, name = '', size = 32 }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;${src ? '' : `background:hsl(${hue(name)} 38% 52%)`}`;
  return html`<span class="avatar" style=${style}>${src ? html`<img src=${src} alt="" loading="lazy" decoding="async" />` : initials}</span>`;
}

export const Count = ({ n }) => (n > 0 ? html`<span class="count">${n > 99 ? '99+' : n}</span>` : null);

export function Header({ title, back = false, right = null }) {
  const onBack = () => goBack('/');
  return html`<header class="topbar">
    <div class="topbar-side">${back && html`<button class="iconbtn" aria-label="Tillbaka" onClick=${onBack}><${Icon} name="back" /></button>`}</div>
    <h1 class="topbar-title">${title}</h1>
    <div class="topbar-side right">${right}</div>
  </header>`;
}

export const Loading = () => html`<p class="empty">Laddar…</p>`;
export const ErrorBox = ({ error }) => html`<p class="empty error">${error?.message || 'Något gick fel.'}</p>`;

let openModals = 0;
export function Modal({ title, onClose, children }) {   // utan onClose: en fråga som måste besvaras (inget kryss)
  const closable = !!onClose;
  onClose ||= () => {};
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    openModals++; document.body.classList.add('locked');
    return () => { removeEventListener('keydown', k); openModals = Math.max(0, openModals - 1); if (!openModals) document.body.classList.remove('locked'); };
  }, []);
  return html`<div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head"><strong>${title}</strong>
        ${closable && html`<button class="iconbtn" onClick=${onClose} aria-label="Stäng"><${Icon} name="x" /></button>`}</div>
      <div class="modal-body">${children}</div>
    </div></div>`;
}

export function Sheet({ onClose, children }) {
  return html`<div class="modal-bg sheet-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="menu">${children}<button class="sheet-item muted" onClick=${onClose}>Avbryt</button></div></div>`;
}

// Bildkarusell där varje bild har sin egen text.
export function Carousel({ slides, badge = null }) {
  const [i, setI] = useState(0);
  const ref = useRef();
  if (!slides.length) return null;
  const onScroll = () => { const el = ref.current; setI(Math.round(el.scrollLeft / el.clientWidth)); };
  const to = (j) => ref.current.scrollTo({ left: j * ref.current.clientWidth, behavior: 'smooth' });
  return html`<div class="carousel">
    <div class="frame">
      <div class="track" ref=${ref} onScroll=${onScroll}>
        ${slides.map((s) => html`<div class="slide"><img src=${s.image_url} alt=${s.text || ''} loading="lazy" decoding="async" /></div>`)}
      </div>
      ${(badge || slides.length > 1) && html`<div class="corner">
        ${badge && html`<span class="img-badge">${badge}</span>`}
        ${slides.length > 1 && html`<span class="counter">${i + 1}/${slides.length}</span>`}</div>`}
      ${slides.length > 1 && html`${i > 0 && html`<button class="nav prev" aria-label="Föregående bild" onClick=${() => to(i - 1)}>‹</button>`}
        ${i < slides.length - 1 && html`<button class="nav next" aria-label="Nästa bild" onClick=${() => to(i + 1)}>›</button>`}
        <div class="dots">${slides.map((_, j) => html`<span class=${j === i ? 'on' : ''}></span>`)}</div>`}
    </div>
    ${slides[i]?.text && html`<p class="slide-text">${slides[i].text}</p>`}
  </div>`;
}

export function FinanceBox({ post, onApply }) {
  const f = post.finance;
  const mine = post.author_id === state.me.id;
  const pct = (n) => `${Math.min(100, (n / f.total) * 100)}%`;
  const status = f.closed ? 'Stängd' : f.expired ? 'Tiden har gått ut' : f.remaining <= 0 ? 'Allt är fördelat' : f.expires_at ? `Öppen t.o.m. ${fmtDate(f.expires_at)}` : 'Öppen';
  return html`<div class="fin">
    <div class="fin-top"><strong>${fmtKr(f.total)}</strong>
      <span>${f.mode === 'single' ? 'till en mottagare' : 'att söka i delbelopp'}</span></div>
    <div class="bar" role="img" aria-label=${`${fmtKr(f.paid)} utbetalt, ${fmtKr(f.granted)} beviljat av ${fmtKr(f.total)}`}>
      <span class="paid" style=${{ width: pct(f.paid) }}></span><span class="granted" style=${{ width: pct(f.granted) }}></span></div>
    <div class="fin-meta">
      <span><i class="dot paid"></i>${fmtKr(f.paid)} utbetalt</span>
      ${f.granted > 0 && html`<span><i class="dot granted"></i>${fmtKr(f.granted)} beviljat</span>`}
      <span><b>${fmtKr(f.remaining)}</b> kvar</span>
    </div>
    <div class="fin-foot"><span class="muted">${status}${f.pending ? ` · ${f.pending} ${f.pending === 1 ? 'ansökan väntar' : 'ansökningar väntar'}` : ''}</span>
      ${f.open && !mine && html`<button class="btn primary small" onClick=${onApply}>Ansök</button>`}</div>
  </div>`;
}

// Adress med förslag från en riktig adresslista (OpenStreetMap via Photon) medan man skriver.
// Valt förslag ger även postnummer, stad, region, land och kartposition.
export function AddressPicker({ value, onPick, placeholder = 'Börja skriva en adress…' }) {
  const [q, setQ] = useState(value?.address || '');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || q.trim().length < 3) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://photon.komoot.io/api/?limit=6&lang=default&lat=59.3&lon=15&q=${encodeURIComponent(q.trim())}`).then((r) => r.json());
        setHits((r.features || []).map((f) => {
          const p = f.properties;
          const street = [p.street || (p.type !== 'city' && p.name), p.housenumber].filter(Boolean).join(' ');
          const city = p.city || p.town || p.village || (p.type === 'city' ? p.name : null) || p.county || null;
          const label = [street || p.name, p.district && p.district !== city ? p.district : null, [p.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          return { label, address: label, postcode: p.postcode || null, city, region: p.state || null, country: p.country || null,
            lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
        }).filter((h, i, all) => all.findIndex((x) => x.label === h.label) === i));
      } catch { setHits([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, open]);
  const choose = (h) => { setQ(h.address); setOpen(false); setHits([]); onPick(h); };
  return html`<div class="typeahead">
    <input value=${q} placeholder=${placeholder} autocomplete="off"
      onInput=${(e) => { setQ(e.target.value); setOpen(true); onPick({ address: e.target.value, lat: null, lng: null, postcode: null }); }}
      onKeyDown=${(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); choose(hits[0]); } }} />
    ${open && hits.length > 0 && html`<div class="ta-list" role="listbox">${hits.map((h) => html`<button type="button" role="option" class="ta-item" onClick=${() => choose(h)}>
      <span>📍</span><span>${h.label}</span></button>`)}</div>`}
  </div>`;
}

// Välj grupp genom att börja skriva namnet. Vald grupp visas som en rad med "Byt".
// Välj grupp: ens egna grupper visas direkt; skriver man söks även andra grupper (others), märkta "inte med".
export function GroupPicker({ groups, others = [], value, onChange, placeholder = 'Skriv gruppens namn…' }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(!value);
  const [focus, setFocus] = useState(false);
  const mine = new Set(groups.map((g) => g.id));
  const all = [...groups, ...others.filter((g) => !mine.has(g.id) && !g.locked)];
  const sel = all.find((g) => g.id === value);
  if (sel && !editing) return html`<div class="picked">
    <${Avatar} src=${sel.avatar_url} name=${sel.name} size=${28} /><strong>${sel.name}</strong>
    <button type="button" class="link" onClick=${() => setEditing(true)}>Byt</button></div>`;
  const n = q.trim().toLowerCase();
  const hits = n ? all.filter((g) => g.name.toLowerCase().includes(n)).sort((a, b) => mine.has(b.id) - mine.has(a.id)).slice(0, 8)
    : focus || !sel ? groups.slice(0, 12) : [];
  const choose = (g) => { onChange(g.id); setQ(''); setEditing(false); setFocus(false); };
  return html`<div class="typeahead">
    <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${placeholder} aria-label="Välj grupp" autofocus=${!!sel}
      onFocus=${() => setFocus(true)} onBlur=${() => setTimeout(() => setFocus(false), 180)}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) choose(hits[0]); } if (e.key === 'Escape' && sel) setEditing(false); }} />
    ${hits.length > 0 && html`<div class="ta-list" role="listbox">
      ${!n && html`<div class="ta-head">Dina grupper – skriv för att hitta andra</div>`}
      ${hits.map((g) => html`<button type="button" role="option" class="ta-item" key=${g.id} onPointerDown=${(e) => e.preventDefault()} onClick=${() => choose(g)}>
      <${Avatar} src=${g.avatar_url} name=${g.name} size=${24} /><span>${g.name}</span>${!mine.has(g.id) && html`<small class="muted">inte med</small>`}</button>`)}</div>`}
    ${n && !hits.length && html`<small class="muted">Ingen grupp heter så.</small>`}
  </div>`;
}

// Välj flera grupper (t.ex. vilka som ser ett inlägg): valda visas som etiketter, egna grupper föreslås, andra går att söka.
export function GroupsPicker({ groups, others = [], value, onChange }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const mine = new Set(groups.map((g) => g.id));
  const all = [...groups, ...others.filter((g) => !mine.has(g.id))];
  const byId = new Map(all.map((g) => [g.id, g]));
  const n = q.trim().toLowerCase();
  const pool = all.filter((g) => !value.includes(g.id));
  const hits = n ? pool.filter((g) => g.name.toLowerCase().includes(n)).sort((a, b) => mine.has(b.id) - mine.has(a.id)).slice(0, 8)
    : focus ? pool.filter((g) => mine.has(g.id)).slice(0, 12) : [];
  const add = (g) => { onChange([...value, g.id]); setQ(''); };
  return html`<div class="groups-picker">
    ${value.length > 0 && html`<div class="chips">${value.map((id) => html`<span class="chip" key=${id}>${byId.get(id)?.name || 'Grupp'}
      <button type="button" aria-label="Ta bort" onClick=${() => onChange(value.filter((x) => x !== id))}>×</button></span>`)}</div>`}
    <div class="typeahead">
      <input value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Lägg till en grupp…" aria-label="Lägg till grupp som ser inlägget"
        onFocus=${() => setFocus(true)} onBlur=${() => setTimeout(() => setFocus(false), 180)}
        onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) add(hits[0]); } }} />
      ${hits.length > 0 && html`<div class="ta-list" role="listbox">${hits.map((g) => html`<button type="button" role="option" class="ta-item" key=${g.id}
        onPointerDown=${(e) => e.preventDefault()} onClick=${() => add(g)}>
        <${Avatar} src=${g.avatar_url} name=${g.name} size=${24} /><span>${g.name}</span>${!mine.has(g.id) && html`<small class="muted">inte med</small>`}</button>`)}</div>`}
    </div>
  </div>`;
}

export function ApplyForm({ post, onClose, onDone }) {
  const f = post.finance;
  const single = f.mode === 'single';
  const groups = state.myGroups;
  const [groupId, setGroupId] = useState(groups.length === 1 ? groups[0].id : null);
  const [amount, setAmount] = useState(single ? String(f.total) : '');
  const [body, setBody] = useState('');
  const [payout, setPayout] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = Number(String(amount).replace(/\s/g, '').replace(',', '.')) || 0;
  const bank = amt > PAYOUT_BANK_LIMIT;
  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!groupId) return setErr('Välj vilken grupp du söker för.');
    if (!single && (amt <= 0 || amt > f.remaining)) return setErr(`Ange ett belopp mellan 1 och ${fmtKr(f.remaining)}.`);
    setBusy(true);
    try {
      await api.applyForFunding(post.id, { groupId, body, amount: amt, payout: `${bank ? 'Bankkonto' : 'Swish'}: ${payout.trim()}` });
      toast('Ansökan skickad');
      onDone();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  if (!groups.length) return html`<${Modal} title="Ansök om pengar" onClose=${onClose}>
    <div class="nudge"><strong>Ansökningar görs för en grupp.</strong>
      <p>Du är inte med i någon grupp än. Gå med i den grupp du söker för, eller skapa den.</p>
      <div class="btnrow"><a class="btn small" href="#/sok?flik=grupper" onClick=${onClose}>Hitta grupper</a>
        <a class="btn small primary" href="#/ny-grupp" onClick=${onClose}>Skapa grupp</a></div></div><//>`;
  return html`<${Modal} title="Ansök om pengar" onClose=${onClose}>
    <form class="form" onSubmit=${submit}>
      <div class="field"><div class="label small">Vilken grupp söker du för?</div>
        <${GroupPicker} groups=${groups} value=${groupId} onChange=${setGroupId} />
        <small>Ansökan visas som gruppens, med ditt namn bredvid.</small></div>
      ${single
        ? html`<p>Den här finansieringen går till en mottagare. Ni söker hela beloppet: <strong>${fmtKr(f.total)}</strong>.</p>`
        : html`<label>Belopp (kr)<input inputmode="numeric" required value=${amount} onInput=${(e) => setAmount(e.target.value)} placeholder="t.ex. 2500" />
            <small>Max ${fmtKr(f.remaining)}</small></label>`}
      <label>Motivering<textarea required rows="4" value=${body} onInput=${(e) => setBody(e.target.value)}
        placeholder="Vad ska pengarna användas till? Motiveringen blir en kommentar på inlägget som alla kan se."></textarea></label>
      <label>${bank ? 'Bankkonto (clearingnummer och kontonummer)' : 'Swishnummer'}
        <input required value=${payout} onInput=${(e) => setPayout(e.target.value)} placeholder=${bank ? '8327-9, 123 456 789-0' : '070-123 45 67'} />
        <small>Syns bara för dig och den som delar ut pengarna. Belopp över ${fmtKr(PAYOUT_BANK_LIMIT)} betalas till bankkonto.</small></label>
      ${err && html`<p class="error">${err}</p>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Skickar…' : 'Skicka ansökan'}</button>
    </form><//>`;
}

// Anmäl ett inlägg, en grupp, en användare eller feedback till Redaktionen.
export function ReportForm({ kind, id, name, onClose }) {
  const [reason, setReason] = useState('');
  const what = { post: 'inlägget', group: 'gruppen', user: 'användaren', feedback: 'inlägget' }[kind];
  async function submit(e) {
    e.preventDefault();
    if (await attempt(() => api.report(kind, id, name, reason), 'Tack! Redaktionen tittar på det.')) onClose();
  }
  return html`<${Modal} title=${'Anmäl ' + what} onClose=${onClose}>
    <form class="form" onSubmit=${submit}>
      <p class="muted">Anmälan går till Redaktionen, som tittar på den så snart de kan. Den du anmäler får inte veta vem som anmälde.</p>
      <label>Vad är problemet?
        <textarea required rows="4" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="T.ex. spam, kränkande, olagligt, falsk grupp…"></textarea></label>
      <button class="btn primary block">Skicka anmälan</button>
      <small class="muted">Är någon i fara eller är det ett brott – kontakta polisen (112 eller 114 14).</small>
    </form><//>`;
}

// Redaktionen tar bort något (loggas och kan inte ångras).
export async function editorDelete(kind, id, label) {
  if (!confirm(`Ta bort ${label} som Redaktionen? Det går inte att ångra, men det syns i Redaktionens historik.`)) return false;
  return attempt(() => api.editorDelete(kind, id), 'Borttaget');
}

function RequestForm({ post, kind, onClose }) {
  const [msg, setMsg] = useState('');
  const label = kind === 'edit' ? 'Be om ändring' : 'Be om borttagning';
  async function submit(e) {
    e.preventDefault();
    const text = `${label} av ditt inlägg #/post/${post.id}\n\n${msg.trim()}`;
    if (await attempt(() => api.sendMessage(post.author_id, text), `Skickat till ${post.author.name}`)) onClose();
  }
  return html`<${Modal} title=${label} onClose=${onClose}>
    <form class="form" onSubmit=${submit}>
      <p class="muted">Ett meddelande skickas till ${post.author.name}, som bestämmer över inlägget.</p>
      <label>${kind === 'edit' ? 'Vad borde ändras?' : 'Varför borde det tas bort?'}
        <textarea required rows="4" value=${msg} onInput=${(e) => setMsg(e.target.value)}></textarea></label>
      <button class="btn primary block">Skicka</button>
    </form><//>`;
}

// Redaktionen väljer vilka kategorier i Minne ett inlägg ligger i (flera går bra).
function ThemesEditor({ post, onClose, onDone }) {
  const list = useAsync(() => api.listMemoryThemes(), []);
  const [sel, setSel] = useState(() => post.memory_themes || []);
  const [name, setName] = useState('');
  const all = [...new Set([...(list.data || MEMORY_THEMES.map((t) => t.name)), ...sel])];
  const toggle = (t) => setSel((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  function add(e) {
    e.preventDefault();
    const t = name.trim().replace(/^./, (m) => m.toUpperCase());
    if (t && !sel.includes(t)) setSel([...sel, t]);
    setName('');
  }
  async function save() { if (await attempt(() => api.setPostThemes(post.id, sel), 'Kategorierna är sparade')) onDone(); }
  return html`<${Modal} title="Kategorier i Minne" onClose=${onClose}>
    <p class="muted small theme-hint">Välj en eller flera. Ditt val gäller före det som valdes när inlägget sparades.</p>
    <div class="theme-pick">${all.map((t) => html`<button class=${'chip' + (sel.includes(t) ? ' on' : '')} aria-pressed=${sel.includes(t)} onClick=${() => toggle(t)}>${t}</button>`)}</div>
    <form class="theme-new" onSubmit=${add}>
      <input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" placeholder="Ny kategori…" aria-label="Ny kategori" />
      <button class="btn small" disabled=${!name.trim()}>Lägg till</button>
    </form>
    <button class="btn primary block theme-save" onClick=${save}>Spara</button>
  <//>`;
}

// ··· på inlägget
export function PostMenu({ post, onChange }) {
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [moving, setMoving] = useState(false);
  const mine = post.author_id === state.me.id;
  const editor = state.me.is_editor;
  const admin = post.group_id && state.adminOf.has(post.group_id);
  async function del() {
    const unpaid = post.finance?.granted > 0;
    if (!confirm(unpaid
      ? `Det finns beviljade ansökningar på ${fmtKr(post.finance.granted)} som inte är markerade som utbetalda. Om du tar bort inlägget försvinner de och deras betalningsuppgifter. Ta bort ändå?`
      : 'Ta bort inlägget? Det går inte att ångra.')) return;
    if (await attempt(() => api.deletePost(post.id), 'Inlägget togs bort')) {
      if (location.hash.startsWith('#/post/')) go('/'); else onChange?.();
    }
  }
  const items = [];
  if (mine) {
    items.push(['Redigera', () => go(`/post/${post.id}/redigera`)]);
    if (post.finance) items.push([post.fin_closed ? 'Öppna finansieringen igen' : 'Stäng finansieringen',
      async () => { if (await attempt(() => api.setFinanceClosed(post.id, !post.fin_closed))) onChange?.(); }]);
    items.push(['Ta bort', del, 'danger']);
  } else {
    items.push(['Be om ändring', () => setReq('edit')]);
    // Den som själv kan ta bort (gruppadmin, Redaktionen) får inte "be om borttagning" eller anmäla till sig själv.
    if (!editor && !admin) items.push(['Be om borttagning', () => setReq('remove')]);
    if (!editor) items.push(['Anmäl till Redaktionen', () => setReporting(true)]);
    if (admin) items.push(['Ta bort (som gruppadmin)', del, 'danger']);
    else if (editor) items.push(['Ta bort (Redaktionen)', async () => {
      if (await editorDelete('post', post.id, 'inlägget')) { if (location.hash.startsWith('#/post/')) go('/'); else onChange?.(); }
    }, 'danger']);
  }
  if (state.me.is_editor && post.memory_count > 0) items.push(['Kategorier i Minne (Redaktionen)', () => setMoving(true)]);
  if (!location.hash.startsWith('#/post/')) items.push(['Gå till inlägget', () => go('/post/' + post.id)]);
  return html`<span>
    <button class="iconbtn" aria-label="Fler val" onClick=${() => setOpen(true)}><${Icon} name="dots" /></button>
    ${open && html`<${Sheet} onClose=${() => setOpen(false)}>
      ${items.map(([label, fn, cls]) => html`<button class=${'sheet-item ' + (cls || '')} onClick=${() => { setOpen(false); fn(); }}>${label}</button>`)}
    <//>`}
    ${req && html`<${RequestForm} post=${post} kind=${req} onClose=${() => setReq(null)} />`}
    ${moving && html`<${ThemesEditor} post=${post} onClose=${() => setMoving(false)} onDone=${() => { setMoving(false); onChange?.(); }} />`}
    ${reporting && html`<${ReportForm} kind="post" id=${post.id} name=${(post.caption || 'Inlägg').slice(0, 60)} onClose=${() => setReporting(false)} />`}
  </span>`;
}

// ··· uppe till höger på grupp- och profilsidor: anmäl, ta bort och liknande. items: [etikett, funktion, klass]
export function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return html`<span>
    <button class="iconbtn" aria-label="Fler val" title="Fler val" onClick=${() => setOpen(true)}><${Icon} name="dots" /></button>
    ${open && html`<${Sheet} onClose=${() => setOpen(false)}>
      ${list.map(([label, fn, cls]) => html`<button class=${'sheet-item ' + (cls || '')} disabled=${!fn} onClick=${() => { setOpen(false); fn?.(); }}>${label}</button>`)}
    <//>`}
  </span>`;
}

// Evenemang: när, var, anmälan och "lägg till i min kalender".
export function EventBox({ post: p }) {
  const [mine, setMine] = useState(p.rsvp_mine);
  const [counts, setCounts] = useState({ interested: p.rsvp_interested || 0, going: p.rsvp_going || 0 });
  const past = new Date(p.event_end || p.event_start) < new Date();
  const url = `${location.origin}${location.pathname}#/post/${p.id}`;
  async function rsvp(status) {
    const next = mine === status ? null : status;
    const c = { ...counts };
    if (mine) c[mine]--; if (next) c[next]++;
    const before = { mine, counts };
    setMine(next); setCounts(c);
    if (await attempt(() => api.setRsvp(p.id, next)) === false) { setMine(before.mine); setCounts(before.counts); }
  }
  // Kalendern: evenemanget markeras som intressant (om man inte redan svarat) och kommer då med i ens
  // kalenderprenumeration. Har man ingen prenumeration än tas man till inställningen.
  async function addToCalendar() {
    if (!mine) {
      if (p.event_rsvp) await rsvp('interested');
      else if (await attempt(() => api.setRsvp(p.id, 'interested')) === false) return;
      else setMine('interested');
    }
    if (calendarSubscribed()) toast('Det hamnar i din kalender inom en timme');
    else go('/redigera-profil?del=kalender');
  }
  const where = [p.event_address, p.event_address?.includes(p.event_city || '§') ? null : p.event_city].filter(Boolean).join(', ');
  return html`<div class=${'event' + (past ? ' past' : '')}>
    <div class="event-when"><${Icon} name="calendar" size=${18} /><strong>${fmtEventTime(p)}</strong>${past && html`<span class="muted small"> · har varit</span>`}</div>
    ${where && html`<div class="event-where">📍 ${where}</div>`}
    ${p.event_rsvp && !past && html`<div class="event-rsvp">
      <button class=${'btn small' + (mine === 'interested' ? ' primary' : '')} onClick=${() => rsvp('interested')}>Intresserad · ${counts.interested}</button>
      <button class=${'btn small' + (mine === 'going' ? ' primary' : '')} onClick=${() => rsvp('going')}>Kommer · ${counts.going}</button>
    </div>`}
    ${!past && html`<div class="event-cal"><button class="link" onClick=${addToCalendar}>${mine && calendarSubscribed() ? '✓ I din kalender' : 'Lägg till i min kalender'}</button></div>`}
  </div>`;
}

// Spara i långtidsminnet: en röst per person, går att ta tillbaka.
// Bokmärket: spara inlägget i Minne. Man väljer vilken kategori det passar i (eller skapar en ny).
// Har man redan sparat det tar ett tryck bort det igen.
function MemoryButton({ post, onChange }) {
  const [mine, setMine] = useState(!!post.memory_mine);
  const [count, setCount] = useState(post.memory_count || 0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(themes) {
    if (busy) return;
    setBusy(true); setPicking(false);
    const next = !mine;
    setMine(next); setCount((c) => c + (next ? 1 : -1));   // visa direkt
    const res = await attempt(async () => { await api.toggleMemory(post.id, themes); return true; }, next ? `Sparat i Minne under ${themes.join(', ')}` : 'Borttaget ur Minne');
    if (res === false) { setMine(!next); setCount((c) => c + (next ? -1 : 1)); }
    setBusy(false);
    onChange?.();
  }
  return html`<span>
    <button class=${'action memory' + (mine ? ' on' : '')} onClick=${() => (mine ? save([]) : setPicking(true))} aria-pressed=${mine}
      aria-label=${mine ? 'Ta bort ur Minne' : 'Spara i Minne'} title=${mine ? 'Ta bort ur Minne' : 'Spara i Minne'}>
      <span>${count}</span><${Icon} name="memory" size=${22} /></button>
    ${picking && html`<${ThemePicker} onPick=${save} onClose=${() => setPicking(false)} />`}
  </span>`;
}

// Välj en eller flera kategorier när man sparar i Minne (eller skapa en ny).
export function ThemePicker({ onPick, onClose, title = 'Spara i Minne', hint = 'Vilka kategorier passar inlägget i? Välj en eller flera.' }) {
  const list = useAsync(() => api.listMemoryThemes(), []);
  const [sel, setSel] = useState([]);
  const [name, setName] = useState('');
  const all = [...new Set([...(list.data || MEMORY_THEMES.map((t) => t.name)), ...sel])];
  const toggle = (t) => setSel((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  function add(e) {
    e.preventDefault();
    const t = name.trim().replace(/^./, (m) => m.toUpperCase());
    const exists = all.find((x) => x.toLowerCase() === t.toLowerCase());
    if (t) setSel((x) => [...new Set([...x, exists || t])]);
    setName('');
  }
  return html`<${Modal} title=${title} onClose=${onClose}>
    <p class="muted small theme-hint">${hint}</p>
    <div class="theme-pick">${all.map((t) => html`<button class=${'chip' + (sel.includes(t) ? ' on' : '')} aria-pressed=${sel.includes(t)} onClick=${() => toggle(t)}>${t}</button>`)}</div>
    <form class="theme-new" onSubmit=${add}>
      <input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="40" placeholder="Eller skapa en ny kategori…" aria-label="Ny kategori" />
      <button class="btn small" disabled=${!name.trim()}>Lägg till</button>
    </form>
    <button class="btn primary block theme-save" disabled=${!sel.length} onClick=${() => onPick(sel)}>${sel.length ? `Spara i ${sel.length === 1 ? sel[0] : `${sel.length} kategorier`}` : 'Välj minst en kategori'}</button>
  <//>`;
}

// Vem som skrivit inlägget. Personen är avsändaren – gruppen visas som en liten bild på personens bild och
// "i Gruppnamn" under namnet: inlägget hör till gruppen, men personen talar inte för den.
// Har en admin valt att publicera som gruppen är det tvärtom: gruppen är avsändaren och "via Namn" står under.
// Inlägg som bara vissa grupper ser får en liten markering.
const limited = (p) => p.visible_to?.length > 0 && html`<span class="limited" title="Syns bara för medlemmar i de grupper som valts">Bara för ${p.visible_to.length === 1 ? 'en grupp' : p.visible_to.length + ' grupper'}</span>`;
export function PostHead({ post: p, children }) {
  const g = p.group, a = p.author;
  if (p.as_group && g) return html`<div class="post-head">
    <a href=${'#/grupp/' + g.id}><${Avatar} src=${g.avatar_url} name=${g.name} size=${36} /></a>
    <div class="who"><a class="strong" href=${'#/grupp/' + g.id}>${g.name}</a><a class="by" href=${'#/profil/' + a.id}>via ${a.name}</a>${limited(p)}</div>
    ${children}</div>`;
  return html`<div class="post-head">
    <a class="head-avatar" href=${'#/profil/' + a.id}><${Avatar} src=${a.avatar_url} name=${a.name} size=${36} />
      ${g && html`<span class="head-group" title=${g.name}><${Avatar} src=${g.avatar_url} name=${g.name} size=${18} /></span>`}</a>
    <div class="who"><a class="strong" href=${'#/profil/' + a.id}>${a.name}</a>
      ${g && html`<a class="by" href=${'#/grupp/' + g.id}>om <b>${g.name}</b></a>`}${limited(p)}</div>
    ${children}</div>`;
}

export function PostCard({ post: p, onChange, full = false }) {
  const [applying, setApplying] = useState(false);
  const edited = new Date(p.updated_at) - new Date(p.created_at) > 60e3;
  // Märke uppe till höger på bilden för finansiering och lokaler.
  const kind = postType(p);
  const badge = p.is_event ? 'Evenemang' : kind === 'finansiering' ? 'Finansiering' : kind === 'lokal' ? 'Lokal' : null;
  return html`<article class="post">
    <${PostHead} post=${p}><${PostMenu} post=${p} onChange=${onChange} /><//>
    ${p.slides.length ? html`<${Carousel} slides=${p.slides} badge=${badge} />`
      : html`<div class="textpost">${badge && html`<span class="img-badge corner-solo">${badge}</span>`}${p.caption}</div>`}
    <div class="post-body">
      ${p.slides.length > 0 && p.caption && html`<p class="caption">${p.caption}</p>`}
      ${kind === 'lokal' && html`<p class="space-info">${(p.space_functions || []).join(' · ')}
        <span class="space-cost">${SPACE_COSTS[p.space_cost] || ''}${p.space_cost === 'kostar' && p.space_price ? `: ${p.space_price}` : ''}</span></p>`}
      ${kind === 'vanlig' && p.categories?.length > 0 && html`<p class="topics">${p.categories.map((c) => html`<span>#${c.toLowerCase()}</span>`)}</p>`}
      ${p.is_event && p.event_start && html`<${EventBox} post=${p} />`}
      ${p.finance && html`<${FinanceBox} post=${p} onApply=${() => setApplying(true)} />`}
      <div class="post-actions">
        <a class="action" href=${'#/post/' + p.id} aria-label=${`${p.comment_count} kommentarer`}><${Icon} name="chat" size=${22} /><span>${p.comment_count}</span></a>
        <${MemoryButton} post=${p} onChange=${onChange} />
      </div>
      ${!full && p.first_comment && html`<a class="first-comment" href=${'#/post/' + p.id}><strong>${p.first_comment.group?.name || p.first_comment.author.name}</strong> ${p.first_comment.body}</a>`}
      <div class="time">${timeAgo(p.created_at)}${edited ? ' · redigerad' : ''}</div>
    </div>
    ${applying && html`<${ApplyForm} post=${p} onClose=${() => setApplying(false)}
      onDone=${() => { setApplying(false); onChange?.(); if (!full) go('/post/' + p.id); }} />`}
  </article>`;
}

const STATUS = { applied: 'Ansökt', granted: 'Beviljad', denied: 'Avslagen', paid: 'Utbetald' };
const MAX_INDENT = 5; // djupare svar än så dras inte in mer

// Kommentarer som trådar (som på Reddit). Ansökningar visas som gruppens, "via" personen.
export function Comments({ post, onChange }) {
  const children = {};
  for (const c of post.comments) (children[c.parent_id || 'root'] ||= []).push(c);
  if (!children.root?.length) return html`<p class="empty small">Inga kommentarer än.</p>`;
  return html`<div class="comments">${children.root.map((c) => html`<${CommentNode} key=${c.id} c=${c} post=${post} children=${children} depth=${0} onChange=${onChange} />`)}</div>`;
}

function CommentNode({ c, post, children, depth, onChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = post.author_id === state.me.id;
  const kids = children[c.id] || [];
  const countAll = (id) => (children[id] || []).reduce((n, k) => n + 1 + countAll(k.id), 0);
  async function decide(d) {
    const msg = d === 'granted' ? 'Beviljad – den finns nu i din checklista' : 'Ansökan avslogs';
    if (await attempt(() => api.decideApplication(c.id, d), msg)) { refreshBadges(); onChange(); }
  }
  async function withdraw() {
    if (!confirm('Dra tillbaka ansökan? Den tas bort helt.')) return;
    if (await attempt(() => api.deleteComment(c.id), 'Ansökan är tillbakadragen')) { refreshBadges(); onChange(); }
  }
  async function reply(e) {
    e.preventDefault(); setBusy(true);
    if (await attempt(() => api.addComment(post.id, text, c.id))) { setText(''); setReplying(false); onChange(); }
    setBusy(false);
  }
  const asGroup = !!c.group;
  const who = asGroup
    ? html`<a href=${'#/grupp/' + c.group.id}><${Avatar} src=${c.group.avatar_url} name=${c.group.name} size=${32} /></a>`
    : html`<a href=${'#/profil/' + c.author.id}><${Avatar} src=${c.author.avatar_url} name=${c.author.name} size=${depth ? 26 : 32} /></a>`;
  return html`<div class=${'comment-node' + (depth ? ' reply' : '') + (depth >= MAX_INDENT ? ' flat' : '')}>
    <div class="comment">
      ${who}
      <div class="c-main">
        <div class="c-line">
          ${asGroup
            ? html`<a class="strong" href=${'#/grupp/' + c.group.id}>${c.group.name}</a><a class="via" href=${'#/profil/' + c.author.id}>via ${c.author.name}</a>`
            : html`<a class="strong" href=${'#/profil/' + c.author.id}>${c.author.name}</a>`}
          ${c.status && html`<span class=${'badge ' + c.status}>${STATUS[c.status]}</span>`}
          ${c.applied_amount != null && html`<span class="amount">${fmtKr(c.applied_amount)}</span>`}</div>
        ${!collapsed && html`<p class="c-body">${c.body}</p>
          ${c.payout && html`<div class="payout" title="Syns bara för den som sökt och den som delar ut">🔒 ${c.payout}</div>`}`}
        <div class="c-meta">${timeAgo(c.created_at)}
          ${!collapsed && html` · <button class="link-quiet" onClick=${() => setReplying((x) => !x)}>Svara</button>`}
          ${kids.length > 0 && html` · <button class="link-quiet" onClick=${() => setCollapsed((x) => !x)}>${collapsed ? `Visa ${countAll(c.id)} svar` : 'Dölj svar'}</button>`}</div>
        ${!collapsed && mine && c.status === 'applied' && html`<div class="c-actions">
          ${post.finance && Number(c.applied_amount) > post.finance.remaining
            ? html`<span class="muted small">Det finns bara ${fmtKr(post.finance.remaining)} kvar.</span>`
            : html`<button class="btn small primary" onClick=${() => decide('granted')}>Bevilja</button>`}
          <button class="btn small" onClick=${() => decide('denied')}>Avslå</button></div>`}
        ${!collapsed && c.author.id === state.me.id && c.status === 'applied' && html`<div class="c-actions">
          <button class="link-quiet" onClick=${withdraw}>Dra tillbaka ansökan</button></div>`}
        ${replying && html`<form class="reply-form" onSubmit=${reply}>
          <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${`Svara ${asGroup ? c.group.name : c.author.name}…`} aria-label="Svar" autofocus />
          <button class="link strong" disabled=${!text.trim() || busy}>Skicka</button></form>`}
      </div>
    </div>
    ${!collapsed && kids.length > 0 && html`<div class="thread">${kids.map((k) => html`<${CommentNode} key=${k.id} c=${k} post=${post} children=${children} depth=${depth + 1} onChange=${onChange} />`)}</div>`}
  </div>`;
}

export function PostGrid({ posts, showAuthor = false, empty = 'Inga inlägg än.' }) {
  if (!posts.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="grid">${posts.map((p) => html`<a class="tile" href=${'#/post/' + p.id} key=${p.id}>
    ${p.slides[0] ? html`<img src=${p.slides[0].image_url} alt="" loading="lazy" decoding="async" />` : html`<span class="tile-text">${p.caption}</span>`}
    ${p.slides.length > 1 && html`<span class="tile-icon"><${Icon} name="layers" size=${18} /></span>`}
    ${(p.is_event || p.finance || postType(p) === 'lokal') && html`<span class="tile-kind">${p.is_event ? 'Evenemang' : p.finance ? 'Finansiering' : 'Lokal'}</span>`}
    ${showAuthor && html`<span class="tile-author"><${Avatar} src=${p.author.avatar_url} name=${p.author.name} size=${20} /></span>`}
  </a>`)}</div>`;
}

// Gå med i en grupp. Att lämna en grupp gör man under Redigera profil.
export function JoinButton({ group, onChange }) {
  if (state.memberOf.has(group.id)) return html`<span class="member-label">Med ✓</span>`;
  if (group.locked) return html`<span class="member-label" title="Medlemmarna är Redaktionen">Låst</span>`;
  async function join(e) {
    e.preventDefault(); e.stopPropagation();
    if (await attempt(() => api.joinGroup(group.id), `Du är med i ${group.name}`)) { await refreshMe(); onChange?.(); }
  }
  return html`<button class="btn small primary" onClick=${join}>Gå med</button>`;
}

export function GroupRow({ group, action = true, onChange }) {
  return html`<a class="row" href=${'#/grupp/' + group.id}>
    <${Avatar} src=${group.avatar_url} name=${group.name} size=${44} />
    <span class="row-main"><strong>${group.name}</strong>
      <small class="muted">${group.member_count ?? ''} ${group.member_count === 1 ? 'medlem' : 'medlemmar'}${group.description ? ' · ' + group.description : ''}</small></span>
    ${action && html`<${JoinButton} group=${group} onChange=${onChange} />`}
  </a>`;
}

export const UserRow = ({ user, href }) => html`<a class="row" href=${href || '#/profil/' + user.id}>
  <${Avatar} src=${user.avatar_url} name=${user.name} size=${44} /><span class="row-main"><strong>${user.name}</strong></span></a>`;

// Bildväljare med förhandsvisning (för profilbild och gruppbild).
// Välj bild och placera den i en cirkel: dra för att flytta, dra i reglaget (eller nyp/scrolla) för att zooma.
export function ImagePicker({ current, name, onFile, label = 'Välj bild' }) {
  const [preview, setPreview] = useState(null);
  const [raw, setRaw] = useState(null);   // vald fil som ska beskäras
  return html`<div class="imgpick">
    <label class="imgpick-btn">
      <${Avatar} src=${preview || current} name=${name || '?'} size=${72} />
      <span class="link">${label}</span>
      <input type="file" accept="image/*" hidden onChange=${(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) setRaw(f); }} />
    </label>
    ${raw && html`<${CropModal} file=${raw} onCancel=${() => setRaw(null)}
      onDone=${(file) => { setRaw(null); setPreview(URL.createObjectURL(file)); onFile(file); }} />`}
  </div>`;
}

const CROP = 280;   // cirkelns storlek på skärmen
function CropModal({ file, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });   // bildens övre vänstra hörn i rutan
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const base = img ? Math.max(CROP / img.naturalWidth, CROP / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : CROP, h = img ? img.naturalHeight * scale : CROP;
  const clamp = (p, ww = w, hh = h) => ({ x: Math.min(0, Math.max(CROP - ww, p.x)), y: Math.min(0, Math.max(CROP - hh, p.y)) });
  useEffect(() => { if (img) setPos(clamp({ x: (CROP - w) / 2, y: (CROP - h) / 2 })); }, [img]);
  function zoomTo(z) {
    z = Math.min(4, Math.max(1, z));
    const ns = base * z, nw = img.naturalWidth * ns, nh = img.naturalHeight * ns;
    // zooma kring mitten av cirkeln
    const cx = (CROP / 2 - pos.x) / scale, cy = (CROP / 2 - pos.y) / scale;
    setZoom(z); setPos(clamp({ x: CROP / 2 - cx * ns, y: CROP / 2 - cy * ns }, nw, nh));
  }
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const move = (e) => {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) zoomTo(zoom * (d / pinch.current));
      pinch.current = d;
    } else setPos((p) => clamp({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
  };
  const up = (e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };
  async function done() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, CROP / scale, CROP / scale, 0, 0, 512, 512);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    onDone(new File([blob], 'bild.jpg', { type: 'image/jpeg' }));
  }
  return html`<${Modal} title="Placera bilden" onClose=${onCancel}>
    <div class="crop" style=${{ width: CROP + 'px', height: CROP + 'px' }}
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}
      onWheel=${(e) => { e.preventDefault(); if (img) zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 0.93)); }}>
      ${img ? html`<img src=${img.src} alt="" draggable="false" style=${{ width: w + 'px', height: h + 'px', transform: `translate(${pos.x}px, ${pos.y}px)` }} />` : html`<${Loading} />`}
      <span class="crop-ring"></span>
    </div>
    <label class="crop-zoom"><span>−</span><input type="range" min="1" max="4" step="0.01" value=${zoom} onInput=${(e) => img && zoomTo(Number(e.target.value))} aria-label="Zooma" /><span>+</span></label>
    <p class="hint center">Dra i bilden för att flytta den.</p>
    <div class="btnrow crop-btns"><button type="button" class="btn" onClick=${onCancel}>Avbryt</button>
      <button type="button" class="btn primary" disabled=${!img} onClick=${done}>Använd</button></div>
  <//>`;
}

// Gör "#/post/<id>" i meddelanden klickbart.
export function linkify(text) {
  return text.split(/(#\/post\/[0-9a-f-]{36})/g).map((part) =>
    part.startsWith('#/post/') ? html`<a class="msg-link" href=${part}>Visa inlägget</a>` : part);
}
