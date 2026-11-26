// Flödet, enskilt inlägg och skapa/redigera inlägg.
import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, go, attempt, refreshBadges, refreshMe, onRefresh } from '../store.js';
import { Icon, Avatar, Count, Header, PostCard, Comments, Loading, ErrorBox, Sheet, GroupPicker, GroupsPicker, AddressPicker, CropModal, MentionField } from '../ui.js';
import { PAYOUT_BANK_LIMIT, POST_TYPES, DEFAULT_FUNCTIONS, SPACE_COSTS, postType, placeLabel, inPlace, postPlace, postVisibleAt, regionName, eventColumns, zoomOut, fmtKr, visibleInFeed, canZoomOut, lookupPostcode, STANCES, stanceOf } from '../util.js';

import { InstallHint } from '../install.js';
import { CHANGES } from '../changelog.js';

const PLUS = html`<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export { PlaceSwitcher } from './place.js';
import { PlaceSwitcher, HomePlaceFields, checkHome, emptyHome } from './place.js';
import { EventsList } from './calendar.js';

// Flödet hämtas 30 inlägg i taget; nästa omgång hämtas när man närmar sig slutet (eller när den valda
// platsen eller fliken har för lite att visa), så att appen håller farten även med väldigt många inlägg.
const FIRST = 10, PAGE = 20;   // första omgången liten så att flödet syns fort; resten hämtas när man scrollar
// Flödet och var man var i det sparas när man lämnar det (t.ex. öppnar ett inlägg), så att man kommer
// tillbaka till samma inlägg i stället för till toppen. Allt hämtas om i bakgrunden när man kommer tillbaka.
let feedCache = (() => {   // det man såg senast visas direkt när appen startar, och hämtas om i bakgrunden
  try { const d = JSON.parse(localStorage.getItem('feed-cache-' + api.mode) || 'null'); return d?.length ? { data: d, loading: false, error: null, done: false } : null; } catch { return null; }
})();
export const feedScroll = { y: 0 };
function usePagedPosts() {
  const [st, setSt] = useState(() => feedCache ? { ...feedCache, loading: false } : { data: null, loading: true, error: null, done: false });
  const ref = useRef(st); ref.current = st;
  useEffect(() => {
    if (!st.data) return;
    feedCache = st;
    try { localStorage.setItem('feed-cache-' + api.mode, JSON.stringify(st.data.slice(0, FIRST))); } catch { /* går bra utan */ }
  }, [st]);
  const busy = useRef(false);
  async function load(reset) {
    if (busy.current) return;
    busy.current = true;
    setSt((x) => ({ ...x, loading: true }));
    try {
      const cur = reset ? [] : ref.current.data || [];
      // Vid omladdning hämtas lika många som redan visas, så att man inte tappar sin plats.
      const limit = reset ? Math.max(FIRST, Math.min((ref.current.data || []).length, 60)) : PAGE;
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
  const [showAll, setShowAll] = useState(false);
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
      ${open && html`<ul>${(showAll ? changes : changes.slice(0, MAX)).map((c, i) => html`<li key=${i}>${c.text}</li>`)}
        ${!showAll && changes.length > MAX && html`<li class="more-li"><button class="link" onClick=${() => setShowAll(true)}>… och ${changes.length - MAX} till</button></li>`}</ul>`}
    </div>`}
  </div>`;
}

// Texten under flikarna (per Behövs / Finns / Tips).
const TAB_INFO = {
  finansiering: { behovs: (w) => `Grupper och personer i ${w} som behöver pengar – kan du hjälpa till?`, finns: (w) => `Pengar som går att söka i ${w}.`, tips: () => 'Tips om fonder, bidrag och stöd. Dela det du hittat!' },
  lokal: { behovs: (w) => `Det här efterlyses i ${w} – har du något att låna ut?`, finns: (w) => `Lokaler, verktyg och annat att låna, använda mot en gentjänst eller hyra i ${w}.` },
  evenemang: { all: (w) => `Kommande evenemang i ${w}, dag för dag.` },
};
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
  // Behövs / Finns (/ Tips) per flik – kommer ihåg valet under besöket.
  const [stances, setStances] = useState(() => { try { return { finansiering: 'finns', lokal: 'finns', ...JSON.parse(sessionStorage.getItem('stances') || '{}') }; } catch { return { finansiering: 'finns', lokal: 'finns' }; } });
  const setStance = (t, k) => setStances((x) => { const n = { ...x, [t]: k }; try { sessionStorage.setItem('stances', JSON.stringify(n)); } catch {} return n; });
  const postHref = tab === 'flode' ? '#/ny?typ=vanlig' : tab === 'evenemang' ? '#/ny?typ=evenemang' : `#/ny?typ=${tab}&stance=${stances[tab]}`;
  const postLabel = { flode: 'Nytt inlägg', evenemang: 'Nytt evenemang',
    finansiering: { behovs: 'Berätta vad ni behöver pengar till', finns: 'Lägg upp pengar som går att söka', tips: 'Dela ett tips' }[stances.finansiering],
    lokal: stances.lokal === 'behovs' ? 'Efterlys något' : 'Erbjud något att låna' }[tab];

  const here = (posts.data || []).filter((p) => postVisibleAt(p, place));
  // Flödet är vanliga inlägg; finansiering, resurser och evenemang har egna flikar.
  const plain = here.filter((p) => postType(p) === 'vanlig' && !p.is_event);
  const finance = here.filter((p) => postType(p) === 'finansiering' && stanceOf(p) === stances.finansiering);
  const spaces = here.filter((p) => postType(p) === 'lokal' && stanceOf(p) === stances.lokal);
  const functions = [...new Set(spaces.flatMap((p) => p.space_functions || []))].sort((a, b) => a.localeCompare(b, 'sv'));
  const has = (text, needle) => text.toLowerCase().includes(needle.trim().toLowerCase());
  const costText = (p) => `${SPACE_COSTS[p.space_cost] || ''} ${p.space_price || ''}`;
  const shown = tab === 'finansiering' ? finance
    : tab === 'lokal' ? spaces.filter((p) => (!fn.trim() || (p.space_functions || []).some((f) => has(f, fn))) && (!cost.trim() || has(costText(p), cost)))
    : plain;
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
    <div class="tab-head">
      ${STANCES[tab] && html`<div class="stance-switch" role="radiogroup" aria-label="Visa">
        ${Object.entries(STANCES[tab]).map(([k, label]) => html`<button type="button" role="radio" key=${k} aria-checked=${stances[tab] === k}
          class=${stances[tab] === k ? 'on' : ''} onClick=${() => setStance(tab, k)}>${label}</button>`)}
      </div>`}
      ${TAB_INFO[tab]?.[STANCES[tab] ? stances[tab] : 'all'] && html`<p class="tab-info muted small">${TAB_INFO[tab][STANCES[tab] ? stances[tab] : 'all'](where)}</p>`}
      <a class="post-here" href=${postHref}><span class="post-here-plus">+</span>${postLabel}</a>
    </div>
    ${tab === 'lokal' && stances.lokal === 'finns' && html`<div class="space-filters">
      <${FilterCombo} value=${fn} onChange=${setFn} options=${functions} placeholder="Vad" />
      <${FilterCombo} value=${cost} onChange=${setCost} options=${Object.values(SPACE_COSTS)} placeholder="Kostnad" />
    </div>`}

    ${tab === 'flode' && posts.data && html`<${SinceLast} here=${here} posts=${posts} where=${where} />`}
    ${tab === 'evenemang' ? html`<${EventsList} place=${place} empty=${html`<p class="empty">Inga kommande evenemang i ${where}.
          ${canZoomOut(place) && html`<br /><span class="small">Tryck på <b>‹</b> högst upp för att zooma ut till ${placeLabel(zoomOut(place))}.</span>`}</p>`} />`
      : posts.loading && !posts.data ? html`<${FeedSkeleton} />` : posts.error ? html`<${ErrorBox} error=${posts.error} />`
      : shown.length === 0 && !posts.done ? html`<${FeedSkeleton} n=${1} />`
      : shown.length === 0 ? html`<p class="empty">${{ flode: 'Inga inlägg', finansiering: { behovs: 'Ingen som behöver pengar', finns: 'Inga pengar att söka', tips: 'Inga tips' }[stances.finansiering], lokal: stances.lokal === 'behovs' ? 'Inget efterlyst' : 'Inga resurser' }[tab]} i ${where}${(fn || cost) ? ' som matchar' : ' än'}.
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
            <${MentionField} as="input" value=${body} onChange=${setBody} placeholder="Skriv en kommentar… (@ för att nämna någon)" aria-label="Kommentar" />
            <button class="link strong" disabled=${!body.trim() || busy}>Publicera</button>
          </form>
        </div>
      </div>`}
  </div>`;
}

const plusDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// Typerna man väljer mellan när man lägger upp något. Evenemang sparas som ett vanligt inlägg med datum, tid och plats.
const FORM_TYPES = { vanlig: 'Vanlig post', evenemang: 'Evenemang', finansiering: 'Tillgänglig finansiering', lokal: 'Resurs att låna eller hyra' };
// Korta namn i typväljaren överst i formuläret.
const TYPE_SHORT = { vanlig: 'Inlägg', evenemang: 'Evenemang', finansiering: 'Finansiering', lokal: 'Resurs' };
const TYPE_TITLE = { vanlig: 'Nytt inlägg', evenemang: 'Nytt evenemang', finansiering: 'Finansiering', lokal: 'Resurs' };

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

export function Compose({ groupId: initialGroup, type: initialType, stance: initialStance, editId }) {
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
  const [reach, setReach] = useState(null);   // hur långt ut inlägget når (null = där det hör hemma)
  const [joining, setJoining] = useState(false);
  // Plats för inlägg utan grupp (förifylld med ens egen plats).
  const [where, setWhere] = useState(() => (s.me.home ? { ...emptyHome(), ...s.me.home, district: null } : emptyHome()));
  const placeGroups = useAsync(() => api.listGroups(), []);
  // Förvalt: den grupp man postat mest i (om man inte kommit från en grupp eller redigerar).
  const groupTouched = useRef(!!initialGroup || editing);
  const myPosts = useAsync(() => (groupTouched.current ? Promise.resolve([]) : api.listPosts({ authorId: s.me.id, limit: 200 })), []);
  useEffect(() => {
    if (groupTouched.current || !myPosts.data?.length) return;
    const n = {};
    for (const p of myPosts.data) if (p.group_id && s.memberOf.has(p.group_id)) n[p.group_id] = (n[p.group_id] || 0) + 1;
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) setGroupId(best);
  }, [myPosts.data]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [distName, setDistName] = useState(null);
  const [tags, setTags] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [cost, setCost] = useState('gratis');
  const [price, setPrice] = useState('');
  // Finansiering och resurser: behövs / finns (/ tips), plus valfritt belopp och sista dag.
  const [stance, setStance] = useState(initialStance || 'finns');
  const [amount, setAmount] = useState('');
  // Byter man typ och valet saknas där (t.ex. Tips för resurser) blir det Finns.
  useEffect(() => { if (STANCES[type] && !STANCES[type][stance]) setStance('finns'); }, [type]);
  const [deadline, setDeadline] = useState('');
  const [finTotal, setFinTotal] = useState('');
  const [finMode, setFinMode] = useState('split');
  const [finEnd, setFinEnd] = useState(plusDays(30));
  const [hadFinance, setHadFinance] = useState(false);
  const [ev, setEv] = useState({ date: '', start: '', end: '', address: '', rsvp: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cropping, setCropping] = useState(null);   // index för bilden som beskärs
  const [sel, setSel] = useState(null);             // vald bild i raden (text, beskär, flytta)

  useEffect(() => {
    if (!editing) return;
    api.getPost(editId).then((p) => {
      if (p.author_id !== s.me.id) return go('/post/' + editId);
      setType(p.is_event ? 'evenemang' : postType(p));
      setSlides(p.slides.map((x) => ({ key: x.id, id: x.id, image_url: x.image_url, media_type: x.media_type || 'image', preview: x.image_url, text: x.text || '' })));
      setCaption(p.caption || ''); setGroupId(p.group_id); setPersonal(!p.group_id); setAsGroup(!!p.as_group); setVisibleTo(p.visible_to || []); setLimit(!!p.visible_to?.length); setReach(p.reach || null);
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
      if (p.stance) setStance(p.stance);
      if (p.amount != null) setAmount(String(p.amount));
      if (p.deadline) setDeadline(String(p.deadline).slice(0, 10));
      if (p.fin_total != null) {
        setHadFinance(true); setFinTotal(String(p.fin_total)); setFinMode(p.fin_mode);
        setFinEnd(p.fin_expires_at ? p.fin_expires_at.slice(0, 10) : '');
      }
      setLoaded(true);
    }, (e) => setErr(e.message));
  }, [editId]);

  const noGroups = myGroups.length === 0;
  const isPersonal = personal || noGroups || !groupId;
  // Räckvidd: från inläggets plats (gruppens, eller den man angett) och utåt. Första valet är där det hör hemma.
  const homePl = isPersonal ? where : (placeGroups.data || []).find((g) => g.id === groupId) || myGroups.find((g) => g.id === groupId) || {};
  const reachOptions = [
    homePl.postcode && ['district', distName || homePl.district || 'Stadsdelen'],
    homePl.city && ['city', homePl.city],
    homePl.region && ['region', regionName(homePl.region)],
    homePl.country && ['country', 'Hela landet'],
  ].filter(Boolean);
  if (!reachOptions.length) reachOptions.push(['city', 'Platsen']);
  // Stadsdelens namn slås upp från postnumret (t.ex. 414 62 → Stigberget).
  useEffect(() => {
    setDistName(null);
    if (!homePl.postcode) return;
    let alive = true;
    lookupPostcode(homePl.postcode, homePl.city || '').then((h) => { if (alive && h?.district) setDistName(h.district); }, () => {});
    return () => { alive = false; };
  }, [homePl.postcode]);
  // Grupperna som "bara gruppen" gäller: de valda, eller inläggets grupp.
  const groupById = (id) => (placeGroups.data || []).find((g) => g.id === id) || myGroups.find((g) => g.id === id);
  const onlyGroups = (limit && visibleTo.length ? visibleTo : groupId && !isPersonal ? [groupId] : []).map(groupById).filter(Boolean);
  // Byter man grupp kan räckvidden sakna motsvarighet – då gäller grundvalet.
  const reachNow = reachOptions.some(([l]) => l === reach) ? reach : null;
  const reachLvl = reachNow || reachOptions[0][0];
  const reachIn = { district: (distName || homePl.district) ? `i ${distName || homePl.district}` : 'i stadsdelen', city: `i ${homePl.city}`, region: `i ${regionName(homePl.region)}`, country: `i hela ${homePl.country}` }[reachLvl] || 'här';
  const reachHint = reachLvl === 'country' ? `Syns i flödet ${reachIn}.` : `Syns i flödet ${reachIn} – och för den som zoomar ut.`;
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
    if (files.length) setSel(null);
    e.target.value = '';
  }

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!isPersonal && groupId && !s.memberOf.has(groupId)) return setErr('Gå med i gruppen först – eller välj en annan grupp.');
    if (limit && !visibleTo.length) return setErr('Välj minst en grupp som ska se inlägget, eller välj Alla.');
    if (isPersonal && checkHome(where)) return setErr(checkHome(where).replace('du håller till i', 'inlägget gäller'));
    setBusy(true);
    try {
      const payload = {
        type: type === 'evenemang' ? 'vanlig' : type, groupId: isPersonal ? null : groupId, place: isPersonal ? where : null, asGroup: !isPersonal && asGroup && s.adminOf.has(groupId), visibleTo: limit ? visibleTo : [], reach: limit ? null : reachNow, caption, tags,
        slides: slides.map(({ id, file, image_url, media_type, text }) => ({ id, file, image_url, media_type, text })),
        stance, amount, deadline,
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
    <form class="form pad compose" onSubmit=${submit}>

      ${!fixedType && html`<div class="type-pills" role="radiogroup" aria-label="Typ av inlägg">
        ${Object.entries(TYPE_SHORT).map(([k, label]) => html`<button type="button" role="radio" aria-checked=${type === k} key=${k}
          class=${type === k ? 'on' : ''} onClick=${() => setType(k)}>${label}</button>`)}
      </div>`}

      ${STANCES[type] && html`<div class="stance-switch" role="radiogroup" aria-label=${type === 'finansiering' ? 'Pengar' : 'Resurs'}>
        ${Object.entries(STANCES[type]).map(([k, label]) => html`<button type="button" role="radio" key=${k} aria-checked=${stance === k}
          class=${stance === k ? 'on' : ''} onClick=${() => setStance(k)}>${{ finansiering: { behovs: 'Pengar behövs', finns: 'Pengar finns', tips: 'Tips' }, lokal: { behovs: 'Behövs', finns: 'Finns att låna' } }[type][k]}</button>`)}
      </div>`}

      <div class="media-strip">
        ${slides.map((sl, i) => html`<div class=${'media-tile' + (sel === i ? ' sel' : '')} key=${sl.key} onClick=${() => setSel(sel === i ? null : i)}>
          ${sl.media_type === 'video' ? html`<video src=${sl.preview} muted playsinline preload="metadata"></video>` : html`<img src=${sl.preview} alt="" />`}
          ${sl.media_type === 'video' && html`<span class="media-kind">Video</span>`}
          <button type="button" class="media-x" aria-label="Ta bort" onClick=${(e) => { e.stopPropagation(); remove(i); setSel(null); }}>×</button>
        </div>`)}
        <label class="media-add"><input type="file" accept="image/*,video/*" multiple hidden onChange=${addFiles} />
          <${Icon} name="image" /><span>${slides.length ? 'Fler' : 'Bild eller video'}</span></label>
      </div>
      ${sel != null && slides[sel] && html`<div class="media-edit">
        <input value=${slides[sel].text} onInput=${(e) => update(sel, { text: e.target.value })} placeholder=${`Text till ${slides[sel].media_type === 'video' ? 'videon' : 'bilden'} (valfritt)`} />
        <div class="se-actions">
          ${slides[sel].media_type !== 'video' && html`<button type="button" class="link" onClick=${() => setCropping(sel)}>Beskär och zooma</button>`}
          ${sel > 0 && html`<button type="button" class="link" onClick=${() => { move(sel, -1); setSel(sel - 1); }}>← Flytta</button>`}
          ${sel < slides.length - 1 && html`<button type="button" class="link" onClick=${() => { move(sel, 1); setSel(sel + 1); }}>Flytta →</button>`}
        </div>
      </div>`}
        ${cropping != null && slides[cropping] && html`<${CropModal} shape="square" size=${1080} title="Beskär bilden"
          file=${slides[cropping].file} src=${slides[cropping].file ? null : slides[cropping].image_url}
          onCancel=${() => setCropping(null)}
          onDone=${(file) => { update(cropping, { file, preview: URL.createObjectURL(file), media_type: 'image' }); setCropping(null); }} />`}

      <${MentionField} rows="4" value=${caption} onChange=${setCaption} aria-label="Text"
        placeholder=${(type === 'finansiering' ? { behovs: 'Vad behöver ni pengar till, och varför?', finns: 'Vad kan pengarna sökas för, vem kan söka och hur?', tips: 'Vilken fond, vilket bidrag eller stöd? Klistra in en länk.' }[stance]
          : type === 'lokal' ? (stance === 'behovs' ? 'Vad behöver du, när och var? T.ex. "Behöver låna en sladdvinda på lördag."' : 'Var finns det, när går det att låna och hur bokar man?')
          : type === 'evenemang' ? 'Vad händer? Vem är välkommen?' : null) || 'Vad vill du berätta? Skriv @ för att nämna någon.'} />

      ${type === 'finansiering' && html`<section class="field fin-form simple">
        <div class="inline2">
          <label>${{ behovs: 'Hur mycket behövs?', finns: 'Hur mycket finns?', tips: 'Belopp' }[stance] || 'Belopp'} <small class="muted">(valfritt)</small>
            <input inputmode="numeric" value=${amount} onInput=${(e) => setAmount(e.target.value)} placeholder="t.ex. 20 000" /></label>
          <label>${stance === 'behovs' ? 'Behövs senast' : 'Sista dag att söka'} <small class="muted">(valfritt)</small>
            <input type="date" value=${deadline} onInput=${(e) => setDeadline(e.target.value)} /></label>
        </div>
        <small class="muted">${{ behovs: 'Den som kan hjälpa till svarar i kommentarerna.', finns: 'Den som vill söka svarar i kommentarerna – eller via länken du skriver i texten.', tips: 'Klistra in en länk i texten, så hittar andra dit.' }[stance]}</small>
      </section>`}

      ${type === 'lokal' && html`<section class="field">
        <div class="label">${stance === 'behovs' ? 'Vad behövs?' : 'Vad är det, och vad kan det användas till?'}</div>
        <${ChipPicker} options=${spaceOptions.data || DEFAULT_FUNCTIONS} selected=${functions} onChange=${setFunctions} placeholder=${stance === 'behovs' ? 'T.ex. sladdvinda, släpvagn, lokal…' : 'T.ex. borrmaskin, kök, släpvagn…'} />
        ${stance !== 'behovs' && html`<div class="label">Vad kostar det?</div>
        ${Object.entries(SPACE_COSTS).map(([k, label]) => html`<label class="radio" key=${k}>
          <input type="radio" name="cost" checked=${cost === k} onChange=${() => setCost(k)} /><span>${label}</span></label>`)}
        ${cost === 'kostar' && html`<label>Pris<input value=${price} onInput=${(e) => setPrice(e.target.value)} placeholder="t.ex. 200 kr per dag" /></label>`}`}
        ${stance === 'behovs' && html`<small class="muted">Den som har något att låna ut svarar i kommentarerna.</small>`}
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

      <div class="settings-block-c">
        <div class="set-row">
          <div class="set-label set-label-row"><span>Relaterar till</span>${!noGroups && !isPersonal && html`<button type="button" class="link subtle" onClick=${() => setPersonal(true)}>Posta utan grupp</button>`}</div>
          <div class="set-body">
        ${noGroups ? html`<div class="nudge">
            <strong>Du är inte med i någon grupp än.</strong>
            <p>Inlägg ska helst höra till en grupp. Gå med i en grupp eller skapa en ny.</p>
            <div class="btnrow"><a class="btn small" href="#/sok?flik=grupper">Hitta grupper</a><a class="btn small primary" href="#/ny-grupp?next=/ny">Skapa grupp</a></div>
          </div>`
        : html`${!isPersonal && html`<${GroupPicker} groups=${myGroups} others=${placeGroups.data || []} value=${groupId} onChange=${(id) => { groupTouched.current = true; setGroupId(id); setPersonal(false); }} />`}
          ${!isPersonal && groupId && !s.memberOf.has(groupId) && (() => { const g = (placeGroups.data || []).find((x) => x.id === groupId); return html`<div class="nudge join-first">
            <span>Du är inte med i <b>${g?.name || 'gruppen'}</b>. Gå med för att kunna posta där.</span>
            <button type="button" class="btn small primary" disabled=${joining} onClick=${async () => {
              setJoining(true);
              if (await attempt(() => api.joinGroup(groupId), `Du är med i ${g?.name || 'gruppen'}`)) await refreshMe();
              setJoining(false);
            }}>Gå med</button></div>`; })()}
          ${isPersonal
            ? html`<p class="hint">Personligt inlägg – det hör inte till någon grupp. <button type="button" class="link" onClick=${() => { setPersonal(false); setGroupId(groupId || myGroups[0].id); }}>Välj en grupp i stället</button></p>`
            : null}
          ${!isPersonal && s.adminOf.has(groupId) && html`<label class="check as-group">
            <input type="checkbox" checked=${asGroup} onChange=${(e) => setAsGroup(e.target.checked)} />
            <span><b>Publicera som gruppen</b><small>Gruppens namn och bild visas som avsändare, med ”via ${s.me.name}” under. Bara gruppens admins kan välja det här.</small></span></label>`}`}
      ${isPersonal && html`<${HomePlaceFields} value=${where} onChange=${setWhere} groups=${placeGroups.data} legend="Var gäller inlägget?" chooseLevel=${false} />
        <small class="muted place-why">Inlägg utan grupp syns på den plats du anger här.</small>`}
          </div>
        </div>

        <div class="set-row">
          <div class="set-label">Relevant för</div>
          <div class="set-body">
            <div class="reach-pills" role="radiogroup" aria-label="Vilka är inlägget relevant för?">
              ${[...reachOptions].reverse().map(([lvl, label]) => html`<button type="button" role="radio" key=${lvl}
                aria-checked=${!limit && (reachNow || reachOptions[0][0]) === lvl} class=${!limit && (reachNow || reachOptions[0][0]) === lvl ? 'on' : ''}
                onClick=${() => { setLimit(false); setReach(lvl === reachOptions[0][0] ? null : lvl); }}>${label}</button>`)}
              ${(onlyGroups.length > 0 || !isPersonal) && html`<span class="reach-or">…eller bara</span><span class=${'reach-groups' + (limit ? ' on' : '')}>
                <button type="button" role="radio" aria-checked=${limit} class="rg-avatars" title="Bara gruppens medlemmar"
                  aria-label=${`Bara ${onlyGroups.map((g) => g.name).join(', ') || 'gruppen'}`} onClick=${() => { setLimit(true); if (!visibleTo.length && groupId) setVisibleTo([groupId]); }}>
                  ${onlyGroups.map((g) => html`<${Avatar} key=${g.id} src=${g.avatar_url} name=${g.name} size=${30} />`)}</button>
                <button type="button" class="rg-add" aria-label="Lägg till en grupp till" title="Lägg till en grupp till"
                  onClick=${() => { setLimit(true); if (!visibleTo.length && groupId) setVisibleTo([groupId]); setAddingGroup(true); }}>+</button>
              </span>`}
            </div>
            <small class="muted">${limit ? `Bara medlemmar i ${onlyGroups.map((g) => g.name).join(', ') || 'gruppen'} ser inlägget.` : reachHint}</small>
            ${limit && addingGroup && html`<${GroupsPicker} groups=${myGroups} others=${placeGroups.data || []} value=${visibleTo} onChange=${setVisibleTo} />`}
          </div>
        </div>

        ${(type === 'vanlig' || type === 'evenemang') && html`<div class="set-row">
          <div class="set-label">Taggar</div>
          <div class="set-body"><${TagInput} value=${tags} onChange=${setTags} /></div>
        </div>`}
      </div>

      ${err && html`<p class="error">${err}</p>`}
      <div class="publish-bar"><button class="btn primary block" disabled=${busy}>${busy ? 'Sparar…' : editing ? 'Spara ändringar' : 'Publicera'}</button></div>
    </form>
  </div>`;
}
