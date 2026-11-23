// Plats: väljaren överst (‹ Göteborg ›) och fälten där man anger var man håller till.
// Att kunna se det som händer i en stadsdel, en stad, en region, ett land eller hela världen är kärnan i appen.
import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, setPlace, onRefresh } from '../store.js';
import { Sheet } from '../ui.js';
import { getOnlyCountry, learnCityRegions, LEVELS, SE_REGIONS, placeLabel, regionName, regionSortKey, zoomOut, zoomIn, hasLevel, placeFromHome, pcKey, fmtPostcode, lookupPostcode, findDistrict, countryNames } from '../util.js';

const lc = (x) => (x || '').toLowerCase();
const LEVEL_TITLE = { country: 'land', region: 'region', city: 'stad', district: 'stadsdel' };

// Alla platser där det finns något, per nivå: grupper, evenemang med egen plats och ens egen plats
// (som syns i listan även om inget finns där än). Samma regler som inPlace().
export function placeOptions(groups, extras = []) {
  const maps = { country: new Map(), region: new Map(), city: new Map(), district: new Map() };
  const add = (level, key, o, field) => {
    const m = maps[level]; const x = m.get(key) || { ...o, level, n: 0, ev: 0, home: false };
    if (field === 'home') x.home = true; else x[field]++;
    m.set(key, x);
  };
  const addAll = (g0, field) => {
    // Saknar en plats land men har region eller stad hör den till landet (finns bara ett).
    const g = !g0.country && (g0.region || g0.city) && getOnlyCountry() ? { ...g0, country: getOnlyCountry() } : g0;
    const c = lc(g.country);
    if (g.country) add('country', c, { country: g.country }, field);
    if (g.region) add('region', `${c}|${lc(g.region)}`, { region: g.region, country: g.country }, field);
    if (g.city) add('city', `${c}|${lc(g.city)}`, { city: g.city, region: g.region, country: g.country }, field);
    if (pcKey(g.postcode)) add('district', `${c}|${pcKey(g.postcode)}`, { postcode: fmtPostcode(g.postcode), city: g.city, region: g.region, country: g.country, district: g.district || null }, field);
  };
  for (const g of groups) addAll(g, 'n');
  for (const x of extras) addAll(x, x.kind === 'home' ? 'home' : 'ev');   // ev = annat innehåll än grupper
  const name = (o) => (o.level === 'district' ? o.postcode : o[o.level]);
  const sort = (m) => [...m.values()].sort((a, b) => b.home - a.home || b.n - a.n || b.ev - a.ev || name(a).localeCompare(name(b), 'sv'));
  return { country: sort(maps.country), region: sort(maps.region), city: sort(maps.city), district: sort(maps.district) };
}

// Alla platser där det finns något i appen (grupper, evenemang, personer), från databasen.
// Hämtas en gång och sedan igen när man drar ner för att uppdatera. Ens egen plats märks "Din plats".
let contentPlaces = null;
export function usePlaceExtras() {
  const s = useStore();
  const [rows, setRows] = useState(contentPlaces?.value || []);
  useEffect(() => {
    const load = () => (contentPlaces = { promise: api.listContentPlaces().catch(() => []) });
    if (!contentPlaces) load();
    let alive = true;
    const use = () => contentPlaces.promise.then((v) => { contentPlaces.value = v; learnCityRegions(v); if (alive) setRows(v); });
    use();
    const off = onRefresh(() => { load(); return use(); });
    return () => { alive = false; off(); };
  }, []);
  const home = s.me?.home?.country ? [{ kind: 'home', ...s.me.home }] : [];
  return [...home, ...rows.map((x) => ({ kind: 'content', ...x }))];
}

