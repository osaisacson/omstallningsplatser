// Plats: väljaren överst (‹ Göteborg ›) och fälten där man anger var man håller till.
// Att kunna se det som händer i en stadsdel, en stad, en region, ett land eller hela världen är kärnan i appen.
import { html, useState, useEffect, useRef } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, setPlace } from '../store.js';
import { Sheet } from '../ui.js';
import { LEVELS, SE_REGIONS, placeLabel, regionName, zoomOut, zoomIn, hasLevel, placeFromHome, pcKey, fmtPostcode, lookupPostcode, findDistrict, countryNames } from '../util.js';

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
  const addAll = (g, field) => {
    const c = lc(g.country);
    if (g.country) add('country', c, { country: g.country }, field);
    if (g.region) add('region', `${c}|${lc(g.region)}`, { region: g.region, country: g.country }, field);
    if (g.city) add('city', `${c}|${lc(g.city)}`, { city: g.city, region: g.region, country: g.country }, field);
    if (pcKey(g.postcode)) add('district', `${c}|${pcKey(g.postcode)}`, { postcode: fmtPostcode(g.postcode), city: g.city, region: g.region, country: g.country, district: g.district || null }, field);
  };
  for (const g of groups) addAll(g, 'n');
  for (const x of extras) addAll(x, x.kind === 'home' ? 'home' : 'ev');
  const name = (o) => (o.level === 'district' ? o.postcode : o[o.level]);
  const sort = (m) => [...m.values()].sort((a, b) => b.home - a.home || b.n - a.n || b.ev - a.ev || name(a).localeCompare(name(b), 'sv'));
  return { country: sort(maps.country), region: sort(maps.region), city: sort(maps.city), district: sort(maps.district) };
}

