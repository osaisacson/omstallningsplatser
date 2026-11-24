// Flödet, enskilt inlägg och skapa/redigera inlägg.
import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, go, attempt, refreshBadges, refreshMe, onRefresh } from '../store.js';
import { Icon, Avatar, Count, Header, PostCard, Comments, Loading, ErrorBox, Sheet, GroupPicker, GroupsPicker, AddressPicker, CropModal } from '../ui.js';
import { PAYOUT_BANK_LIMIT, POST_TYPES, DEFAULT_FUNCTIONS, SPACE_COSTS, postType, placeLabel, inPlace, postPlace, eventColumns, zoomOut, fmtKr, visibleInFeed, canZoomOut } from '../util.js';

import { InstallHint } from '../install.js';
import { CHANGES } from '../changelog.js';

const PLUS = html`<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export { PlaceSwitcher } from './place.js';
import { PlaceSwitcher, HomePlaceFields, checkHome, emptyHome } from './place.js';
import { EventsList } from './calendar.js';

// Flödet hämtas 30 inlägg i taget; nästa omgång hämtas när man närmar sig slutet (eller när den valda
// platsen eller fliken har för lite att visa), så att appen håller farten även med väldigt många inlägg.
const PAGE = 30;
// Flödet och var man var i det sparas när man lämnar det (t.ex. öppnar ett inlägg), så att man kommer
// tillbaka till samma inlägg i stället för till toppen. Allt hämtas om i bakgrunden när man kommer tillbaka.
let feedCache = null;
export const feedScroll = { y: 0 };
function usePagedPosts() {
  const [st, setSt] = useState(() => feedCache ? { ...feedCache, loading: false } : { data: null, loading: true, error: null, done: false });
  const ref = useRef(st); ref.current = st;
  useEffect(() => { if (st.data) feedCache = st; }, [st]);
  const busy = useRef(false);
  async function load(reset) {
    if (busy.current) return;
    busy.current = true;
    setSt((x) => ({ ...x, loading: true }));
    try {
      const cur = reset ? [] : ref.current.data || [];
      // Vid omladdning hämtas lika många som redan visas, så att man inte tappar sin plats.
      const limit = reset ? Math.max(PAGE, (ref.current.data || []).length) : PAGE;
      const page = await api.listPosts({ before: cur.length ? cur[cur.length - 1].created_at : null, limit });
      setSt({ data: [...cur, ...page], loading: false, error: null, done: page.length < limit });
    } catch (error) { setSt((x) => ({ ...x, loading: false, error })); }
    busy.current = false;
  }
  useEffect(() => { load(true); return onRefresh(() => { busy.current = false; return load(true); }); }, []);   // vid återkomst: hämtar om lika många som visas
  return { ...st, data: st.data && st.data.filter(visibleInFeed), more: () => !ref.current.done && load(false), reload: () => load(true) };
}

// Grå platshållare medan de första inläggen hämtas (som i Instagram), i stället för en text.
const FeedSkeleton = ({ n = 2 }) => html`<div class="feed" aria-label="Hämtar inlägg">${Array.from({ length: n }, (_, i) => html`<div class="post skeleton" key=${i}>
  <div class="post-head"><span class="sk sk-avatar"></span><span class="sk sk-line" style="width:40%"></span></div>
  <div class="sk sk-img"></div>
  <div class="post-body"><span class="sk sk-line" style="width:80%"></span><span class="sk sk-line" style="width:55%"></span></div></div>`)}</div>`;

// Säger till när slutet av listan syns, så att fler kan hämtas.
function LoadMore({ posts, short }) {
  const el = useRef();
  useEffect(() => {
    if (!el.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && posts.more(), { rootMargin: '1500px' });
    io.observe(el.current);
    return () => io.disconnect();
  }, [posts.data?.length, posts.done]);
  // Har den valda platsen eller fliken för lite att visa hämtas mer direkt.
  useEffect(() => { if (short && !posts.done && !posts.loading) posts.more(); }, [short, posts.done, posts.loading, posts.data?.length]);
  if (posts.done) return null;
  return html`<div ref=${el} class="load-more">${posts.loading && html`<span class="spinner" aria-label="Hämtar fler"></span>`}</div>`;
}

// Filterfält med rullgardin: skriv för att begränsa, eller välj direkt bland det som finns.
function FilterCombo({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const n = value.trim().toLowerCase();
  const hits = options.filter((o) => !n || o.toLowerCase().includes(n)).slice(0, 12);
  return html`<label class="combo">
    <input value=${value} placeholder=${placeholder} aria-label=${'Filtrera på ' + placeholder.toLowerCase()} autocomplete="off"
      onFocus=${() => setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 150)} onInput=${(e) => { onChange(e.target.value); setOpen(true); }} />
    ${value && html`<button class="clear" aria-label="Rensa" onMouseDown=${(e) => e.preventDefault()} onClick=${() => onChange('')}>×</button>`}
    ${open && hits.length > 0 && html`<span class="combo-list" role="listbox">${hits.map((o) => html`<button type="button" role="option"
      class=${o.toLowerCase() === n ? 'on' : ''} onMouseDown=${(e) => e.preventDefault()} onClick=${() => { onChange(o); setOpen(false); }}>${o}</button>`)}</span>`}
  </label>`;
}

// Överst i flödet: hur många nya inlägg det finns på platsen sen man var här sist (bara om det finns några),
// och vad som ändrats i appen sen dess – fällbart till en kort punktlista.
function SinceLast({ here, posts, where }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  // Stängd med ×: de uppdateringarna visas inte igen (sparas i webbläsaren).
  const [closedAt, setClosedAt] = useState(() => { try { return new Date(localStorage.getItem('changes-closed') || 0); } catch { return new Date(0); } });
  const since = s.lastVisit;
  if (!since) return null;
  const isNew = (p) => new Date(p.created_at) > since && p.author_id !== s.me.id;
  const fresh = here.filter(isNew).length;
  // Är alla hämtade inlägg nya kan det finnas fler än så.
  const more = !posts.done && (posts.data || []).length > 0 && (posts.data || []).every(isNew);
  const changes = CHANGES.filter((c) => c.at > since && c.at > closedAt);
  if (!fresh && !changes.length) return null;
  const MAX = 8;
  return html`<div class="since">
    ${fresh > 0 && html`<div class="since-new"><span class="since-dot" aria-hidden="true"></span>
      <span><b>${fresh}${more ? '+' : ''} ${fresh === 1 ? 'nytt inlägg' : 'nya inlägg'}</b> i ${where} sen sist</span></div>`}
    ${changes.length > 0 && html`<div class="since-app">
      <button class="since-head" aria-expanded=${open} onClick=${() => setOpen((x) => !x)}>
        <span><b>${changes.length} ${changes.length === 1 ? 'uppdatering' : 'uppdateringar'}</b> av appen sen sist</span>
</button>
      <button class="since-x" aria-label="Dölj" onClick=${() => { const at = new Date(); try { localStorage.setItem('changes-closed', at.toISOString()); } catch {} setClosedAt(at); }}>×</button>
      ${open && html`<ul>${changes.slice(0, MAX).map((c, i) => html`<li key=${i}>${c.text}</li>`)}
        ${changes.length > MAX && html`<li class="muted">… och ${changes.length - MAX} till</li>`}</ul>`}
    </div>`}
  </div>`;
}

const TABS = [['flode', 'Flöde'], ['finansiering', 'Finansiering'], ['lokal', 'Resurser'], ['evenemang', 'Events']];

export function Home({ tab: startTab }) {
  const s = useStore();
  // Tillbaka till samma ställe i flödet. Sparas medan man scrollar, återställs när sidan visas igen.
  useEffect(() => {
    const y = feedScroll.y;
    if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    // Bara medan flödet visas (när man byter sida scrollas fönstret till toppen – det ska inte sparas).
    const save = () => { if (/^#?\/?(\?|$)/.test(location.hash.replace(/^#/, '')) || location.hash === '') feedScroll.y = window.scrollY; };
    addEventListener('scroll', save, { passive: true });
    return () => removeEventListener('scroll', save);
  }, []);
  const [tab, setTab] = useState(() => { let t; try { t = startTab || sessionStorage.getItem('tab'); } catch { t = startTab; } return TABS.some(([k]) => k === t) ? t : 'flode'; });
  const [fn, setFn] = useState('');        // Resurser: vad det är (fritext)
  const [cost, setCost] = useState('');    // Resurser: kostnad (fritext)
  const groups = useAsync(() => api.listGroups(), []);
  const posts = usePagedPosts();
  const place = s.place || { level: 'world' };
  const choose = (t) => { setTab(t); try { sessionStorage.setItem('tab', t); } catch {} };

  const here = (posts.data || []).filter((p) => inPlace(postPlace(p), place));
  const finance = here.filter((p) => postType(p) === 'finansiering');
  const spaces = here.filter((p) => postType(p) === 'lokal');
  const available = finance.reduce((sum, p) => sum + (p.finance?.open ? p.finance.remaining : 0), 0);
  const functions = [...new Set(spaces.flatMap((p) => p.space_functions || []))].sort((a, b) => a.localeCompare(b, 'sv'));
  const has = (text, needle) => text.toLowerCase().includes(needle.trim().toLowerCase());
  const costText = (p) => `${SPACE_COSTS[p.space_cost] || ''} ${p.space_price || ''}`;
  const shown = tab === 'finansiering' ? finance
    : tab === 'lokal' ? spaces.filter((p) => (!fn.trim() || (p.space_functions || []).some((f) => has(f, fn))) && (!cost.trim() || has(costText(p), cost)))
    : here;
  const localGroups = (groups.data || []).filter((g) => inPlace(g, place));
  const where = placeLabel(place);

  return html`<div class="page">
    <header class="topbar brand">
      <${PlaceSwitcher} groups=${groups.data || []} />
      <a class="iconbtn map-btn" href="#/karta" aria-label="Visa grupperna på kartan" title="Karta"><${Icon} name="map" /></a>
      <div class="topbar-side right">
        <a class="iconbtn" href="#/sok" aria-label="Sök" title="Sök"><${Icon} name="search" /></a>
        ${(s.badges.todos > 0 || s.me.is_editor) && html`<a class="iconbtn" href="#/att-gora" aria-label="Checklista"><${Icon} name="check" /><${Count} n=${s.badges.todos} /></a>`}
        <a class="iconbtn" href="#/notiser" aria-label="Notiser" title="Notiser"><${Icon} name="bell" /><${Count} n=${s.badges.notifications} /></a>
        <a class="iconbtn" href="#/meddelanden" aria-label="Meddelanden"><${Icon} name="chat" /><${Count} n=${s.badges.messages} /></a>
      </div>
    </header>
    ${api.mode === 'demo' && html`<div class="demo-banner">Demoläge – allt sparas bara i den här webbläsaren.
      <button class="link" onClick=${async () => { if (confirm('Återställ demodatan? Allt du skapat försvinner.')) { await api.resetDemo(); location.hash = '#/'; location.reload(); } }}>Återställ</button></div>`}

    ${!s.me.home && html`<a class="nudge home-nudge" href="#/redigera-profil"><strong>Var håller du till?</strong> Ange land, region, stad och stadsdel så startar appen där – och du kan zooma ut med ‹ överst.</a>`}
    <${InstallHint} />
    <div class="stories">
      <a class="story" href="#/ny-grupp"><span class="story-new">+</span><span class="story-name">Ny grupp</span></a>
      ${localGroups.map((g) => html`<a class="story" href=${'#/grupp/' + g.id} key=${g.id}>
        <span class=${'story-ring' + (g.verified_at ? ' verified' : '')} title=${g.verified_at ? 'Verifierad grupp' : ''}><${Avatar} src=${g.avatar_url} name=${g.name} size=${60} /></span>
        <span class="story-name">${g.name}</span></a>`)}
    </div>

    <div class="filterbar" role="tablist">
      ${TABS.map(([k, label]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => choose(k)}>
        ${label}</button>`)}
    </div>
    ${tab !== 'flode' && html`<div class="tab-head">
      <div class="tab-info">
        ${tab === 'finansiering' && html`<span class="muted small">Pengar som grupper i ${where} kan söka just nu${available > 0 ? html` – totalt <b class="avail">${fmtKr(available)}</b> tillgängligt` : ''}.</span>`}
        ${tab === 'evenemang' && html`<span class="muted small">Kommande evenemang i ${where}, dag för dag</span>`}
        ${tab === 'lokal' && html`<span class="muted small">Lokaler, verktyg och annat att låna, använda mot en gentjänst eller hyra i ${where}</span>`}
      </div>
    </div>`}
    ${tab === 'lokal' && html`<div class="space-filters">
      <${FilterCombo} value=${fn} onChange=${setFn} options=${functions} placeholder="Vad" />
      <${FilterCombo} value=${cost} onChange=${setCost} options=${Object.values(SPACE_COSTS)} placeholder="Kostnad" />
    </div>`}

    ${tab === 'flode' && posts.data && html`<${SinceLast} here=${here} posts=${posts} where=${where} />`}
    ${tab === 'evenemang' ? html`<${EventsList} place=${place} empty=${html`<p class="empty">Inga kommande evenemang i ${where}.
          ${canZoomOut(place) && html`<br /><span class="small">Tryck på <b>‹</b> högst upp för att zooma ut till ${placeLabel(zoomOut(place))}.</span>`}</p>`} />`
      : posts.loading && !posts.data ? html`<${FeedSkeleton} />` : posts.error ? html`<${ErrorBox} error=${posts.error} />`
      : shown.length === 0 && !posts.done ? html`<${FeedSkeleton} n=${1} />`
      : shown.length === 0 ? html`<p class="empty">${{ flode: 'Inga inlägg', finansiering: 'Ingen finansiering att söka', lokal: 'Inga resurser', }[tab]} i ${where}${(fn || cost) ? ' som matchar' : ' än'}.
          ${canZoomOut(place) && html`<br /><span class="small">Tryck på <b>‹</b> högst upp för att zooma ut till ${placeLabel(zoomOut(place))}.</span>`}</p>`
      : html`<div class="feed">${shown.map((p) => html`<${PostCard} key=${p.id} post=${p} onChange=${posts.reload} />`)}</div>`}
    ${tab !== 'evenemang' && posts.data && html`<${LoadMore} posts=${posts} short=${shown.length < 12} />`}
  </div>`;
}

export function PostView({ id }) {
  const post = useAsync(() => api.getPost(id), [id]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    if (await attempt(() => api.addComment(id, body))) { setBody(''); post.reload(); }
    setBusy(false);
  }
  return html`<div class="page">
    <${Header} title=${post.data?.finance ? 'Finansiering' : 'Inlägg'} back />
    ${post.loading && !post.data ? html`<${Loading} />` : post.error ? html`<${ErrorBox} error=${post.error} />` : html`
      <div class="post-page">
        <div class="post-main"><${PostCard} post=${post.data} full onChange=${post.reload} /></div>
        <div class="post-side">
          <section class="comments-section">
            <h2 class="section-title">Kommentarer${post.data.finance ? ' och ansökningar' : ''}</h2>
            <${Comments} post=${post.data} onChange=${post.reload} />
          </section>
          <form class="comment-form" onSubmit=${send}>
            <input value=${body} onInput=${(e) => setBody(e.target.value)} placeholder="Skriv en kommentar…" aria-label="Kommentar" />
            <button class="link strong" disabled=${!body.trim() || busy}>Publicera</button>
          </form>
        </div>
      </div>`}
  </div>`;
}

const plusDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// Typerna man väljer mellan när man lägger upp något. Evenemang sparas som ett vanligt inlägg med datum, tid och plats.
const FORM_TYPES = { vanlig: 'Vanlig post', evenemang: 'Evenemang', finansiering: 'Tillgänglig finansiering', lokal: 'Resurs att låna eller hyra' };
const TYPE_HELP = {
  evenemang: 'Något som händer en viss dag: får tid och plats, syns under Events och folk kan anmäla sig.',
  finansiering: 'Pengar som andra grupper kan söka. Syns under Finansiering.',
  lokal: 'Något andra kan låna, använda mot en gentjänst eller hyra – en lokal, verktyg, en maskin, mark. Syns under Resurser.',
};
const TYPE_TITLE = { vanlig: 'Nytt inlägg', evenemang: 'Nytt evenemang', finansiering: 'Ny finansiering', lokal: 'Ny lokal' };

function FinanceSteps() {
  return html`<div class="steps">
    <strong>Så fungerar finansieringen</strong>
    <p class="steps-owner"><b>Du som lägger upp inlägget ansvarar för pengarna.</b> Det är du som får notiserna om nya ansökningar, du som beviljar eller avslår och du som betalar ut. Inläggets grupp syns som avsändare, men ansvaret ligger hos dig personligen.</p>
    <ol>
      <li>Du anger hur mycket pengar som finns, om de går till <em>en mottagare</em> eller kan sökas i <em>delbelopp</em> av flera, och hur länge inlägget ska ligga uppe.</li>
      <li>Den som vill söka trycker på <b>Ansök</b> på inlägget och skriver en motivering. Motiveringen blir en kommentar som alla kan läsa, märkt <span class="badge applied">Ansökt</span>.</li>
      <li>Den sökande anger också belopp och swishnummer – eller bankkonto om beloppet är över ${fmtKr(PAYOUT_BANK_LIMIT)}. Betalningsuppgifterna syns bara för dig och den sökande.</li>
      <li>Varje ny ansökan hamnar i <em>din</em> checklista (✓ uppe till höger). Du trycker <b>Bevilja</b> eller <b>Avslå</b> direkt under kommentaren.</li>
      <li>Beviljade ansökningar ligger kvar i din checklista som en utbetalning, t.ex. ”Swisha Maja Ek 2 500 kr till 070-…”.</li>
      <li>Du betalar själv via Swish eller bank och bockar sedan av raden. Ansökan märks <span class="badge paid">Utbetald</span> och mätaren på inlägget visar hur mycket som finns kvar.</li>
    </ol>
    <small class="muted">Appen hanterar inga pengar – den håller bara ordning på ansökningar och utbetalningar. Du kan stänga finansieringen när som helst via ··· på inlägget.</small>
  </div>`;
}

// Chips att välja bland. Plus-chippen först öppnar ett litet fält: börja skriva för att välja ett befintligt eller lägga till ett nytt.
// Taggar skrivs fritt: Enter, komma eller mellanslag gör en tagg av det man skrivit. # behövs inte.
function TagInput({ value, onChange }) {
  const [text, setText] = useState('');
  const clean = (t) => t.replace(/^#+/, '').trim();
  const add = (raw) => {
    const t = clean(raw);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText('');
  };
  return html`<div class="tag-input">
    ${value.map((t) => html`<span class="chip on" key=${t}>#${t.toLowerCase()}<button type="button" aria-label=${`Ta bort ${t}`} onClick=${() => onChange(value.filter((x) => x !== t))}>×</button></span>`)}
    <input value=${text} placeholder=${value.length ? 'Fler taggar…' : 'T.ex. solceller, odling, vatten'} aria-label="Skriv en tagg"
      onInput=${(e) => { const v = e.target.value; if (/[ ,]$/.test(v)) add(v.slice(0, -1)); else setText(v); }}
      onKeyDown=${(e) => { const v = e.target.value; if (e.key === 'Enter') { e.preventDefault(); if (v.trim()) add(v); } if (e.key === 'Backspace' && !v && value.length) onChange(value.slice(0, -1)); }}
      onBlur=${(e) => e.target.value.trim() && add(e.target.value)} />
  </div>`;
}

function ChipPicker({ options, selected, onChange, placeholder }) {
  const [extra, setExtra] = useState([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const all = [...new Set([...options, ...extra, ...selected])];
  const toggle = (c) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const q = text.trim().toLowerCase();
  const hits = q ? all.filter((x) => x.toLowerCase().includes(q) && !selected.includes(x)).slice(0, 6) : [];
  const exact = all.find((x) => x.toLowerCase() === q);
  function add(value = text) {
    const c = value.trim().replace(/^./, (m) => m.toUpperCase());
    setText(''); setAdding(false);
    if (!c) return;
    const existing = all.find((x) => x.toLowerCase() === c.toLowerCase()) || c;
    if (!all.includes(existing)) setExtra((xs) => [...xs, existing]);
    if (!selected.includes(existing)) onChange([...selected, existing]);
  }
  return html`<div class="chip-picker">
    <div class="chips wrap">
      ${adding
        ? html`<span class="chip-input"><input autofocus value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${placeholder}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') { setAdding(false); setText(''); } }}
            onBlur=${() => setTimeout(() => { if (!text.trim()) setAdding(false); }, 150)} />
            ${q && html`<span class="chip-hits">
              ${hits.map((h) => html`<button type="button" onMouseDown=${(e) => e.preventDefault()} onClick=${() => add(h)}>${h}</button>`)}
              ${!exact && html`<button type="button" class="new" onMouseDown=${(e) => e.preventDefault()} onClick=${() => add()}>+ Lägg till ”${text.trim()}”</button>`}
            </span>`}</span>`
        : html`<button type="button" class="chip chip-plus" aria-label="Lägg till" title="Lägg till" onClick=${() => setAdding(true)}>+</button>`}
      ${all.map((c) => html`<button type="button" class=${'chip' + (selected.includes(c) ? ' on' : '')} onClick=${() => toggle(c)}>${c}</button>`)}
    </div>
  </div>`;
}

export function Compose({ groupId: initialGroup, type: initialType, editId }) {
  const s = useStore();
  const editing = !!editId;
  const fixedType = editing || !!FORM_TYPES[initialType];   // från en flik: typen är redan vald
  const myGroups = s.myGroups;
  const spaceOptions = useAsync(async () => [...new Set([...DEFAULT_FUNCTIONS, ...(await api.listPosts({ kind: 'lokal' })).flatMap((p) => p.space_functions || [])])], []);
  const [loaded, setLoaded] = useState(!editing);
  const [type, setType] = useState(FORM_TYPES[initialType] ? initialType : 'vanlig');
  const [slides, setSlides] = useState([]);
  const [caption, setCaption] = useState('');
  const [groupId, setGroupId] = useState(initialGroup && s.memberOf.has(initialGroup) ? initialGroup : myGroups[0]?.id || null);
  const [personal, setPersonal] = useState(false);
  const [asGroup, setAsGroup] = useState(false);   // admins kan publicera som gruppen
  // Vem ser inlägget: alla (tom lista) eller bara medlemmar i valda grupper.
  const [visibleTo, setVisibleTo] = useState([]);
  const [limit, setLimit] = useState(false);
  const [joining, setJoining] = useState(false);
  // Plats för inlägg utan grupp (förifylld med ens egen plats).
  const [where, setWhere] = useState(() => (s.me.home ? { ...emptyHome(), ...s.me.home, district: null } : emptyHome()));
  const placeGroups = useAsync(() => api.listGroups(), []);
  const [tags, setTags] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [cost, setCost] = useState('gratis');
  const [price, setPrice] = useState('');
  const [finTotal, setFinTotal] = useState('');
  const [finMode, setFinMode] = useState('split');
  const [finEnd, setFinEnd] = useState(plusDays(30));
  const [hadFinance, setHadFinance] = useState(false);
  const [ev, setEv] = useState({ date: '', start: '', end: '', address: '', rsvp: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cropping, setCropping] = useState(null);   // index för bilden som beskärs

  useEffect(() => {
    if (!editing) return;
    api.getPost(editId).then((p) => {
      if (p.author_id !== s.me.id) return go('/post/' + editId);
      setType(p.is_event ? 'evenemang' : postType(p));
      setSlides(p.slides.map((x) => ({ key: x.id, id: x.id, image_url: x.image_url, media_type: x.media_type || 'image', preview: x.image_url, text: x.text || '' })));
      setCaption(p.caption || ''); setGroupId(p.group_id); setPersonal(!p.group_id); setAsGroup(!!p.as_group); setVisibleTo(p.visible_to || []); setLimit(!!p.visible_to?.length);
      if (!p.group_id && p.country) setWhere({ ...emptyHome(), country: p.country, region: p.region || '', city: p.city || '', postcode: p.postcode || null });
      setTags(p.categories || []);
      setFunctions(p.space_functions || []); setCost(p.space_cost || 'gratis'); setPrice(p.space_price || '');
      if (p.is_event && p.event_start) {
        const d = new Date(p.event_start), e = p.event_end ? new Date(p.event_end) : null;
        const loc = (x) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
        setEv({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, start: loc(d), end: e ? loc(e) : '',
          address: p.event_address || '', postcode: p.event_postcode, city: p.event_city, region: p.event_region, country: p.event_country,
          lat: p.event_lat, lng: p.event_lng, rsvp: p.event_rsvp !== false });
      }
      if (p.fin_total != null) {
        setHadFinance(true); setFinTotal(String(p.fin_total)); setFinMode(p.fin_mode);
        setFinEnd(p.fin_expires_at ? p.fin_expires_at.slice(0, 10) : '');
      }
      setLoaded(true);
    }, (e) => setErr(e.message));
  }, [editId]);

  const noGroups = myGroups.length === 0;
  const isPersonal = personal || noGroups || !groupId;
  const update = (i, patch) => setSlides((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i) => setSlides((xs) => xs.filter((_, j) => j !== i));
  const move = (i, d) => setSlides((xs) => { const a = [...xs]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; });
  function addFiles(e) {
    const files = [...e.target.files];
    const big = files.find((f) => f.type.startsWith('video/') && f.size > 50 * 1024 * 1024);
    if (big) setErr(`${big.name} är för stor – videor får vara högst 50 MB.`);
    setSlides((xs) => [...xs, ...files.filter((f) => f !== big).map((file) => ({ key: crypto.randomUUID(), file, media_type: file.type.startsWith('video/') ? 'video' : 'image', preview: URL.createObjectURL(file), text: '' }))]);
    // En enda bild: beskärningen öppnas direkt (som på Instagram). Flera bilder beskärs en i taget med knappen.
    if (files.length === 1 && files[0].type.startsWith('image/')) setCropping(slides.length);
    e.target.value = '';
  }

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (type === 'finansiering' && !hadFinance && finEnd && finEnd < plusDays(0)) return setErr('Slutdatumet har redan passerat.');
    if (!isPersonal && groupId && !s.memberOf.has(groupId)) return setErr('Gå med i gruppen först – eller välj en annan grupp.');
    if (limit && !visibleTo.length) return setErr('Välj minst en grupp som ska se inlägget, eller välj Alla.');
    if (isPersonal && checkHome(where)) return setErr(checkHome(where).replace('du håller till i', 'inlägget gäller'));
    setBusy(true);
    try {
      const payload = {
        type: type === 'evenemang' ? 'vanlig' : type, groupId: isPersonal ? null : groupId, place: isPersonal ? where : null, asGroup: !isPersonal && asGroup && s.adminOf.has(groupId), visibleTo: limit ? visibleTo : [], caption, tags,
        slides: slides.map(({ id, file, image_url, media_type, text }) => ({ id, file, image_url, media_type, text })),
        finance: type === 'finansiering'
          ? { total: Number(String(finTotal).replace(/\s/g, '')), mode: finMode, expiresAt: finEnd ? new Date(finEnd + 'T23:59:59').toISOString() : null }
          : null,
        space: type === 'lokal' ? { functions, cost, price } : null,
        // Saknar adressen region tas den från gruppen (samma stad) eller från andra platser i appen.
        event: type === 'evenemang' ? (() => { const g = myGroups.find((x) => x.id === groupId); const pl = postPlace({ ...eventColumns(ev), group: isPersonal ? null : g }); return { ...ev, region: ev.region || pl?.region || null, country: ev.country || pl?.country || null }; })() : null,
      };
      if (editing) { await api.updatePost(editId, payload); go('/post/' + editId); }
      else { const id = await api.createPost(payload); refreshBadges(); go('/post/' + id); }
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  if (!loaded) return html`<div class="page"><${Header} title="Redigera" back />${err ? html`<p class="empty error">${err}</p>` : html`<${Loading} />`}</div>`;

  return html`<div class="page">
    <${Header} title=${editing ? 'Redigera inlägg' : fixedType ? TYPE_TITLE[type] : 'Nytt inlägg'} back />
    <form class="form pad" onSubmit=${submit}>

      ${!fixedType && html`<fieldset class="field types">
        <legend class="label">Typ av post</legend>
        ${Object.entries(FORM_TYPES).map(([k, label]) => html`<label class=${'radio type' + (type === k ? ' on' : '')} key=${k}>
          <input type="radio" name="type" value=${k} checked=${type === k} onChange=${() => setType(k)} />
          <span><strong>${label}</strong>${TYPE_HELP[k] && html`<small>${TYPE_HELP[k]}</small>`}</span></label>`)}
      </fieldset>`}

      ${type === 'finansiering' && html`<section class="field fin-form">
        <${FinanceSteps} />
        <label>Totalbelopp (kr)<input inputmode="numeric" required value=${finTotal} disabled=${hadFinance} onInput=${(e) => setFinTotal(e.target.value)} placeholder="t.ex. 20000" /></label>
        <div class="label small">Hur ska pengarna fördelas?</div>
        <label class="radio"><input type="radio" name="mode" checked=${finMode === 'split'} disabled=${hadFinance} onChange=${() => setFinMode('split')} />
          <span>Flera kan söka delbelopp <small>Varje sökande anger hur mycket de behöver. Det som beviljas dras från potten.</small></span></label>
        <label class="radio"><input type="radio" name="mode" checked=${finMode === 'single'} disabled=${hadFinance} onChange=${() => setFinMode('single')} />
          <span>En mottagare får hela summan</span></label>
        <label>Ligger uppe till och med<input type="date" value=${finEnd} min=${plusDays(0)} onInput=${(e) => setFinEnd(e.target.value)} /></label>
      </section>`}

      ${type === 'lokal' && html`<section class="field">
        <div class="label">Vad är det, och vad kan det användas till?</div>
        <${ChipPicker} options=${spaceOptions.data || DEFAULT_FUNCTIONS} selected=${functions} onChange=${setFunctions} placeholder="T.ex. borrmaskin, kök, släpvagn…" />
        <div class="label">Vad kostar det?</div>
        ${Object.entries(SPACE_COSTS).map(([k, label]) => html`<label class="radio" key=${k}>
          <input type="radio" name="cost" checked=${cost === k} onChange=${() => setCost(k)} /><span>${label}</span></label>`)}
        ${cost === 'kostar' && html`<label>Pris<input value=${price} onInput=${(e) => setPrice(e.target.value)} placeholder="t.ex. 200 kr per dag" /></label>`}
      </section>`}

      ${type === 'evenemang' && html`<section class="field event-form">
        <div class="event-fields">
          <div class="inline3">
            <label>Datum<input type="date" required value=${ev.date} min=${plusDays(0)} onInput=${(e) => setEv((v) => ({ ...v, date: e.target.value }))} /></label>
            <label>Börjar<input type="time" required value=${ev.start} onInput=${(e) => setEv((v) => ({ ...v, start: e.target.value }))} /></label>
            <label>Slutar<input type="time" value=${ev.end} onInput=${(e) => setEv((v) => ({ ...v, end: e.target.value }))} /></label>
          </div>
          <label>Plats<${AddressPicker} value=${ev} onPick=${(h) => setEv((v) => ({ ...v, ...h }))} placeholder="Adress där det händer" /></label>
          <label class="check"><input type="checkbox" checked=${ev.rsvp} onChange=${(e) => setEv((v) => ({ ...v, rsvp: e.target.checked }))} />
            <span>Låt folk anmäla sig <small>Knapparna Intresserad och Kommer visas, med antal.</small></span></label>
        </div>
      </section>`}

      <section class="field">
        <div class="label">Vilken grupp gäller inlägget?</div>
        ${noGroups ? html`<div class="nudge">
            <strong>Du är inte med i någon grupp än.</strong>
            <p>Inlägg ska helst höra till en grupp. Gå med i en grupp eller skapa en ny.</p>
            <div class="btnrow"><a class="btn small" href="#/sok?flik=grupper">Hitta grupper</a><a class="btn small primary" href="#/ny-grupp?next=/ny">Skapa grupp</a></div>
          </div>`
        : html`${!isPersonal && html`<${GroupPicker} groups=${myGroups} others=${placeGroups.data || []} value=${groupId} onChange=${(id) => { setGroupId(id); setPersonal(false); }} />`}
          ${!isPersonal && groupId && !s.memberOf.has(groupId) && (() => { const g = (placeGroups.data || []).find((x) => x.id === groupId); return html`<div class="nudge join-first">
            <span>Du är inte med i <b>${g?.name || 'gruppen'}</b>. Gå med för att kunna posta där.</span>
            <button type="button" class="btn small primary" disabled=${joining} onClick=${async () => {
              setJoining(true);
              if (await attempt(() => api.joinGroup(groupId), `Du är med i ${g?.name || 'gruppen'}`)) await refreshMe();
              setJoining(false);
            }}>Gå med</button></div>`; })()}
          ${isPersonal
            ? html`<p class="hint">Personligt inlägg – det hör inte till någon grupp. <button type="button" class="link" onClick=${() => { setPersonal(false); setGroupId(groupId || myGroups[0].id); }}>Välj en grupp i stället</button></p>`
            : html`<button type="button" class="link subtle" onClick=${() => setPersonal(true)}>Posta utan grupp</button>`}
          ${!isPersonal && s.adminOf.has(groupId) && html`<label class="check as-group">
            <input type="checkbox" checked=${asGroup} onChange=${(e) => setAsGroup(e.target.checked)} />
            <span><b>Publicera som gruppen</b><small>Gruppens namn och bild visas som avsändare, med ”via ${s.me.name}” under. Bara gruppens admins kan välja det här.</small></span></label>`}`}
      ${isPersonal && html`<${HomePlaceFields} value=${where} onChange=${setWhere} groups=${placeGroups.data} legend="Var gäller inlägget?" chooseLevel=${false} />
        <small class="muted place-why">Inlägg utan grupp syns på den plats du anger här.</small>`}
      </section>

      <fieldset class="field visibility">
        <legend class="label">Vem ser inlägget?</legend>
        <label class="radio"><input type="radio" name="vis" checked=${!limit} onChange=${() => setLimit(false)} /><span><strong>Alla</strong></span></label>
        <label class="radio"><input type="radio" name="vis" checked=${limit} onChange=${() => { setLimit(true); if (!visibleTo.length && !isPersonal && groupId) setVisibleTo([groupId]); }} />
          <span><strong>Bara vissa grupper</strong><small>Bara medlemmar i grupperna du väljer ser inlägget. Det går att ändra senare.</small></span></label>
        ${limit && html`<${GroupsPicker} groups=${myGroups} others=${placeGroups.data || []} value=${visibleTo} onChange=${setVisibleTo} />`}
      </fieldset>

      <section class="field">
        <div class="label">Bilder och video</div>
        ${slides.map((sl, i) => html`<div class="slide-edit" key=${sl.key}>
          ${sl.media_type === 'video' ? html`<video src=${sl.preview} muted playsinline preload="metadata"></video>` : html`<img src=${sl.preview} alt="" />`}
          <div class="se-main">
            <textarea rows="3" placeholder=${`Text till ${sl.media_type === 'video' ? 'videon' : 'bild ' + (i + 1)} (valfritt)`} value=${sl.text} onInput=${(e) => update(i, { text: e.target.value })}></textarea>
            <div class="se-actions">
              ${sl.media_type !== 'video' && html`<button type="button" class="link" onClick=${() => setCropping(i)}>Beskär och zooma</button>`}
              ${i > 0 && html`<button type="button" class="link" onClick=${() => move(i, -1)}>↑ Flytta upp</button>`}
              <button type="button" class="link danger" onClick=${() => remove(i)}>Ta bort</button>
            </div>
          </div></div>`)}
        <label class="addimg"><input type="file" accept="image/*,video/*" multiple hidden onChange=${addFiles} /><${Icon} name="image" />
          ${slides.length ? 'Lägg till fler bilder eller video' : 'Lägg till bilder eller video'}</label>
        ${cropping != null && slides[cropping] && html`<${CropModal} shape="square" size=${1080} title="Beskär bilden"
          file=${slides[cropping].file} src=${slides[cropping].file ? null : slides[cropping].image_url}
          onCancel=${() => setCropping(null)}
          onDone=${(file) => { update(cropping, { file, preview: URL.createObjectURL(file), media_type: 'image' }); setCropping(null); }} />`}
        <small class="muted">Videor får vara högst 50 MB och spelas upp utan ljud i flödet.</small>
      </section>

      <label class="field">Text till inlägget
        <textarea rows="4" value=${caption} onInput=${(e) => setCaption(e.target.value)}
          placeholder=${{ finansiering: 'Vad kan pengarna sökas för? Vem kan söka?', lokal: 'Var finns det, när går det att låna och hur bokar man?' }[type] || 'Berätta vad ni gjort, vad ni lärt er eller vad ni behöver…'}></textarea></label>

      ${(type === 'vanlig' || type === 'evenemang') && html`<section class="field">
        <div class="label">Taggar <small class="muted">(valfritt)</small></div>
        <${TagInput} value=${tags} onChange=${setTags} />
      </section>`}

      ${err && html`<p class="error">${err}</p>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Sparar…' : editing ? 'Spara ändringar' : 'Publicera'}</button>
    </form>
  </div>`;
}