// Namnen på stadsdelarna hämtas i bakgrunden, ett postnummer i taget. Hittas inget visas bara numret.
function useDistrictNames(list) {
  const [names, setNames] = useState({});
  const key = list.map((o) => pcKey(o.postcode)).join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const o of list.slice(0, 30)) {
        const hit = await lookupPostcode(o.postcode, o.city || '');
        if (!alive) return;
        if (hit?.district) setNames((n) => ({ ...n, [pcKey(o.postcode)]: hit.district }));
      }
    })();
    return () => { alive = false; };
  }, [key]);
  return names;
}

// Platsen överst: ‹ Göteborg ›. ‹ zoomar ut ett steg. Trycker man på namnet öppnas en rullgardin med
// alternativen på samma nivå (andra städer osv.) – skriv för att söka eller välj direkt.
// › går ett steg inåt – från hela världen till ens egen plats (eller Majorna i Göteborg).
const DEFAULT_PLACE = { level: 'district', country: 'Sverige', region: 'Västra Götalands län', city: 'Göteborg', district: 'Majorna', postcode: null, postcodes: [] };
const crumbName = (place, l) => (l === 'region' ? regionName(place.region) : l === 'district' ? place.district || fmtPostcode(place.postcode) : place[l]);

// Hela namnet ska alltid synas: långa namn radbryts (högst två rader) och texten krymper tills den får plats.
function useFitText(text) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = 16;
      el.style.fontSize = size + 'px';
      while (size > 11 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) el.style.fontSize = --size + 'px';
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [text]);
  return ref;
}

export function PlaceSwitcher({ groups }) {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const [open, setOpen] = useState(null);   // nivån vars rullgardin är öppen
  const extras = usePlaceExtras();
  const nameRef = useFitText(placeLabel(place));
  const depth = LEVELS.indexOf(place.level);
  const next = LEVELS[depth + 1];
  // En stadsdel som bara har postnummer får sitt namn (t.ex. 752 25 → Luthagen) när det går att slå upp.
  useEffect(() => {
    if (place.level !== 'district' || place.district || !place.postcode) return;
    let alive = true;
    lookupPostcode(place.postcode, place.city || '').then((h) => { if (alive && h?.district) setPlace({ ...place, district: h.district }); });
    return () => { alive = false; };
  }, [place.level, place.postcode, place.district]);
  async function forward() {
    if (place.level === 'world') {
      const home = s.me?.home?.country ? placeFromHome(s.me.home) : null;
      if (home && home.level !== 'world') return setPlace(home);
      setPlace(DEFAULT_PLACE);
      // Majornas postnummer slås upp, så att det som hör dit syns.
      const hit = await findDistrict('Majorna', 'Göteborg');
      if (hit?.postcode) setPlace({ ...DEFAULT_PLACE, postcode: hit.postcode, postcodes: [hit.postcode] });
      return;
    }
    const inner = zoomIn(place);
    if (inner) setPlace(inner); else setOpen(next);
  }
  // Finns bara ett land börjar allt där: ingen "Hela världen", och trycker man på landet väljer man region.
  const only = s.onlyCountry;
  let out = place.level === 'world' ? null : zoomOut(place);
  if (only && out?.level === 'world') out = null;
  const pickLevel = place.level === 'world' ? 'country' : place.level;
  // Finns bara ett land går det inte att byta land: namnet syns men gör inget.
  const locked = only && pickLevel === 'country';
  return html`<div class="placebar">
      <button class="zoom" disabled=${!out} onClick=${() => setPlace(out)}
        aria-label=${out ? `Zooma ut till ${placeLabel(out)}` : 'Zooma ut'} title=${out ? placeLabel(out) : ''}>‹</button>
      <button class=${'place-btn' + (open ? ' open' : '') + (locked ? ' locked' : '')} onClick=${() => !locked && setOpen(open ? null : pickLevel)}
        aria-disabled=${locked} aria-label=${locked ? `Visar ${placeLabel(place)}` : `Visar ${placeLabel(place)}. Tryck för att byta`}>
        <span class="place-name" ref=${nameRef}>${placeLabel(place)}${!locked && html`<span class="chev" aria-hidden="true">▾</span>`}</span>
      </button>
      ${next && html`<button class="zoom" onClick=${forward} aria-label=${place.level === 'world' ? 'Gå till din plats' : `Välj ${LEVEL_TITLE[next]}`}
        title=${place.level === 'world' ? 'Gå till din plats' : `Välj ${LEVEL_TITLE[next]}`}>›</button>`}
    </div>
    ${open && html`<${PlaceDropdown} level=${open} place=${place} groups=${groups} extras=${extras} countries=${s.countries} onClose=${() => setOpen(null)} />`}`;
}

