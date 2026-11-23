// Gruppsida, höjdpunkter, gruppinställningar, ny grupp och välkomststeget.
import { html, useState } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, go, attempt, refreshMe, toast } from '../store.js';
import { Icon, Avatar, Header, PostGrid, GroupRow, Modal, ImagePicker, Loading, ErrorBox, AddressPicker, ReportForm, MoreMenu, editorDelete } from '../ui.js';
import { prettyUrl, countryNames } from '../util.js';
import { AdminRequestForm } from './roles.js';
import { HomePlaceFields, checkHome, emptyHome } from './place.js';

// Land, region och stad för en grupp. Förslag hämtas från andra grupper.
function PlaceFields({ value, onChange }) {
  const groups = useAsync(() => api.listGroups(), []);
  const cities = [...new Set((groups.data || []).map((g) => g.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv'));
  // Adressen väljs ur en riktig adresslista. Staden föreslås därifrån men kan skrivas fritt –
  // t.ex. Göteborg även om adressen ligger i Mölndal eller på Hisingen.
  function pick(h) {
    onChange({ ...value, address: h.address, postcode: h.postcode ?? value.postcode ?? null, lat: h.lat, lng: h.lng,
      ...(h.city ? { city: value.cityTouched ? value.city : h.city } : {}),
      ...(h.region ? { region: h.region } : {}), ...(h.country ? { country: h.country } : {}) });
  }
  return html`<fieldset class="field place-fields">
    <legend class="label">Var finns gruppen?</legend>
    <label>Adress<${AddressPicker} value=${value} onPick=${pick} placeholder="t.ex. Järnmalmsgatan 4, Göteborg" /></label>
    <label>Stad<input list="dl-city" required value=${value.city} onInput=${(e) => onChange({ ...value, city: e.target.value, cityTouched: true })} placeholder="t.ex. Göteborg" />
      <datalist id="dl-city">${cities.map((c) => html`<option value=${c} />`)}</datalist></label>
    <small class="muted">Välj adressen ur listan så hamnar gruppen rätt på kartan. Staden är den ni räknar er till – välj en som redan finns eller skriv en ny.</small>
  </fieldset>`;
}
const placeText = (g) => (g.address ? (g.city && !g.address.toLowerCase().includes(g.city.toLowerCase()) ? `${g.address} · ${g.city}` : g.address) : [g.city, g.region].filter(Boolean).join(', '));

export function GroupView({ id }) {
  const s = useStore();
  const g = useAsync(() => api.getGroup(id), [id]);
  const posts = useAsync(() => api.listPosts({ groupId: id }), [id]);
  const [hl, setHl] = useState(null); // { highlight, edit }
  const [reporting, setReporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const mine = useAsync(() => api.myAdminRequests(), [id]);
  if (g.loading && !g.data) return html`<div class="page"><${Header} title="" back /><${Loading} /></div>`;
  if (g.error) return html`<div class="page"><${Header} title="" back /><${ErrorBox} error=${g.error} /></div>`;
  const grp = g.data;
  const member = s.memberOf.has(id);
  const hasAdmin = grp.members.some((m) => m.role === 'admin');
  // En grupp utan admin sköts av Redaktionen.
  const admin = s.adminOf.has(id) || (!hasAdmin && s.me.is_editor && !grp.locked);
  const list = posts.data || [];
  const cover = (h) => list.find((p) => p.id === h.post_ids[0] && p.slides[0])?.slides[0].image_url;
  const reload = () => { g.reload(); posts.reload(); };
  // Grupp utan admin (t.ex. hämtad från byggemenskaper.se): en ruta överst om var den kommer ifrån och hur man blir admin.
  const pending = (mine.data || []).some((r) => r.group_id === id && r.status === 'pending');

  async function join() {
    if (await attempt(() => api.joinGroup(id), `Välkommen till ${grp.name}!`)) {
      await refreshMe(); g.reload();
      if (!hasAdmin && !grp.locked) setAsking(true);   // gruppen saknar admin: fråga om man vill bli det
    }
  }

  return html`<div class="page">
    <${Header} title=${grp.name} back right=${html`<span class="profile-tools">
      ${admin && html`<a class="iconbtn" href=${`#/grupp/${id}/installningar`} aria-label="Gruppinställningar"><${Icon} name="gear" /></a>`}
      <${MoreMenu} items=${[
        !admin && !s.me.is_editor && ['Anmäl gruppen', () => setReporting(true)],
        // Redaktionen tar bort härifrån bara när den inte kommer åt gruppens inställningar (där finns Ta bort).
        s.me.is_editor && !admin && ['Ta bort gruppen', async () => { if (await editorDelete('group', id, `gruppen ${grp.name} och alla dess inlägg`)) { await refreshMe(); go('/'); } }, 'danger'],
      ]} /></span>`} />
    <div class="profile-head">
      <${Avatar} src=${grp.avatar_url} name=${grp.name} size=${84} />
      <div class="stats">
        <div><b>${list.length}</b><span>inlägg</span></div>
        <div><b>${grp.members.length}</b><span>medlemmar</span></div>
        <div><b>${grp.highlights.length}</b><span>höjdpunkter</span></div>
      </div>
    </div>
    <div class="profile-info"><strong>${grp.name}</strong>${placeText(grp) && html`<span class="group-place">${placeText(grp)}</span>`}${grp.description && html`<p>${grp.description}</p>`}
      ${grp.homepage && html`<a class="homepage" href=${grp.homepage} target="_blank" rel="noopener noreferrer">${prettyUrl(grp.homepage)}</a>`}</div>
    ${!hasAdmin && !grp.locked && html`<div class="nudge admin-nudge">
      <span>${grp.imported_from
          ? html`Hämtad från <a href=${'https://' + grp.imported_from} target="_blank" rel="noopener noreferrer">${grp.imported_from}</a> och har ingen admin än – Redaktionen tar hand om den så länge.`
          : html`<b>Gruppen har ingen admin</b> just nu – Redaktionen tar hand om den så länge.`}
        <small>${s.me.is_editor ? 'Du är med i Redaktionen och kan redan ändra gruppen via kugghjulet uppe till höger.' : pending ? 'Din förfrågan om att bli admin väntar på Redaktionen.' : grp.imported_from ? 'Är det er grupp? Bli admin och ta över den.' : 'Är du med i gruppen? Bli admin och ta hand om den.'}</small></span>
      ${!pending && !s.me.is_editor && html`<button class="btn small primary" onClick=${() => (member ? setAsking(true) : join())}>Bli admin</button>`}
    </div>`}
    ${member && html`<div class="profile-actions">
      <a class="btn primary" href=${'#/ny?grupp=' + id}>Nytt inlägg</a>
    </div>`}

    ${asking && html`<${AdminRequestForm} group=${grp} onClose=${() => setAsking(false)} onDone=${() => { setAsking(false); mine.reload(); }} />`}
    <div class="members-head">
      ${!member && !grp.locked && html`<button class="btn primary small" onClick=${join}>Gå med i gruppen</button>`}
      ${grp.locked && html`<span class="muted small">Låst grupp – medlemmarna är <a href="#/hjalp">Redaktionen</a></span>`}
      <span class="members-title">Medlemmar <span class="muted">(${grp.members.length})</span></span>
    </div>
    ${grp.members.length > 0 && html`<div class="row-scroll members-row">
      ${[...grp.members].sort((a, b) => (b.role === 'admin') - (a.role === 'admin')).map((m) => html`<a class="mini member" href=${'#/profil/' + m.user.id} key=${m.user.id}
        title=${m.role === 'admin' ? `${m.user.name} (admin)` : m.user.name}>
        <span class="member-av"><${Avatar} src=${m.user.avatar_url} name=${m.user.name} size=${40} />${m.role === 'admin' && html`<span class="admin-badge" aria-label="admin">★</span>`}</span>
        <span>${m.user.name.split(' ')[0]}</span></a>`)}
    </div>`}

    ${(member || grp.highlights.length > 0) && html`<div class="label pad-x">Höjdpunkter</div>
    <div class="row-scroll highlights">
      ${member && html`<button class="mini" onClick=${() => setHl({ highlight: { title: '', post_ids: [] }, edit: true })}>
        <span class="hl-cover new">+</span><span>Ny</span></button>`}
      ${grp.highlights.map((h) => html`<button class="mini" key=${h.id} onClick=${() => setHl({ highlight: h, edit: false })}>
        <span class="hl-cover">${cover(h) ? html`<img src=${cover(h)} alt="" loading="lazy" decoding="async" />` : h.title[0]}</span><span>${h.title}</span></button>`)}
    </div>`}

    <div class="grid-sep"></div>
    <${PostGrid} posts=${list} showAuthor empty="Gruppen har inga inlägg än." />

    ${reporting && html`<${ReportForm} kind="group" id=${id} name=${grp.name} onClose=${() => setReporting(false)} />`}

    ${hl && !hl.edit && html`<${Modal} title=${hl.highlight.title} onClose=${() => setHl(null)}>
      <${PostGrid} posts=${list.filter((p) => hl.highlight.post_ids.includes(p.id))} showAuthor empty="Inga inlägg i den här höjdpunkten än." />
      ${member && html`<button class="btn block" onClick=${() => setHl({ ...hl, edit: true })}>Redigera höjdpunkten</button>`}
    <//>`}
    ${hl && hl.edit && html`<${HighlightEditor} groupId=${id} highlight=${hl.highlight} posts=${list}
      onClose=${() => setHl(null)} onSaved=${() => { setHl(null); reload(); }} />`}
  </div>`;
}

function HighlightEditor({ groupId, highlight, posts, onClose, onSaved }) {
  const [title, setTitle] = useState(highlight.title);
  const [ids, setIds] = useState(highlight.post_ids);
  const toggle = (pid) => setIds((xs) => (xs.includes(pid) ? xs.filter((x) => x !== pid) : [...xs, pid]));
  async function save(e) {
    e.preventDefault();
    if (await attempt(() => api.saveHighlight(groupId, { id: highlight.id, title, post_ids: ids }), 'Höjdpunkten sparades')) onSaved();
  }
  async function del() {
    if (!confirm(`Ta bort höjdpunkten "${highlight.title}"? Inläggen finns kvar.`)) return;
    if (await attempt(() => api.deleteHighlight(highlight.id))) onSaved();
  }
  return html`<${Modal} title=${highlight.id ? 'Redigera höjdpunkt' : 'Ny höjdpunkt'} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Namn<input required value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="t.ex. Bygget, Recept, Bidrag" /></label>
      <div class="label small">Välj inlägg (${ids.length} valda)</div>
      ${posts.length === 0 ? html`<p class="muted">Gruppen har inga inlägg än.</p>` : html`<div class="grid pick">
        ${posts.map((p) => html`<button type="button" key=${p.id} class=${'tile' + (ids.includes(p.id) ? ' picked' : '')} onClick=${() => toggle(p.id)}>
          ${p.slides[0] ? html`<img src=${p.slides[0].image_url} alt="" loading="lazy" decoding="async" />` : html`<span class="tile-text">${p.caption}</span>`}
          ${ids.includes(p.id) && html`<span class="tick">${ids.indexOf(p.id) + 1}</span>`}</button>`)}</div>`}
      <button class="btn primary block">Spara</button>
      ${highlight.id && html`<button type="button" class="link danger center" onClick=${del}>Ta bort höjdpunkten</button>`}
    </form><//>`;
}

// Admins lägger till medlemmar: sök på namn och tryck Lägg till. Personen får en notis.
function AddMember({ groupId, members, onAdded }) {
  const [q, setQ] = useState('');
  const users = useAsync(() => (q.trim().length >= 2 ? api.listUsers(q) : Promise.resolve([])), [q]);
  const has = new Set(members.map((m) => m.user.id));
  const hits = (users.data || []).filter((u) => !has.has(u.id)).slice(0, 6);
  async function add(u) {
    if (await attempt(() => api.addMember(groupId, u.id), `${u.name} är nu med i gruppen`)) { setQ(''); onAdded(); }
  }
  return html`<div class="pad-x add-member">
    <input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Lägg till medlem – skriv ett namn" aria-label="Lägg till medlem" />
    ${q.trim().length >= 2 && html`<div class="list add-hits">
      ${hits.map((u) => html`<div class="row" key=${u.id}><${Avatar} src=${u.avatar_url} name=${u.name} size=${36} />
        <span class="row-main"><strong>${u.name}</strong></span><button class="btn small primary" onClick=${() => add(u)}>Lägg till</button></div>`)}
      ${users.data && !hits.length && html`<p class="muted small">Ingen som inte redan är med heter så.</p>`}
    </div>`}
  </div>`;
}

export function GroupSettings({ id }) {
  const s = useStore();
  const g = useAsync(() => api.getGroup(id), [id]);
  const [name, setName] = useState(null);
  const [desc, setDesc] = useState(null);
  const [homepage, setHomepage] = useState(null);
  const [where, setWhere] = useState(null);
  const [file, setFile] = useState(null);
  if (g.loading && !g.data) return html`<div class="page"><${Header} title="Inställningar" back /><${Loading} /></div>`;
  if (g.error) return html`<div class="page"><${Header} title="Inställningar" back /><${ErrorBox} error=${g.error} /></div>`;
  const grp = g.data;
  const redaktionen = s.me.is_editor && !grp.locked && !grp.members.some((m) => m.role === 'admin');   // grupp utan admin sköts av Redaktionen
  if (!s.adminOf.has(id) && !redaktionen) return html`<div class="page"><${Header} title="Inställningar" back /><p class="empty">Bara gruppens admins kan ändra inställningarna.</p></div>`;

  async function save(e) {
    e.preventDefault();
    if (await attempt(() => api.updateGroup(id, { name: name ?? grp.name, description: desc ?? grp.description, homepage: homepage ?? grp.homepage ?? '', ...(where || { country: grp.country || 'Sverige', region: grp.region || '', city: grp.city || '', address: grp.address || '', postcode: grp.postcode || null, lat: grp.lat ?? null, lng: grp.lng ?? null }), avatarFile: file }), 'Sparat')) {
      await refreshMe(); g.reload();
    }
  }
  async function act(fn, msg) { if (await attempt(fn, msg)) { await refreshMe(); g.reload(); } }

  return html`<div class="page">
    <${Header} title="Gruppinställningar" back />
    <form class="form pad" onSubmit=${save}>
      <${ImagePicker} current=${grp.avatar_url} name=${grp.name} onFile=${setFile} label="Byt gruppbild" />
      <label>Namn<input required value=${name ?? grp.name} onInput=${(e) => setName(e.target.value)} /></label>
      <label>Beskrivning<textarea rows="3" value=${desc ?? grp.description} onInput=${(e) => setDesc(e.target.value)}></textarea></label>
      <label>Hemsida <small>(valfri)</small><input inputmode="url" autocapitalize="off" value=${homepage ?? grp.homepage ?? ''} onInput=${(e) => setHomepage(e.target.value)} placeholder="https://…" /></label>
      <${PlaceFields} value=${where || { country: grp.country || 'Sverige', region: grp.region || '', city: grp.city || '', address: grp.address || '', postcode: grp.postcode || null, lat: grp.lat ?? null, lng: grp.lng ?? null }} onChange=${setWhere} />
      <button class="btn primary block">Spara</button>
    </form>

    <div class="label pad-x">Medlemmar och admins</div>
    ${!grp.locked && html`<${AddMember} groupId=${id} members=${grp.members} onAdded=${g.reload} />`}
    ${grp.locked ? html`<p class="hint pad">Gruppen är låst: medlemmarna är Redaktionen. Lägg till eller ta bort någon via personens profil (Lägg till i / Ta bort ur Redaktionen).</p>` : html`<div class="list">
      ${grp.members.map((m) => {
        const me = m.user.id === s.me.id;
        return html`<div class="row" key=${m.user.id}>
          <${Avatar} src=${m.user.avatar_url} name=${m.user.name} size=${40} />
          <span class="row-main"><strong>${m.user.name}${me ? ' (du)' : ''}</strong><small class="muted">${m.role === 'admin' ? 'Admin' : 'Medlem'}</small></span>
          <span class="btnrow">
            ${m.role === 'admin'
              ? html`<button class="btn small" onClick=${() => act(() => api.setMemberRole(id, m.user.id, 'member'), `${m.user.name} är inte längre admin`)}>Ta bort som admin</button>`
              : html`<button class="btn small primary" onClick=${() => act(() => api.setMemberRole(id, m.user.id, 'admin'), `${m.user.name} är nu admin`)}>Gör till admin</button>`}
            ${!me && html`<button class="btn small danger" onClick=${() => confirm(`Ta bort ${m.user.name} ur gruppen?`) && act(() => api.removeMember(id, m.user.id), 'Borttagen ur gruppen')}>Ta bort</button>`}
          </span></div>`;
      })}
    </div>`}
    <div class="pad danger-zone">
      <button class="btn danger block" onClick=${async () => {
        if (!confirm(`Ta bort ${grp.name}? Gruppens alla inlägg, kommentarer och höjdpunkter tas också bort. Det går inte att ångra.`)) return;
        if (await attempt(() => api.deleteGroup(id), 'Gruppen togs bort')) { await refreshMe(); go('/'); }
      }}>Ta bort gruppen</button>
    </div>
    <p class="hint pad">Den som skapar en grupp blir admin. Admins kan ändra namn, beskrivning och bild, lägga till och ta bort medlemmar, utse fler admins och publicera inlägg som gruppen. Alla medlemmar kan skapa och redigera gruppens höjdpunkter.
      Om sista admin lämnar blir den som varit med längst admin. Om ingen admin varit inloggad på ett år mejlas admins, och efter 30 dagar tar den medlem som varit med längst över.</p>
  </div>`;
}

export function NewGroup({ next }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [homepage, setHomepage] = useState('');
  const [where, setWhere] = useState({ country: 'Sverige', region: '', city: '', address: '', postcode: null, lat: null, lng: null });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const g = await attempt(() => api.createGroup({ name, description: desc, homepage, ...where, avatarFile: file }), 'Gruppen är skapad – du är admin');
    setBusy(false);
    if (g) { await refreshMe(); go(next ? (next === '/ny' ? '/ny?grupp=' + g.id : next) : '/grupp/' + g.id); }
  }
  return html`<div class="page">
    <${Header} title="Ny grupp" back />
    <form class="form pad" onSubmit=${submit}>
      <${ImagePicker} name=${name} onFile=${setFile} label="Välj gruppbild" />
      <label>Namn<input required value=${name} onInput=${(e) => setName(e.target.value)} placeholder="t.ex. Gråvattengruppen Gottsunda" /></label>
      <label>Beskrivning<textarea rows="3" value=${desc} onInput=${(e) => setDesc(e.target.value)} placeholder="Vad gör ni? Vilka är ni?"></textarea></label>
      <label>Hemsida <small>(valfri)</small><input inputmode="url" autocapitalize="off" value=${homepage} onInput=${(e) => setHomepage(e.target.value)} placeholder="https://…" /></label>
      <${PlaceFields} value=${where} onChange=${setWhere} />
      <p class="hint">Du blir gruppens admin och kan lägga till fler admins under gruppinställningar. Alla kan gå med i gruppen.</p>
      <button class="btn primary block" disabled=${busy}>${busy ? 'Skapar…' : 'Skapa grupp'}</button>
    </form>
  </div>`;
}

// Första steget för den som saknar plats (t.ex. konton skapade med Google): var håller du till?
function HomeStep({ groups }) {
  const [home, setHome] = useState(emptyHome);
  async function save(e) {
    e.preventDefault();
    const bad = checkHome(home);
    if (bad) return toast(bad);
    if (await attempt(() => api.updateProfile({ home }), 'Platsen sparades')) await refreshMe();
  }
  return html`<form class="form pad card welcome-place" onSubmit=${save}>
    <${HomePlaceFields} value=${home} onChange=${setHome} groups=${groups} />
    <button class="btn primary block">Spara plats</button>
  </form>`;
}

export function Welcome() {
  const s = useStore();
  const groups = useAsync(() => api.listGroups(), []);
  const skip = () => { try { localStorage.setItem('valkommen-skippad', '1'); } catch { /* ok */ } go('/'); };
  return html`<div class="page">
    <div class="pad welcome">
      <h1>Välkommen, ${s.me.name.split(' ')[0]}!</h1>
      ${!s.me.home && html`<${HomeStep} groups=${groups.data} />`}
      <p>Gå med i de grupper du är med i, eller skapa en ny. Det går att ändra senare.</p>
      <a class="btn block" href="#/ny-grupp?next=/valkommen">+ Skapa en ny grupp</a>
    </div>
    <div class="list">
      ${!s.memberOf.size && html`<button class="row skip-row" onClick=${skip}><span class="avatar plus">→</span>
        <span class="row-main"><strong>Skippa för nu</strong><small class="muted">Gå med i grupper senare via + på din profil</small></span></button>`}
      ${groups.loading && !groups.data ? html`<${Loading} />` : (groups.data || []).filter((g) => !g.locked).map((g) => html`<${GroupRow} key=${g.id} group=${g} onChange=${groups.reload} />`)}
    </div>
    ${s.memberOf.size > 0 && html`<div class="pad"><button class="btn block primary" onClick=${skip}>Klar – till flödet</button></div>`}
  </div>`;
}
