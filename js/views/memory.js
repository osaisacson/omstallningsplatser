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
const themesOf = (p) => (p.memory_themes?.length ? p.memory_themes : [NONE]);
const textOf = (p) => [p.caption, ...(p.categories || []), ...(p.space_functions || []), ...(p.slides || []).map((s) => s.text), p.group?.name, p.author?.name].join(' ').toLowerCase();

// Förslag till sökningen: ämnen, grupper och personer i inläggen som finns här (de vanligaste först).
function suggestions(posts) {
  const n = new Map();
  const add = (label, kind) => { if (!label) return; const k = label.toLowerCase(); const x = n.get(k) || { label, kind, n: 0 }; x.n++; n.set(k, x); };
  for (const p of posts) {
    for (const c of p.categories || []) add(c, 'Ämne');
    for (const f of p.space_functions || []) add(f, 'Användning');
    add(p.group?.name, 'Grupp');
    add(p.author?.name, 'Person');
  }
  return [...n.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'sv'));
}

// Sökfält där man kan skriva fritt eller välja ett förslag ur listan som öppnas.
function SearchSuggest({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const n = value.trim().toLowerCase();
  const hits = options.filter((o) => !n || o.label.toLowerCase().includes(n)).filter((o) => o.label.toLowerCase() !== n).slice(0, 10);
  return html`<div class="mem-search combo">
    <input type="search" value=${value} placeholder=${placeholder} aria-label=${placeholder} autocomplete="off"
      onFocus=${() => setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 150)} onInput=${(e) => { onChange(e.target.value); setOpen(true); }} />
    ${open && hits.length > 0 && html`<span class="combo-list" role="listbox">${hits.map((o) => html`<button type="button" role="option"
      onMouseDown=${(e) => e.preventDefault()} onClick=${() => { onChange(o.label); setOpen(false); }}>${o.label}<small class="muted"> · ${o.kind}</small></button>`)}</span>`}
  </div>`;
}

export function Memory({ theme }) {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const groups = useAsync(() => api.listGroups(), []);
  const posts = useAsync(() => api.listPosts(), []);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(null);   // kategorin som byter namn
  const [adding, setAdding] = useState(false);
  const themeList = useAsync(() => api.listMemoryThemes(), []);
  const saved = (posts.data || []).filter((p) => p.memory_count > 0 && inPlace(postPlace(p), place));
  const n = q.trim().toLowerCase();
  // Kategorierna i den ordning de står i listan; sist inlägg som sparats utan kategori.
  const about = Object.fromEntries(MEMORY_THEMES.map((t) => [t.name, t.about]));
  const names = themeList.data || MEMORY_THEMES.map((t) => t.name);
  const hasNone = saved.some((p) => !p.memory_themes?.length);
  const all = [...names.map((name) => ({ name, about: about[name] || '' })), ...(hasNone ? [{ name: NONE, about: 'Sparat innan man valde kategori' }] : [])];
  const count = (t) => saved.filter((p) => themesOf(p).includes(t)).length;
  const shown = saved.filter((p) => (!theme || themesOf(p).includes(theme)) && (!n || textOf(p).includes(n)))
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
      <button class="sheet-item" onClick=${() => { setMenu(false); setRenaming(theme); }}>Byt namn på kategorin</button>
      <p class="sheet-note">Vill du ändra ett inläggs kategorier: tryck på ··· på inlägget.</p>
    <//>`}
    ${adding && html`<${RenameTheme} from="" title="Ny kategori" onClose=${() => setAdding(false)}
      onDone=${() => { setAdding(false); themeList.reload(); }} />`}
    ${renaming && html`<${RenameTheme} from=${renaming} onClose=${() => setRenaming(null)}
      onDone=${(to) => { setRenaming(null); themeList.reload(); posts.reload(); if (theme) location.replace('#/minne/' + encodeURIComponent(to)); }} />`}
    ${theme ? html`<h1 class="mem-title">${theme}</h1>` : html`<p class="mem-intro">Lärdomar och goda exempel som är värda att hitta igen. Spara ett inlägg hit med <${Icon} name="memory" size=${13} /> och välj en kategori.</p>`}
    <${SearchSuggest} value=${q} onChange=${setQ} placeholder=${theme ? `Sök i ${theme.toLowerCase()}` : 'Sök i minnet'}
      options=${suggestions(theme ? saved.filter((p) => themesOf(p).includes(theme)) : saved)} />
    ${posts.loading && !posts.data ? html`<${Loading} />` : posts.error ? html`<${ErrorBox} error=${posts.error} />`
      : !feed ? html`<div class="themes">${all.map((t) => html`<a class="theme" href=${'#/minne/' + encodeURIComponent(t.name)} key=${t.name}>
          ${s.me.is_editor && t.name !== NONE && html`<button class="theme-dots" aria-label=${'Byt namn på ' + t.name} title="Byt namn"
            onClick=${(e) => { e.preventDefault(); e.stopPropagation(); setRenaming(t.name); }}><${Icon} name="dots" size=${18} /></button>`}
          <strong>${t.name}</strong>${t.about && html`<small>${t.about}</small>`}<span class="theme-n">${count(t.name) || 'Inget än'}</span></a>`)}
          ${s.me.is_editor && html`<button class="theme theme-add" onClick=${() => setAdding(true)}><strong>+ Ny kategori</strong><small>Bara Redaktionen</small></button>`}</div>`
      : shown.length ? html`<div class="feed">${shown.map((p) => html`<${PostCard} key=${p.id} post=${p} onChange=${posts.reload} />`)}</div>`
      : html`<p class="empty">Inget sparat ${theme ? `under ${theme.toLowerCase()} ` : ''}${n ? `som matchar ”${q.trim()}” ` : ''}i ${where} än.
          ${canZoomOut(place) && html`<br /><span class="small">Tryck på <b>‹</b> uppe till vänster för att söka i ${placeLabel(zoomOut(place))}.</span>`}</p>`}
  </div>`;
}

// Redaktionen byter namn på en kategori. Finns det redan en med det namnet slås de ihop.
// Utan "from" skapar den en ny kategori i stället.
function RenameTheme({ from, onClose, onDone, title = 'Byt namn på kategorin' }) {
  const [name, setName] = useState(from);
  async function save(e) {
    e.preventDefault();
    const to = name.trim().replace(/^./, (m) => m.toUpperCase());
    const ok = from ? await attempt(() => api.renameMemoryTheme(from, to), `Kategorin heter nu ${to}`)
      : await attempt(() => api.addMemoryTheme(to), `Kategorin ${to} är skapad`);
    if (ok) onDone(to);
  }
  return html`<${Modal} title=${title} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>${from ? 'Nytt namn' : 'Namn'}<input required maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} autofocus /></label>
      <small class="muted">${from ? 'Alla inlägg i kategorin följer med. Finns det redan en kategori med det namnet slås de ihop.' : 'Kategorin syns för alla när de sparar något i Minne.'}</small>
      <button class="btn primary block" disabled=${!name.trim() || name.trim() === from}>Spara</button>
    </form>
  <//>`;
}