const PARENT = { country: null, region: 'country', city: 'region', district: 'city' };
const SEARCH_WORD = { country: 'land', region: 'region', city: 'stad', district: 'stadsdel eller postnummer' };   // det man skriver filtrerar listan

// Rullgardinen för en nivå: först det som ligger i nivån ovanför (t.ex. städerna i Västra Götaland),
// sedan resten i bokstavsordning, hopfällt per region/stad. Skriver man söks allt.
function PlaceDropdown({ level, place, groups, extras, countries = [], onClose }) {
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const parentKey = PARENT[level];
  // Bara det som faktiskt finns i appen: grupper, evenemang och ens egen plats (och länderna från databasen).
  let opts = placeOptions(groups, extras)[level];
  if (level === 'country') {
    const have = new Set(opts.map((o) => lc(o.country)));
    opts = [...opts, ...countries.filter((c) => !have.has(lc(c))).map((c) => ({ level: 'country', country: c }))];
  }
  const names = useDistrictNames(level === 'district' ? opts.filter((o) => lc(o.city) === lc(place.city)).concat(opts).slice(0, 30) : []);
  const label = (o) => (level === 'district' ? names[pcKey(o.postcode)] || o.district || fmtPostcode(o.postcode) : level === 'region' ? regionName(o.region) : o[level]);
  const groupOf = (o) => (parentKey === 'region' ? regionName(o.region) : o[parentKey]) || 'Övrigt';
  const sortName = (a, b) => regionSortKey(label(a)).localeCompare(regionSortKey(label(b)), 'sv');
  const near = parentKey && place[parentKey] ? opts.filter((o) => lc(o[parentKey]) === lc(place[parentKey])
    && (level !== 'city' || lc(o.country) === lc(place.country))).sort(sortName) : [];
  const nearSet = new Set(near);
  // "Resten": inom samma land (för stad och stadsdel), annars allt.
  const rest = opts.filter((o) => !nearSet.has(o) && (level === 'country' || level === 'region' || !place.country || lc(o.country) === lc(place.country)));
  const needle = lc(q.trim());
  const digits = q.replace(/\D/g, '');
  const hits = needle ? opts.filter((o) => lc(label(o)).includes(needle) || (level === 'district' && digits.length >= 3 && pcKey(o.postcode).startsWith(digits)))
    .sort((a, b) => lc(label(b)).startsWith(needle) - lc(label(a)).startsWith(needle) || sortName(a, b)).slice(0, 40) : null;
  const exact = (hits || []).some((o) => lc(label(o)) === needle);
  const isOn = (o) => (level === 'district' ? pcKey(o.postcode) === pcKey(place.postcode) || (o.district && lc(o.district) === lc(place.district)) : lc(o[level]) === lc(place[level]));

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  // Att välja tömmer nivåerna inuti (de hörde till den gamla platsen).
  function pick(o, extra = {}) {
    const keep = { country: [], region: ['country'], city: ['country', 'region'], district: ['country', 'region', 'city'] }[level];
    const base = { level };
    // Ett val ur listan tar med sin egen region och sitt land (Arvidsjaur byter region till Norrbotten);
    // något man skrivit själv behåller platsen man var på.
    for (const k of keep) base[k] = (o.fromList ? o[k] : k in o && o[k] ? o[k] : place[k]) ?? null;
    if (level === 'district') Object.assign(base, { postcode: o.postcode || null, district: names[pcKey(o.postcode)] || o.district || null, postcodes: o.postcodes || [] });
    else base[level] = o[level];
    setPlace({ ...base, ...extra });
    onClose();
  }
  const zoomHere = LEVELS.indexOf(level) < LEVELS.indexOf(place.level);
  const item = (o, sub) => html`<button class=${'dd-item' + (isOn(o) ? ' on' : '')} onClick=${() => pick({ ...o, fromList: true })}>
    <span>${label(o)}</span>${sub && html`<small>${sub}</small>`}${o.home && html`<small class="dd-home">Din plats</small>`}</button>`;
  // Resten hopfällt per region (för städer), per stad (för stadsdelar) eller per land (för regioner).
  const grouped = {};
  for (const o of rest) (grouped[groupOf(o)] ||= []).push(o);
  const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'sv'));
  const flat = level !== 'district';
  const REST = { country: 'Andra länder', region: 'Andra länder', city: 'Resten av landet' };
  const count = (n) => `${n} ${n === 1 ? 'stadsdel' : 'stadsdelar'}`;
  return html`<div class="dd-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="dd" role="dialog" aria-label=${`Välj ${LEVEL_TITLE[level]}`}>
      <input class="dd-search" type="search" autofocus value=${q} onInput=${(e) => setQ(e.target.value)}
        inputmode=${level === 'district' && /^\d/.test(q) ? 'numeric' : undefined} placeholder=${`Skriv ${SEARCH_WORD[level]}…`} aria-label=${`Sök ${LEVEL_TITLE[level]}`} />
      <div class="dd-list">
        ${zoomHere && !needle && html`<button class="dd-item dd-zoom" onClick=${() => { setPlace({ ...place, level }); onClose(); }}>Visa hela ${crumbName(place, level)}</button>`}
        ${hits ? html`
          ${hits.map((o) => item(o, parentKey && groupOf(o)))}
          ${!hits.length && html`<p class="dd-empty">Inget sådant finns i appen än.</p>`}
