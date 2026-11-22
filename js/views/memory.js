// Minne: det långsiktiga biblioteket. Inlägg som någon sparat (bokmärket på inlägget) samlas här,
// ordnade efter teman ur beskrivningen av plattformen: att bygga, bo, äta, producera, hantera energi
// och avfall, skapa rättvisa och relationer – annorlunda. Man kan söka, välja tema och begränsa till sin plats.
import { html, useState } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync } from '../store.js';
import { Icon, Header, Loading, ErrorBox } from '../ui.js';
import { inPlace, postPlace, placeLabel, timeAgo } from '../util.js';

// Teman och ord som hör till dem (matchas mot inläggets ämnen och text).
export const THEMES = [
  { key: 'bygga', name: 'Bygga & bo', about: 'Byggemenskaper, kollektivhus, material och renovering', words: ['bygg', 'boende', 'bostad', 'bogemenskap', 'hus', 'bostad', 'lera', 'halm', 'trä', 'kollektiv', 'renover', 'material', 'tiny'] },
  { key: 'mat', name: 'Mat & odling', about: 'Odling, andelsjordbruk, frön och mat tillsammans', words: ['mat', 'odl', 'frö', 'skörd', 'jordbruk', 'andelsodl', 'kök', 'potatis', 'växthus', 'biodl'] },
  { key: 'energi', name: 'Energi', about: 'Solel, värme och energigemenskaper', words: ['energi', 'sol', 'elnät', 'elbil', 'elektr', 'värme', 'vind', 'batteri', 'kwh'] },
  { key: 'kretslopp', name: 'Vatten & avfall', about: 'Gråvatten, kompost och kretslopp', words: ['vatten', 'avlopp', 'gråvatten', 'avfall', 'kompost', 'bokashi', 'återvinn', 'kretslopp', 'urin'] },
  { key: 'produktion', name: 'Produktion & reparation', about: 'Verkstäder, lagning och lokal tillverkning', words: ['repar', 'laga', 'verkstad', 'maker', 'tillverk', 'cykel', 'slöjd', 'produktion', 'verktyg'] },
  { key: 'ekonomi', name: 'Ekonomi & delning', about: 'Finansiering, delningsekonomi och kooperativ', words: ['ekonomi', 'pengar', 'finans', 'dela', 'delning', 'byt', 'lån', 'kooperativ', 'fond'] },
  { key: 'rattvisa', name: 'Rättvisa & organisering', about: 'Föreningar, beslut, inkludering och påverkan', words: ['rättvis', 'organis', 'förening', 'demokrati', 'styrelse', 'beslut', 'inkluder', 'påverk', 'stadga'] },
  { key: 'relationer', name: 'Relationer & gemenskap', about: 'Grannskap, möten och att ta hand om varandra', words: ['gemenskap', 'relation', 'grann', 'fest', 'barn', 'äldre', 'ensam', 'träff', 'möte'] },
];
const textOf = (p) => [p.caption, ...(p.categories || []), ...(p.slides || []).map((s) => s.text), p.group?.name].join(' ').toLowerCase();
// Ett ord räknas om det står i början av ett ord i texten ("sol" träffar "solceller" men inte "parasoll").
const hit = (text, w) => new RegExp(`(^|[^\\p{L}])${w}`, 'u').test(text);
export const themesOf = (p) => { const t = textOf(p); return THEMES.filter((th) => th.words.some((w) => hit(t, w))).map((th) => th.key); };

function MemoryRow({ p }) {
  const img = p.slides?.find((s) => s.image_url)?.image_url;
  const title = (p.caption || p.slides?.[0]?.text || '').split(/\n|(?<=[.!?])\s/)[0].slice(0, 90);
  return html`<a class="mem-row" href=${'#/post/' + p.id}>
    ${img ? html`<img src=${img} alt="" loading="lazy" decoding="async" />` : html`<span class="mem-text">${(p.caption || '').slice(0, 40)}</span>`}
    <span class="mem-main"><strong>${title || 'Inlägg'}</strong>
      <small class="muted">${p.group?.name || p.author?.name} · ${timeAgo(p.created_at)}</small>
      <small class="mem-saved"><${Icon} name="memory" size=${12} /> Sparat av ${p.memory_count}</small></span>
  </a>`;
}

export function Memory() {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const posts = useAsync(() => api.listPosts(), []);
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState(null);
  const [local, setLocal] = useState(false);
  const saved = (posts.data || []).filter((p) => p.memory_count > 0 && (!local || inPlace(postPlace(p), place)));
  const n = q.trim().toLowerCase();
  const shown = saved.filter((p) => (!theme || (theme === 'ovrigt' ? !themesOf(p).length : themesOf(p).includes(theme))) && (!n || textOf(p).includes(n)))
    .sort((a, b) => b.memory_count - a.memory_count || b.created_at.localeCompare(a.created_at));
  const count = (k) => saved.filter((p) => (k === 'ovrigt' ? !themesOf(p).length : themesOf(p).includes(k))).length;
  const current = THEMES.find((t) => t.key === theme);
  const browsing = !theme && !n;
  return html`<div class="page memory-page">
    <${Header} title="Minne" />
    <p class="mem-intro">Lärdomar och goda exempel som är värda att hitta igen – om att bygga, bo, äta, producera, hantera energi och avfall, skapa rättvisa och relationer annorlunda.
      Spara ett inlägg hit med <${Icon} name="memory" size=${13} /> längst ner på inlägget.</p>
    <div class="mem-search"><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Sök i minnet, t.ex. bokashi eller solceller" aria-label="Sök i minnet" /></div>
    <div class="chips pad-x mem-scope">
      <button class=${'chip' + (!local ? ' on' : '')} onClick=${() => setLocal(false)}>Från hela världen</button>
      ${place.level !== 'world' && html`<button class=${'chip' + (local ? ' on' : '')} onClick=${() => setLocal(true)}>Bara i ${placeLabel(place)}</button>`}
      ${current && html`<button class="chip on" onClick=${() => setTheme(null)}>${current.name} ×</button>`}
      ${theme === 'ovrigt' && html`<button class="chip on" onClick=${() => setTheme(null)}>Övrigt ×</button>`}
    </div>
    ${posts.loading && !posts.data ? html`<${Loading} />` : posts.error ? html`<${ErrorBox} error=${posts.error} />`
      : browsing ? html`
        <div class="themes">${THEMES.map((t) => html`<button class="theme" onClick=${() => setTheme(t.key)} key=${t.key}>
          <strong>${t.name}</strong><small>${t.about}</small><span class="theme-n">${count(t.key) || 'Inget än'}</span></button>`)}
          ${count('ovrigt') > 0 && html`<button class="theme" onClick=${() => setTheme('ovrigt')}><strong>Övrigt</strong><small>Sådant som inte passar något tema</small><span class="theme-n">${count('ovrigt')}</span></button>`}
        </div>
        ${shown.length > 0 && html`<h2 class="label pad-x mem-head">Mest sparat</h2><div class="mem-list">${shown.slice(0, 10).map((p) => html`<${MemoryRow} p=${p} key=${p.id} />`)}</div>`}`
      : shown.length ? html`<div class="mem-list">${shown.map((p) => html`<${MemoryRow} p=${p} key=${p.id} />`)}</div>`
      : html`<p class="empty">Inget sparat ${current ? `om ${current.name.toLowerCase()} ` : ''}${n ? `som matchar ”${q.trim()}” ` : ''}än${local ? ` i ${placeLabel(place)}` : ''}.</p>`}
  </div>`;
}
