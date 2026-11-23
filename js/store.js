// Liten global state: inloggad användare, mina grupper och siffror på ikonerna.
import { useState, useEffect, useRef } from './lib.js';
import { api } from './api/index.js';
import { placeFromHome, setOnlyCountry } from './util.js';

const listeners = new Set();
// Vald plats för flödet (stad, region, land eller hela världen). Sparas i webbläsaren.
function loadPlace() { try { return JSON.parse(localStorage.getItem('place')) || null; } catch { return null; } }
export function setPlace(place) {
  // Bara ett land: "Hela världen" blir det landet.
  if (state?.onlyCountry && (!place || place.level === 'world')) place = { level: 'country', country: state.onlyCountry };
  try { localStorage.setItem('place', JSON.stringify(place)); } catch { /* går bra utan */ }
  setState({ place });
}
// Standard: staden där de flesta av ens grupper finns.
function defaultPlace(groups) {
  const counts = {};
  for (const g of groups) if (g.city) { const k = `${g.city}|${g.region || ''}|${g.country || ''}`; counts[k] = (counts[k] || 0) + 1; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best) return { level: 'world' };
  const [city, region, country] = best[0].split('|');
  return { level: 'city', city, region: region || null, country: country || null };
}

export const state = {
  place: loadPlace(),
  countries: [], onlyCountry: null,
  me: null, myGroups: [], memberOf: new Set(), adminOf: new Set(),
  badges: { notifications: 0, messages: 0, todos: 0 }, toast: null,
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((l) => l());
}
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state;
}

export const go = (path) => { location.hash = '#' + path; };

// Varje sida i appen får ett löpnummer i webbläsarens historik. Bakåtpilen går bara bakåt om föregående sida
// också är en sida i appen – annars kunde den hamna utanför appen (t.ex. hos Google efter inloggning) och visa en vit sida.
let lastIdx = 0;
try { if (history.state?.idx == null) history.replaceState({ ...(history.state || {}), idx: 0 }, ''); lastIdx = history.state.idx; } catch { /* ok */ }
addEventListener('hashchange', () => {
  try { if (history.state?.idx == null) history.replaceState({ ...(history.state || {}), idx: lastIdx + 1 }, ''); lastIdx = history.state.idx; } catch { /* ok */ }
});
export function goBack(fallback = '/') {
  if ((history.state?.idx ?? 0) > 0) history.back(); else go(fallback);
}

let toastTimer;
export function toast(msg) {
  setState({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), 3200);
}

export async function refreshBadges() {
  if (!state.me) return;
  try {
    const badges = await api.badges();
    setState({ badges });
    // Siffra på appikonen: olästa meddelanden och notiser + saker att göra i checklistan.
    const n = (badges.messages || 0) + (badges.notifications || 0) + (badges.todos || 0);
    if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  } catch (e) { console.warn(e); }
}

export async function refreshMe() {
  const me = await api.getMe();
  setState({ recovering: !!api.isRecovering?.() });
  if (!me) return setState({ me: null, myGroups: [], memberOf: new Set(), adminOf: new Set() });
  const [myGroups, countries] = await Promise.all([api.myGroups(), api.listCountries().catch(() => [])]);
  const only = countries.length === 1 ? countries[0] : countries.length ? null : 'Sverige';
  setOnlyCountry(only);
  setState({ countries, onlyCountry: only });
  const isNew = Date.now() - new Date(me.created_at) < 10 * 60e3;
  const skipped = (() => { try { return !!localStorage.getItem('valkommen-skippad'); } catch { return false; } })();
  if (isNew && !skipped && !myGroups.length && (location.hash === '' || location.hash === '#/')) go('/valkommen');
  // Den plats man angett som sin startar appen på – första gången man loggar in på en enhet, och när man ändrat den.
  const home = placeFromHome(me.home);
  let homeFor = null; try { homeFor = localStorage.getItem('place-home'); } catch { /* ok */ }
  const homeKey = home ? me.id + JSON.stringify(home) : null;
  if (home && homeFor !== homeKey) { setPlace(home); try { localStorage.setItem('place-home', homeKey); } catch { /* ok */ } }
  else if (!state.place) setPlace(defaultPlace(myGroups));
  else if (only && state.place.level === 'world') setPlace(state.place);
  setState({
    me, myGroups,
    memberOf: new Set(myGroups.map((g) => g.id)),
    adminOf: new Set(myGroups.filter((g) => g.role === 'admin').map((g) => g.id)),
  });
  api.touch().catch(() => {});
  refreshBadges();
}

// Hämtar data asynkront och laddar om när beroenden ändras.
// Allt som hämtar data registrerar sig här, så att "dra ner för att uppdatera" kan hämta om allt på sidan
// i bakgrunden – utan att sidan laddas om eller hoppar.
const refreshers = new Set();
export function onRefresh(fn) { refreshers.add(fn); return () => refreshers.delete(fn); }
export const refreshAll = () => Promise.all([...refreshers].map((f) => Promise.resolve(f()).catch(() => {})));

export function useAsync(fn, deps = []) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const fnRef = useRef(fn); fnRef.current = fn;
  const token = useRef(0);
  const run = () => {
    const t = ++token.current;
    set((x) => ({ ...x, loading: true }));
    return fnRef.current().then(
      (data) => { if (t === token.current) set({ loading: false, data, error: null }); },
      (error) => { console.error(error); if (t === token.current) set((x) => ({ loading: false, data: x.data, error: x.data ? null : error })); },
    );
  };
  const runRef = useRef(run); runRef.current = run;
  useEffect(() => { runRef.current(); }, deps);
  useEffect(() => { const off = onRefresh(() => runRef.current()); return () => { off(); token.current++; }; }, []);
  return { ...s, reload: () => runRef.current() };
}

// Kör en åtgärd och visar felet som toast i stället för att krascha.
export async function attempt(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { toast(e.message || String(e)); return false; }
}