`
        : html`
          ${near.map((o) => item(o))}
          ${flat ? html`${rest.length > 0 && near.length > 0 && html`<div class="dd-label dd-rest">${REST[level]}</div>`}
              ${rest.sort(sortName).map((o) => item(o, parentKey && groupOf(o)))}`
            : html`${groupNames.length > 0 && html`<div class=${'dd-label' + (near.length ? ' dd-rest' : '')}>Andra städer</div>`}
              ${groupNames.map((g) => html`<button class="dd-group" aria-expanded=${!!openGroups[g]} onClick=${() => setOpenGroups((x) => ({ ...x, [g]: !x[g] }))}>
                <span>${g} <small>${count(grouped[g].length)}</small></span><span class="dd-chev">${openGroups[g] ? '▾' : '▸'}</span></button>
              ${openGroups[g] && grouped[g].sort(sortName).map((o) => item(o))}`)}`}`}
      </div>
    </div>
  </div>`;
}

// Fält som föreslår det som redan finns medan man skriver, men där man också kan skriva något nytt.
export function Combo({ label, value, options, onInput, onCommit, placeholder, autoFocus, committed }) {
  const [open, setOpen] = useState(false);
  const picked = useRef(false);
  const needle = lc((value || '').trim());
  const hits = (needle ? options.filter((o) => lc(o.name).includes(needle)).sort((a, b) => (lc(b.name).startsWith(needle) - lc(a.name).startsWith(needle))) : options).slice(0, 7);
  const exact = options.find((o) => lc(o.name) === needle);
  const commit = (name) => { picked.current = true; setOpen(false); onCommit(name); };
  return html`<label>${label}<div class="typeahead">
    <input value=${value || ''} placeholder=${placeholder} autocomplete="off" autoFocus=${autoFocus}
      onFocus=${() => { picked.current = false; setOpen(true); }}
      onInput=${(e) => { picked.current = false; setOpen(true); onInput(e.target.value); }}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); if (needle) commit(exact?.name || hits[0]?.name || value.trim()); } }}
      onBlur=${() => setTimeout(() => { setOpen(false); if (!picked.current && exact) onCommit(exact.name); }, 180)} />
    ${!open && needle && !committed && html`<small class="pc-state">Välj i listan, eller skriv klart och välj ”Lägg till”.</small>`}
    ${open && (hits.length > 0 || (needle && !exact)) && html`<div class="ta-list" role="listbox">
      ${hits.map((o) => html`<button type="button" role="option" class="ta-item" onPointerDown=${() => { picked.current = true; }} onClick=${() => commit(o.name)}>
        <span class="ta-name">${o.name}</span>${o.sub && html`<small class="muted">${o.sub}</small>`}</button>`)}
      ${needle && !exact && html`<button type="button" class="ta-item ta-new" onPointerDown=${() => { picked.current = true; }}
        onClick=${() => commit(value.trim().replace(/^./, (m) => m.toUpperCase()))}>+ Lägg till ”${value.trim()}”</button>`}
    </div>`}
  </div></label>`;
}