// Platser utan grupper som ändå ska gå att välja: ens egen plats och evenemang med egen adress.
let eventPlaces = null;
export function usePlaceExtras() {
  const s = useStore();
  const [events, setEvents] = useState(eventPlaces?.value || []);
  useEffect(() => {
    eventPlaces ||= { promise: api.listEvents().catch(() => []).then((list) => list.filter((p) => p.event_city || p.event_postcode)
      .map((p) => ({ kind: 'event', country: p.event_country || p.group?.country, region: p.event_region, city: p.event_city, postcode: p.event_postcode }))) };
    let alive = true;
    eventPlaces.promise.then((v) => { eventPlaces.value = v; if (alive) setEvents(v); });
    return () => { alive = false; };
  }, []);
  const home = s.me?.home?.country ? [{ kind: 'home', ...s.me.home }] : [];
  return [...home, ...events];
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

// Platsraden överst: Världen › Sverige › Västra Götaland › Göteborg › Majorna ›
// Varje led öppnar en rullgardin med alternativen på den nivån (skriv för att söka, eller välj direkt).
// › längst till höger går ett steg inåt – från hela världen till ens egen plats (eller Majorna i Göteborg).
const DEFAULT_PLACE = { level: 'district', country: 'Sverige', region: 'Västra Götalands län', city: 'Göteborg', district: 'Majorna', postcode: null, postcodes: [] };
const crumbName = (place, l) => (l === 'region' ? regionName(place.region) : l === 'district' ? place.district || fmtPostcode(place.postcode) : place[l]);

export function PlaceSwitcher({ groups }) {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const [open, setOpen] = useState(null);   // nivån vars rullgardin är öppen
  const extras = usePlaceExtras();
  const bar = useRef();
  const depth = LEVELS.indexOf(place.level);
  const next = LEVELS[depth + 1];
  useEffect(() => { if (bar.current) bar.current.scrollLeft = bar.current.scrollWidth; }, [place.level, placeLabel(place)]);
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
  const levels = LEVELS.slice(1, depth + 1).filter((l) => hasLevel(place, l));
  return html`<div class="placebar">
      <div class="crumbs" ref=${bar}>
        <button class=${'crumb' + (place.level === 'world' ? ' cur' : '')} onClick=${() => setPlace({ ...place, level: 'world' })}>Världen</button>
        ${levels.map((l) => html`<span class="crumb-sep" aria-hidden="true">›</span>
          <button class=${'crumb' + (l === place.level ? ' cur' : '') + (open === l ? ' open' : '')} onClick=${() => setOpen(open === l ? null : l)}
            aria-label=${`${LEVEL_TITLE[l]}: ${crumbName(place, l)}. Tryck för att byta`}>${crumbName(place, l)}</button>`)}
      </div>
      ${next && html`<button class="zoom-in" onClick=${forward} aria-label=${place.level === 'world' ? 'Gå till din plats' : `Välj ${LEVEL_TITLE[next]}`}
        title=${place.level === 'world' ? 'Gå till din plats' : `Välj ${LEVEL_TITLE[next]}`}>›</button>`}
    </div>
    ${open && html`<${PlaceDropdown} level=${open} place=${place} groups=${groups} extras=${extras} onClose=${() => setOpen(null)} />`}`;
}

const PARENT = { country: null, region: 'country', city: 'region', district: 'city' };
const SEARCH_WORD = { country: 'land', region: 'region', city: 'stad', district: 'stadsdel eller postnummer' };

// Rullgardinen för en nivå: först det som ligger i nivån ovanför (t.ex. städerna i Västra Götaland),
// sedan resten i bokstavsordning, hopfällt per region/stad. Skriver man söks allt.
function PlaceDropdown({ level, place, groups, extras, onClose }) {
  const [q, setQ] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const [found, setFound] = useState(null);   // postnummer som slagits upp
  const [named, setNamed] = useState(null);   // stadsdel som slagits upp på namn
  const parentKey = PARENT[level];
  let opts = placeOptions(groups, extras)[level];
  if (level === 'region' && lc(place.country || 'sverige') === 'sverige') {
    const have = new Set(opts.map((o) => lc(o.region)));
    opts = [...opts, ...SE_REGIONS.filter((r) => !have.has(lc(r))).map((r) => ({ level: 'region', region: r, country: 'Sverige' }))];
  }
  if (level === 'country') {
    const have = new Set(opts.map((o) => lc(o.country)));
    opts = [...opts, ...countryNames().filter((c) => !have.has(lc(c))).map((c) => ({ level: 'country', country: c }))];
  }
  const names = useDistrictNames(level === 'district' ? opts.filter((o) => lc(o.city) === lc(place.city)).concat(opts).slice(0, 30) : []);
  const label = (o) => (level === 'district' ? names[pcKey(o.postcode)] || o.district || fmtPostcode(o.postcode) : level === 'region' ? regionName(o.region) : o[level]);
  const groupOf = (o) => (parentKey === 'region' ? regionName(o.region) : o[parentKey]) || 'Övrigt';
  const sortName = (a, b) => label(a).localeCompare(label(b), 'sv');
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
    setFound(null);
    if (level !== 'district' || digits.length !== 5) return;
    let alive = true;
    lookupPostcode(digits, '').then((h) => alive && setFound(h || false));
    return () => { alive = false; };
  }, [level, digits]);
  const nameQ = level === 'district' && !digits && q.trim().length >= 3 && !exact ? q.trim() : '';
  useEffect(() => {
    setNamed(null);
    if (!nameQ) return;
    let alive = true;
    const t = setTimeout(() => findDistrict(nameQ, place.city || '', place.country || 'Sverige').then((h) => alive && setNamed(h || false)), 450);
    return () => { alive = false; clearTimeout(t); };
  }, [nameQ, place.city]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  // Att välja tömmer nivåerna inuti (de hörde till den gamla platsen).
  function pick(o, extra = {}) {
    const keep = { country: [], region: ['country'], city: ['country', 'region'], district: ['country', 'region', 'city'] }[level];
    const base = { level };
    for (const k of keep) base[k] = (k in o && o[k] ? o[k] : place[k]) ?? null;
    if (level === 'district') Object.assign(base, { postcode: o.postcode || null, district: names[pcKey(o.postcode)] || o.district || null, postcodes: o.postcodes || [] });
    else base[level] = o[level];
    setPlace({ ...base, ...extra });
    onClose();
  }
  function pickNamed() {
    const name = named?.district || nameQ.replace(/^./, (m) => m.toUpperCase());
    const same = opts.filter((o) => lc(label(o)) === lc(name) && (!place.city || lc(o.city) === lc(place.city))).map((o) => fmtPostcode(o.postcode));
    const postcodes = [...new Set([named?.postcode, ...same].filter(Boolean))];
    pick({ district: name, postcode: postcodes[0] || null, postcodes, city: place.city || named?.city, region: place.region || named?.region, country: place.country || named?.country });
  }
  const zoomHere = LEVELS.indexOf(level) < LEVELS.indexOf(place.level);
  const item = (o, sub) => html`<button class=${'dd-item' + (isOn(o) ? ' on' : '')} onClick=${() => pick(o)}>
    <span>${label(o)}</span>${sub && html`<small>${sub}</small>`}${o.home && html`<small class="dd-home">Din plats</small>`}</button>`;
  // Resten hopfällt per region (för städer), per stad (för stadsdelar) eller per land (för regioner).
  const grouped = {};
  for (const o of rest) (grouped[groupOf(o)] ||= []).push(o);
  const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'sv'));
  const flat = level === 'country';
  return html`<div class="dd-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="dd" role="dialog" aria-label=${`Välj ${LEVEL_TITLE[level]}`}>
      <input class="dd-search" type="search" autofocus value=${q} onInput=${(e) => setQ(e.target.value)}
        inputmode=${level === 'district' && /^\d/.test(q) ? 'numeric' : undefined} placeholder=${`Skriv ${SEARCH_WORD[level]}…`} aria-label=${`Sök ${LEVEL_TITLE[level]}`} />
      <div class="dd-list">
        ${zoomHere && !needle && html`<button class="dd-item dd-zoom" onClick=${() => { setPlace({ ...place, level }); onClose(); }}>Visa hela ${crumbName(place, level)}</button>`}
        ${hits ? html`
          ${level === 'district' && digits.length === 5 && found !== null && html`<button class="dd-item" disabled=${!found}
            onClick=${() => found && pick({ postcode: fmtPostcode(digits), city: found.city || place.city, region: found.region, country: found.country || place.country }, { district: found.district || null })}>
            <span>${found ? found.district || `Postnummer ${fmtPostcode(digits)}` : 'Hittar inte det postnumret'}</span>${found && html`<small>${[fmtPostcode(digits), found.city].filter(Boolean).join(' · ')}</small>`}</button>`}
          ${hits.map((o) => item(o, parentKey && groupOf(o)))}
          ${nameQ && html`<button class="dd-item" onClick=${pickNamed} disabled=${named === null}>
            <span>${named ? named.district : `Visa ”${nameQ}”`}</span><small>${named === null ? 'Letar…' : named ? [named.postcode, named.city || place.city].filter(Boolean).join(' · ') : 'Hittar ingen sådan stadsdel – visa ändå'}</small></button>`}
          ${level !== 'district' && !exact && html`<button class="dd-item dd-free" onClick=${() => pick({ [level]: q.trim().replace(/^./, (m) => m.toUpperCase()) })}><span>Visa ”${q.trim()}”</span><small>Inget där än</small></button>`}
          ${!hits.length && level === 'district' && !nameQ && digits.length !== 5 && html`<p class="dd-empty">Skriv hela postnumret (fem siffror) eller namnet på stadsdelen.</p>`}`
        : html`
          ${near.length > 0 && html`<div class="dd-label">I ${parentKey === 'region' ? regionName(place.region) : place[parentKey]}</div>${near.map((o) => item(o))}`}
          ${flat ? rest.sort(sortName).map((o) => item(o))
            : groupNames.map((g) => html`<button class="dd-group" aria-expanded=${!!openGroups[g]} onClick=${() => setOpenGroups((x) => ({ ...x, [g]: !x[g] }))}>
                <span>${g}</span><span class="dd-chev">${openGroups[g] ? '▾' : '▸'}</span></button>
              ${openGroups[g] && grouped[g].sort(sortName).map((o) => item(o))}`)}`}
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
export function HomePlaceFields({ value, onChange, groups }) {
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
    <legend class="label">Var håller du till?</legend>
    <${Combo} label="Land" value=${draft.country} options=${countries} placeholder="Börja skriva, t.ex. Sverige"
      committed=${!!v.country} onInput=${(t) => typing('country', t)} onCommit=${(n) => commit('country', n)} />
    ${v.country && html`<${Combo} label="Region" value=${draft.region} options=${regions} placeholder=${lc(v.country) === 'sverige' ? 'Börja skriva, t.ex. Västra Götalands län' : 'Börja skriva'}
      committed=${!!v.region} onInput=${(t) => typing('region', t)} onCommit=${(n) => commit('region', n)} />`}
    ${v.country && v.region && html`<${Combo} label="Stad" value=${draft.city} options=${cities} placeholder="Börja skriva, t.ex. Göteborg"
      committed=${!!v.city} onInput=${(t) => typing('city', t)} onCommit=${(n) => commit('city', n)} />`}
    ${v.city && html`<label>Stadsdel <small>(ditt postnummer)</small>
      <input inputmode="numeric" autocomplete="postal-code" value=${v.postcode || ''} placeholder="t.ex. 414 51" onInput=${(e) => postcode(e.target.value)} />
      ${pcState && html`<small class=${'pc-state' + (v.district ? ' ok' : '')}>${pcState}</small>`}</label>`}
    ${v.city && html`<div class="start-level">
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
