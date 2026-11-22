// Minne: det långsiktiga biblioteket. Det man sparar med bokmärket hamnar här, i den kategori man valde.
// Först kategorierna, och trycker man på en ser man dess flöde med en sökruta överst.
// Platsväljaren uppe till vänster gäller här som i resten av appen.
import { html, useState } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, goBack, attempt } from '../store.js';
import { Icon, PostCard, Loading, ErrorBox, Sheet, Modal } from '../ui.js';
import { inPlace, postPlace, placeLabel, zoomOut, MEMORY_THEMES, canZoomOut } from '../util.js';
import { PlaceSwitcher } from './place.js';

const NONE = 'Utan kategori';
const themeOf = (p) => p.memory_theme || NONE;
const textOf = (p) => [p.caption, ...(p.categories || []), ...(p.slides || []).map((s) => s.text), p.group?.name, p.author?.name].join(' ').toLowerCase();

export function Memory({ theme }) {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const groups = useAsync(() => api.listGroups(), []);
  const posts = useAsync(() => api.listPosts(), []);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const themeList = useAsync(() => api.listMemoryThemes(), []);
  const saved = (posts.data || []).filter((p) => p.memory_count > 0 && inPlace(postPlace(p), place));
  const n = q.trim().toLowerCase();
  // Kategorierna i den ordning de står i listan; sist inlägg som sparats utan kategori.
  const about = Object.fromEntries(MEMORY_THEMES.map((t) => [t.name, t.about]));
  const names = themeList.data || MEMORY_THEMES.map((t) => t.name);
  const hasNone = saved.some((p) => !p.memory_theme);
  const all = [...names.map((name) => ({ name, about: about[name] || '' })), ...(hasNone ? [{ name: NONE, about: 'Sparat innan man valde kategori' }] : [])];
  const count = (t) => saved.filter((p) => themeOf(p) === t).length;
  const shown = saved.filter((p) => (!theme || themeOf(p) === theme) && (!n || textOf(p).includes(n)))
    .sort((a, b) => b.memory_count - a.memory_count || b.created_at.localeCompare(a.created_at));
  const where = placeLabel(place);
  const feed = theme || n;
  return html`<div class="page memory-page">
    <header class="topbar brand">
      ${theme && html`<button class="iconbtn" aria-label="Tillbaka till kategorierna" onClick=${() => goBack('/minne')}><${Icon} name="back" /></button>`}
      <${PlaceSwitcher} groups=${groups.data || []} />
      ${theme && theme !== NONE && s.me.is_editor && html`<button class="iconbtn mem-menu" aria-label="Fler val för kategorin" onClick=${() => setMenu(true)}><${Icon} name="dots" /></button>`}
    </header>
    ${menu && html`<${Sheet} onClose=${() => setMenu(false)}>
      <button class="sheet-item" onClick=${() => { setMenu(false); setRenaming(true); }}>Byt namn på kategorin</button>
      <p class="sheet-note">Vill du flytta ett inlägg till en annan kategori: tryck på ··· på inlägget.</p>
    <//>`}
    ${renaming && html`<${RenameTheme} from=${theme} onClose=${() => setRenaming(false)}
      onDone=${(to) => { setRenaming(false); themeList.reload(); posts.reload(); location.replace('#/minne/' + encodeURIComponent(to)); }} />`}
    ${theme ? html`<h1 class="mem-title">${theme}</h1>` : html`<p class="mem-intro">Lärdomar och goda exempel som är värda att hitta igen. Spara ett inlägg hit med <${Icon} name="memory" size=${13} /> och välj en kategori.</p>`}
    <div class="mem-search"><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${theme ? `Sök i ${theme.toLowerCase()}` : 'Sök i minnet'} aria-label="Sök i minnet" /></div>
    ${posts.loading && !posts.data ? html`<${Loading} />` : posts.error ? html`<${ErrorBox} error=${posts.error} />`
      : !feed ? html`<div class="themes">${all.map((t) => html`<a class="theme" href=${'#/minne/' + encodeURIComponent(t.name)} key=${t.name}>
          <strong>${t.name}</strong>${t.about && html`<small>${t.about}</small>`}<span class="theme-n">${count(t.name) || 'Inget än'}</span></a>`)}</div>`
      : shown.length ? html`<div class="feed">${shown.map((p) => html`<${PostCard} key=${p.id} post=${p} onChange=${posts.reload} />`)}</div>`
      : html`<p class="empty">Inget sparat ${theme ? `under ${theme.toLowerCase()} ` : ''}${n ? `som matchar ”${q.trim()}” ` : ''}i ${where} än.
          ${canZoomOut(place) && html`<br /><span class="small">Tryck på <b>‹</b> uppe till vänster för att söka i ${placeLabel(zoomOut(place))}.</span>`}</p>`}
  </div>`;
}

// Redaktionen byter namn på en kategori. Finns det redan en med det namnet slås de ihop.
function RenameTheme({ from, onClose, onDone }) {
  const [name, setName] = useState(from);
  async function save(e) {
    e.preventDefault();
    const to = name.trim();
    if (await attempt(() => api.renameMemoryTheme(from, to), `Kategorin heter nu ${to}`)) onDone(to);
  }
  return html`<${Modal} title="Byt namn på kategorin" onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Nytt namn<input required maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} autofocus /></label>
      <small class="muted">Alla inlägg i kategorin följer med. Finns det redan en kategori med det namnet slås de ihop.</small>
      <button class="btn primary block" disabled=${!name.trim() || name.trim() === from}>Spara</button>
    </form>
  <//>`;
}