// Var man håller till: land → region → stad → stadsdel (postnummer), och vilken nivå appen ska starta på.
// Varje fält visas när det förra är ifyllt. value: { country, region, city, postcode, district, level }
export function HomePlaceFields({ value, onChange, groups, legend = 'Var håller du till?', chooseLevel = true }) {
  const v = value;
  const [draft, setDraft] = useState({ country: v.country || '', region: v.region || '', city: v.city || '' });
  const [pcState, setPcState] = useState('');
  const set = (patch) => onChange({ ...v, ...patch });
  const all = groups || [];
  const count = (k, match) => { const m = new Map(); for (const g of all) if (g[k] && match(g)) { const key = g[k]; m.set(key, (m.get(key) || 0) + 1); } return m; };
  const opt = (m, extra = []) => {
    const seen = new Set([...m.keys()].map(lc));
    return [...[...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, sub: `${n} ${n === 1 ? 'grupp' : 'grupper'}` })),
      ...extra.filter((x) => !seen.has(lc(x))).map((name) => ({ name }))];
  };
  const countries = opt(count('country', () => true), countryNames());
  const regions = v.country ? opt(count('region', (g) => lc(g.country) === lc(v.country)), lc(v.country) === 'sverige' ? SE_REGIONS : []) : [];
  const inRegion = count('city', (g) => lc(g.country) === lc(v.country) && lc(g.region) === lc(v.region));
  // Städer i den valda regionen först, sedan andra städer i landet (med sin region utskriven).
  const regionOf = new Map(all.filter((g) => g.city && lc(g.country) === lc(v.country)).map((g) => [lc(g.city), g.region]));
  const cities = v.country ? [...opt(inRegion), ...[...count('city', (g) => lc(g.country) === lc(v.country)).entries()]
    .filter(([name]) => !inRegion.has(name)).map(([name]) => ({ name, sub: regionOf.get(lc(name)) || '' }))] : [];

  const DOWN = { country: ['region', 'city', 'postcode', 'district'], region: ['city', 'postcode', 'district'], city: ['postcode', 'district'] };
  // Skriver man om ett valt fält gäller valet inte längre – fälten under döljs tills man valt igen.
  const typing = (k, t) => {
    setDraft((d) => ({ ...d, [k]: t }));
    if (v[k] && t !== v[k]) set({ [k]: null, ...Object.fromEntries(DOWN[k].map((x) => [x, null])), level: v.level === 'district' ? 'city' : v.level });
  };
  // Ett nytt val längre upp tömmer fälten under.
  const commit = (k, name) => {
    const down = DOWN[k];
    setDraft((d) => ({ ...d, [k]: name, ...Object.fromEntries(down.filter((x) => x in d).map((x) => [x, ''])) }));
    if (v[k] && lc(name) === lc(v[k])) return set({ [k]: name });
    // En stad som redan finns i en annan region tar med sig sin region.
    const region = k === 'city' && regionOf.get(lc(name));
    if (region && lc(region) !== lc(v.region)) setDraft((d) => ({ ...d, region }));
    set({ [k]: name, ...(region ? { region } : {}), ...Object.fromEntries(down.map((x) => [x, null])), level: v.level === 'district' ? 'city' : v.level });
    setPcState('');
  };
  async function postcode(text) {
    const d = text.replace(/\D/g, '').slice(0, 5);
    set({ postcode: d ? (d.length === 5 ? fmtPostcode(d) : text) : null, district: null, ...(d.length < 5 && v.level === 'district' ? { level: 'city' } : {}) });
    if (d.length !== 5) { setPcState(''); return; }
    setPcState('…');
    const hit = await lookupPostcode(d, v.city || '');
    setPcState(hit?.district ? hit.district : hit ? 'Postnumret finns' : 'Hittar inte postnumret – stämmer det?');
    if (hit?.district) onChange({ ...v, postcode: fmtPostcode(d), district: hit.district });
  }
  const levels = [['country', 'Land'], ['region', 'Region'], ['city', 'Stad'], ['district', 'Stadsdel']];
  const can = (l) => (l === 'district' ? !!(v.postcode && v.postcode.replace(/\D/g, '').length === 5) : !!v[l]);
  return html`<fieldset class="field place-fields home-place">
    <legend class="label">${legend}</legend>
    <${Combo} label="Land" value=${draft.country} options=${countries} placeholder="Börja skriva, t.ex. Sverige"
      committed=${!!v.country} onInput=${(t) => typing('country', t)} onCommit=${(n) => commit('country', n)} />
    ${v.country && html`<${Combo} label="Region" value=${draft.region} options=${regions} placeholder=${lc(v.country) === 'sverige' ? 'Börja skriva, t.ex. Västra Götalands län' : 'Börja skriva'}
      committed=${!!v.region} onInput=${(t) => typing('region', t)} onCommit=${(n) => commit('region', n)} />`}
    ${v.country && v.region && html`<${Combo} label="Stad" value=${draft.city} options=${cities} placeholder="Börja skriva, t.ex. Göteborg"
      committed=${!!v.city} onInput=${(t) => typing('city', t)} onCommit=${(n) => commit('city', n)} />`}
    ${v.city && html`<label>Stadsdel <small>(${chooseLevel ? 'ditt postnummer' : 'postnummer, valfritt'})</small>
      <input inputmode="numeric" autocomplete="postal-code" value=${v.postcode || ''} placeholder="t.ex. 414 51" onInput=${(e) => postcode(e.target.value)} />
      ${pcState && html`<small class=${'pc-state' + (v.district ? ' ok' : '')}>${pcState}</small>`}</label>`}
    ${chooseLevel && v.city && html`<div class="start-level">
      <span class="small">Starta med att se innehåll på den här nivån <span class="muted">(du kan ändra sen)</span></span>
      <div class="seg" role="radiogroup">${levels.map(([l, t]) => html`<button type="button" role="radio" aria-checked=${v.level === l}
        class=${v.level === l ? 'on' : ''} disabled=${!can(l)} onClick=${() => set({ level: l })}>${t}</button>`)}</div>
      ${v.level && html`<small class="muted">Du ser det som händer i <b>${placeLabel({ ...v, level: v.level })}</b>${v.level !== 'country' ? html` – zooma ut med <b>‹</b> överst.` : '.'}</small>`}
    </div>`}
  </fieldset>`;
}

// Kontroll innan sparande: land, region och stad krävs.
export function checkHome(v) {
  if (!v.country) return 'Fyll i vilket land du håller till i.';
  if (!v.region) return 'Fyll i region.';
  if (!v.city) return 'Fyll i stad.';
  return null;
}
export const emptyHome = () => ({ country: '', region: '', city: '', postcode: null, district: null, level: 'city' });
