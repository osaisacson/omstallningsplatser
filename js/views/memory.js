// Minne: det långsiktiga biblioteket. Det man sparar med bokmärket hamnar här, i den kategori man valde.
// Först kategorierna, och trycker man på en ser man dess flöde med en sökruta överst.
// Platsväljaren uppe till vänster gäller här som i resten av appen.
import { html, useState } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, goBack } from '../store.js';
import { Icon, PostCard, Loading, ErrorBox } from '../ui.js';
import { inPlace, postPlace, placeLabel, zoomOut, MEMORY_THEMES } from '../util.js';
import { PlaceSwitcher } from './place.js';

const NONE = 'Utan kategori';
const themesOf = (p) => (p.memory_themes || []).map((t) => t || NONE);
const textOf = (p) => [p.caption, ...(p.categories || []), ...(p.slides || []).map((s) => s.text), p.group?.name, p.author?.name].join(' ').toLowerCase();

export function Memory({ theme }) {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const groups = useAsync(() => api.listGroups(), []);
  const posts = useAsync(() => api.listPosts(), []);
  const [q, setQ] = useState('');
  const saved = (posts.data || []).filter((p) => p.memory_count > 0 && inPlace(postPlace(p), place));
  const n = q.trim().toLowerCase();
  // Kategorierna: de från början, sedan de som skapats, sist inlägg som sparats utan kategori.
  const used = [...new Set(saved.flatMap(themesOf))];
  const base = MEMORY_THEMES.map((t) => t.name);
  const custom = used.filter((t) => t !== NONE && !base.includes(t)).sort((a, b) => a.localeCompare(b, 'sv'));
  const all = [...MEMORY_THEMES, ...custom.map((name) => ({ name, about: '' })), ...(used.includes(NONE) ? [{ name: NONE, about: 'Sparat innan man valde kategori' }] : [])];
  const count = (t) => saved.filter((p) => themesOf(p).includes(t)).length;
  const shown = saved.filter((p) => (!theme || themesOf(p).includes(theme)) && (!n || textOf(p).includes(n)))
    .sort((a, b) => b.memory_count - a.memory_count || b.created_at.localeCompare(a.created_at));
  const where = placeLabel(place);
  const feed = theme || n;
  return html`<div class="page memory-page">
    <header class="topbar brand">
      ${theme && html`<button class="iconbtn" aria-label="Tillbaka till kategorierna" onClick=${() => goBack('/minne')}><${Icon} name="back" /></button>`}
      <${PlaceSwitcher} groups=${groups.data || []} />
    </header>
    ${theme ? html`<h1 class="mem-title">${theme}</h1>` : html`<p class="mem-intro">Lärdomar och goda exempel som är värda att hitta igen. Spara ett inlägg hit med <${Icon} name="memory" size=${13} /> och välj en kategori.</p>`}
    <div class="mem-search"><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${theme ? `Sök i ${theme.toLowerCase()}` : 'Sök i minnet'} aria-label="Sök i minnet" /></div>
    ${posts.loading && !posts.data ? html`<${Loading} />` : posts.error ? html`<${ErrorBox} error=${posts.error} />`
      : !feed ? html`<div class="themes">${all.map((t) => html`<a class="theme" href=${'#/minne/' + encodeURIComponent(t.name)} key=${t.name}>
          <strong>${t.name}</strong>${t.about && html`<small>${t.about}</small>`}<span class="theme-n">${count(t.name) || 'Inget än'}</span></a>`)}</div>`
      : shown.length ? html`<div class="feed">${shown.map((p) => html`<${PostCard} key=${p.id} post=${p} onChange=${posts.reload} />`)}</div>`
      : html`<p class="empty">Inget sparat ${theme ? `under ${theme.toLowerCase()} ` : ''}${n ? `som matchar ”${q.trim()}” ` : ''}i ${where} än.
          ${place.level !== 'world' && html`<br /><span class="small">Tryck på <b>‹</b> uppe till vänster för att söka i ${placeLabel(zoomOut(place))}.</span>`}</p>`}
  </div>`;
}
