// Typ av inlägg.
export const POST_TYPES = { vanlig: 'Vanlig post', finansiering: 'Tillgänglig finansiering', lokal: 'Resurs att låna eller hyra' };
export const postType = (p) => p.kind || (p.fin_total != null ? 'finansiering' : 'vanlig');

// Resurser (sparas som typen "lokal"): vad det är och vad det kostar. Lokaler, verktyg, maskiner, mark, fordon …
export const DEFAULT_FUNCTIONS = ['Lokal', 'Verktyg', 'Maskin', 'Fordon', 'Mark', 'Verkstad', 'Kök', 'Möteslokal', 'Förråd', 'Odling', 'Övernattning'];
export const SPACE_COSTS = { gratis: 'Gratis', gentjanst: 'Mot gentjänst', kostar: 'Kostar' };
// Finansiering och resurser: något behövs, något finns – eller (finansiering) ett tips om var pengar finns.
export const STANCES = {
  finansiering: { behovs: 'Behövs', finns: 'Finns', tips: 'Tips' },
  lokal: { behovs: 'Behövs', finns: 'Finns' },
};
export const stanceOf = (p) => p.stance || (postType(p) === 'lokal' || postType(p) === 'finansiering' ? 'finns' : null);
// Märket på inlägget, t.ex. "Behövs pengar", "Finns att låna", "Tips".
export function stanceBadge(p) {
  const k = postType(p), st = stanceOf(p);
  if (k === 'finansiering') return { behovs: 'Pengar behövs', finns: 'Pengar finns', tips: 'Tips om pengar' }[st];
  if (k === 'lokal') return st === 'behovs' ? 'Behövs' : 'Finns att låna';
  return null;
}

// Plats: flödet kan visas för en stadsdel, en stad, en region, ett land eller hela världen.
// En stadsdel anges med postnummer (hela, fem siffror i Sverige).
export const LEVELS = ['world', 'country', 'region', 'city', 'district'];
export const PLACE_LEVELS = { district: 'stadsdel', city: 'stad', region: 'region', country: 'land', world: '' };
const LEVEL_KEY = { country: 'country', region: 'region', city: 'city', district: 'postcode' };
export const pcKey = (p) => String(p || '').replace(/\D/g, '');
export const fmtPostcode = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : String(p || '').trim(); };
// Har platsen ett värde på den här nivån? (Hela världen har alltid det.)
export const hasLevel = (place, level) => level === 'world' || !!(place && (place[LEVEL_KEY[level]] || (level === 'district' && place.district)));
// "Västra Götalands län" → "Västra Götaland": ordet län behövs inte och tar plats.
// Regionerna visas med sina egna namn (Region Uppsala, Västra Götalandsregionen), så att de inte förväxlas med staden.
// I databasen sparas länets namn (Uppsala län) – det är samma område.
const REGION_NAMES = {
  'blekinge län': 'Region Blekinge', 'dalarnas län': 'Region Dalarna', 'gotlands län': 'Region Gotland', 'gävleborgs län': 'Region Gävleborg',
  'hallands län': 'Region Halland', 'jämtlands län': 'Region Jämtland Härjedalen', 'jönköpings län': 'Region Jönköpings län', 'kalmar län': 'Region Kalmar län',
  'kronobergs län': 'Region Kronoberg', 'norrbottens län': 'Region Norrbotten', 'skåne län': 'Region Skåne', 'stockholms län': 'Region Stockholm',
  'södermanlands län': 'Region Sörmland', 'uppsala län': 'Region Uppsala', 'värmlands län': 'Region Värmland', 'västerbottens län': 'Region Västerbotten',
  'västernorrlands län': 'Region Västernorrland', 'västmanlands län': 'Region Västmanland', 'västra götalands län': 'Västra Götalandsregionen',
  'örebro län': 'Region Örebro län', 'östergötlands län': 'Region Östergötland',
};
// Tillbaka från regionnamnet till länets namn som sparas (Region Uppsala → Uppsala län).
export const regionKey = (name) => Object.keys(REGION_NAMES).find((k) => REGION_NAMES[k].toLowerCase() === String(name || '').trim().toLowerCase())?.replace(/^./, (c) => c.toUpperCase()).replace(/ götalands/, ' Götalands') || name;
export const regionName = (r) => REGION_NAMES[String(r || '').trim().toLowerCase()] || String(r || '');
// Sorteras på själva namnet, inte på ordet "Region".
export const regionSortKey = (name) => String(name || '').replace(/^Region /, '');
export function placeLabel(place) {
  if (!place || place.level === 'world') return 'Hela världen';
  if (place.level === 'district') return place.district || (place.postcode ? fmtPostcode(place.postcode) : 'Stadsdel');
  if (place.level === 'region') return regionName(place.region) || 'Hela världen';
  return place[place.level] || 'Hela världen';
}
// Finns bara ett land i appen är det den yttersta nivån: inget "Hela världen", och allt räknas dit.
let onlyCountry = null;
export function setOnlyCountry(c) { onlyCountry = c || null; }
export const getOnlyCountry = () => onlyCountry;
// Går det att zooma ut härifrån? (Inte från hela världen, och inte från landet om det bara finns ett.)
export const canZoomOut = (place) => !!place && place.level !== 'world' && !(onlyCountry && place.level === 'country');
export function inPlace(group, place) {
  if (!place || place.level === 'world') return true;
  if (onlyCountry && place.level === 'country') return true;
  if (!group) return false;  // inlägg utan grupp visas bara för hela världen
  const same = (k) => (group[k] || '').toLowerCase() === (place[k] || '').toLowerCase();
  if (place.level === 'country') return same('country');
  if (place.level === 'region') return same('country') && same('region');
  if (place.level === 'city') return same('country') && same('city');
  const keys = place.postcodes?.length ? place.postcodes.map(pcKey) : [pcKey(place.postcode)];
  return same('country') && !!pcKey(group.postcode) && keys.includes(pcKey(group.postcode));
}
// Var ett inlägg hör hemma: ett evenemang med egen plats räknas dit, annars gruppens plats.
// Var ett inlägg hör hemma: i gruppens plats (även evenemang – adressen visas men styr inte var det syns).
// Inlägg utan grupp har en egen plats som angavs när det skrevs (äldre evenemang utan grupp: adressens plats).
const cityRegion = new Map();
// Var inlägget syns: där det hör hemma och uppåt (som förut), och – om man valt en räckvidd – även i allt
// som ligger inom den (ett inlägg för hela regionen syns i varje stad och stadsdel där).
export const REACH_LEVELS = ['district', 'city', 'region', 'country'];
export function postVisibleAt(p, place) {
  const pl = postPlace(p);
  if (inPlace(pl, place)) return true;
  if (!pl || !p.reach || !place || place.level === 'world') return false;
  return inPlace(place, { ...pl, level: p.reach });
}
export function learnCityRegions(rows = []) {
  for (const r of rows) if (r?.city && r?.region) cityRegion.set(`${(r.country || '').toLowerCase()}|${r.city.toLowerCase()}`, r.region);
}
export function postPlace(p) {
  if (!p) return null;
  if (p.group) return p.group;
  const country = p.country || p.event_country, city = p.city || p.event_city;
  if (!country && !city) return null;
  return { country, city, postcode: p.postcode || p.event_postcode,
    region: p.region || p.event_region || cityRegion.get(`${(country || '').toLowerCase()}|${(city || '').toLowerCase()}`) || null };
}
// Ett steg utåt (stadsdel → stad → region → land → hela världen). Nivåer som saknas hoppas över.
// De inre fälten sparas, så att man kan zooma in igen till samma ställe.
// En plats med stad men utan region får regionen från andra platser i samma stad (Göteborg → Västra Götaland).
export function withRegion(place) {
  if (!place?.city || place.region) return place;
  const region = cityRegion.get(`${(place.country || '').toLowerCase()}|${place.city.toLowerCase()}`);
  return region ? { ...place, region } : place;
}
export function zoomOut(place) {
  place = withRegion(place);
  let i = LEVELS.indexOf(place?.level || 'world') - 1;
  while (i > 0 && !hasLevel(place, LEVELS[i])) i--;
  return i < 0 ? place : { ...place, level: LEVELS[Math.max(0, i)] };
}
// Ett steg inåt, om platsen redan har ett värde där. Annars null (då får man välja).
export function zoomIn(place) {
  const i = LEVELS.indexOf(place?.level || 'world');
  for (let j = i + 1; j < LEVELS.length; j++) {
    if (hasLevel(place, LEVELS[j])) return { ...place, level: LEVELS[j] };
    if (LEVELS[j] !== 'region') return null;   // region kan saknas för en stad, de andra inte
  }
  return null;
}
// Hemplatsen som användaren angav (land, region, stad, postnummer och vilken nivå appen startar på).
export function placeFromHome(h) {
  if (!h?.country) return null;
  let level = LEVELS.includes(h.level) ? h.level : 'city';
  while (level !== 'world' && !hasLevel(h, level)) level = LEVELS[LEVELS.indexOf(level) - 1];
  return { level, country: h.country, region: h.region || null, city: h.city || null, postcode: h.postcode || null, district: h.district || null };
}
export const SE_REGIONS = ['Blekinge län', 'Dalarnas län', 'Gotlands län', 'Gävleborgs län', 'Hallands län', 'Jämtlands län', 'Jönköpings län',
  'Kalmar län', 'Kronobergs län', 'Norrbottens län', 'Skåne län', 'Stockholms län', 'Södermanlands län', 'Uppsala län', 'Värmlands län',
  'Västerbottens län', 'Västernorrlands län', 'Västmanlands län', 'Västra Götalands län', 'Örebro län', 'Östergötlands län'];
// Namnet på stadsdelen för ett postnummer, från OpenStreetMap: först Photon, annars Nominatim
// (postnumrets mittpunkt → stadsdel eller by där). Sparas i webbläsaren.
const pcCache = (() => { try { return JSON.parse(localStorage.getItem('pc-names')) || {}; } catch { return {}; } })();
// Nominatim tillåter högst ett anrop per sekund – anropen ställs i kö.
let nomQueue = Promise.resolve();
const nominatim = (path) => {
  const job = nomQueue.then(() => fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&addressdetails=1&accept-language=sv`).then((r) => r.json()));
  nomQueue = job.catch(() => {}).then(() => new Promise((res) => setTimeout(res, 1100)));
  return job;
};
const areaName = (a = {}) => a.suburb || a.quarter || a.neighbourhood || a.city_district || a.village || a.hamlet || a.town || null;
const NO_DISTRICT = { district: null };   // postnumret finns inte alls
export async function lookupPostcode(postcode, city = '') {
  const d = String(postcode || '').replace(/\D/g, '');
  if (d.length < 5) return null;
  const key = `${d}|${city}`;
  if (pcCache[key]?.district || pcCache[key]?.v === 2) return pcCache[key];   // äldre tomma svar slås upp igen
  let hit = null;
  let failed = false;
  try {
    const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=default&q=${encodeURIComponent(fmtPostcode(d) + ' ' + city)}`).then((r) => r.json());
    const f = (r.features || []).find((x) => x.properties.osm_value === 'postcode' && x.properties.name?.replace(/\D/g, '') === d)
      || (r.features || []).find((x) => x.properties.postcode?.replace(/\D/g, '') === d);
    if (f) { const p = f.properties; hit = { district: p.district || p.locality || null, city: p.city || p.town || null, region: p.county || p.state || null, country: p.country || null }; }
  } catch { failed = true; }
  if (!hit?.district) {
    try {
      const [pc] = await nominatim(`search?postalcode=${d}&country=se&limit=1`);
      if (pc) {
        const rev = await nominatim(`reverse?lat=${pc.lat}&lon=${pc.lon}&zoom=14`);
        const a = rev?.address || {};
        hit = { district: areaName(a), city: hit?.city || a.city || a.town || (a.municipality || '').replace(/ kommun$/, '') || null,
          region: hit?.region || pc.address?.county || a.county || null, country: hit?.country || a.country || null };
      } else if (!failed) hit = hit || NO_DISTRICT;
      failed = false;
    } catch { if (failed) return null; }   // nätverksfel sparas inte
  }
  pcCache[key] = hit && { ...hit, v: 2 };
  try { localStorage.setItem('pc-names', JSON.stringify(pcCache)); } catch { /* ok */ }
  return hit;
}

// En stadsdel som man skriver namnet på, t.ex. "Sanna" i Göteborg: slås upp hos Nominatim, som ger stadsdelens postnummer.
const districtCache = {};
export async function findDistrict(name, city, country = 'Sverige') {
  const key = `${name}|${city}`.toLowerCase();
  if (key in districtCache) return districtCache[key];
  try {
    const list = await nominatim(`search?q=${encodeURIComponent([name, city, country].filter(Boolean).join(', '))}&limit=3`);
    const f = list.find((x) => ['suburb', 'quarter', 'neighbourhood', 'city_district', 'village', 'hamlet', 'town'].includes(x.addresstype)) || list[0];
    if (!f) return (districtCache[key] = null);
    let pc = f.address?.postcode;
    if (!pc) pc = (await nominatim(`reverse?lat=${f.lat}&lon=${f.lon}&zoom=18`))?.address?.postcode;
    return (districtCache[key] = { district: f.name || name, postcode: pc ? fmtPostcode(pc) : null,
      city: f.address?.city || f.address?.town || city, region: f.address?.county || null, country: f.address?.country || country });
  } catch { return null; }
}
export const countryNames = () => {
  try {
    const dn = new Intl.DisplayNames(['sv'], { type: 'region' });
    const codes = 'AD AE AF AL AM AO AR AT AU AZ BA BD BE BF BG BH BI BJ BO BR BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CY CZ DE DJ DK DO DZ EC EE EG ER ES ET FI FJ FR GA GB GE GH GM GN GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KR KW KZ LA LB LK LR LS LT LU LV LY MA MD ME MG MK ML MM MN MR MT MU MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PS PT PY QA RO RS RU RW SA SD SE SG SI SK SL SN SO SR SS SV SY TD TG TH TJ TL TN TR TT TW TZ UA UG US UY UZ VE VN YE ZA ZM ZW'.split(' ');
    return codes.map((c) => dn.of(c)).sort((a, b) => a.localeCompare(b, 'sv'));
  } catch { return ['Sverige', 'Norge', 'Danmark', 'Finland']; }
};

// "kooperativ.se" → "https://kooperativ.se". Tomt → null.
export function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).href; } catch { throw new Error('Webbadressen ser inte rätt ut.'); }
}
export const prettyUrl = (u) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
// Ämnen som föreslås för vanliga inlägg (fler kan skapas).
export const DEFAULT_CATEGORIES = ['Energi', 'Byggmetod', 'Off-grid', 'Vatten', 'Avfall', 'Mat', 'Ekonomi'];
export const PAYOUT_BANK_LIMIT = 5000; // över detta belopp betalas till bankkonto i stället för Swish

export const fmtKr = (n) => new Intl.NumberFormat('sv-SE').format(Math.round(Number(n) || 0)) + ' kr';
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// Omnämnanden (@Namn) sparas i texten som @[Namn](användarens id) och visas som @Namn med länk till profilen.
export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([0-9a-f-]{36})\)/g;
export const plainText = (t) => String(t ?? '').replace(MENTION_RE, '@$1');
// Redigerbar form: @Namn i texten och en lista över vilka namn som är omnämnanden.
export function toEditable(raw) {
  const mentions = [];
  const text = String(raw ?? '').replace(MENTION_RE, (_, name, id) => { if (!mentions.some((m) => m.id === id)) mentions.push({ name, id }); return '@' + name; });
  return { text, mentions };
}
export function fromEditable(text, mentions) {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.name.length - a.name.length)) out = out.split('@' + m.name).join(`@[${m.name}](${m.id})`);
  return out;
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'nyss';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} tim`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: s > 300 * 86400 ? 'numeric' : undefined });
}

export const sortCategories = (names) => [
  ...DEFAULT_CATEGORIES.filter((d) => names.includes(d)),
  ...names.filter((n) => !DEFAULT_CATEGORIES.includes(n)).sort((a, b) => a.localeCompare(b, 'sv')),
];

// Räknar ut läget för en finansiering utifrån kommentarernas status.
export function financeSummary(post, comments) {
  if (post.fin_total == null) return null;
  let granted = 0, paid = 0, pending = 0;
  for (const c of comments) {
    if (c.status === 'granted') granted += Number(c.applied_amount);
    else if (c.status === 'paid') paid += Number(c.applied_amount);
    else if (c.status === 'applied') pending++;
  }
  const total = Number(post.fin_total);
  const expired = !!post.fin_expires_at && new Date(post.fin_expires_at) < new Date();
  const remaining = Math.max(0, total - granted - paid);
  return {
    total, mode: post.fin_mode, granted, paid, pending, remaining,
    closed: !!post.fin_closed, expired, expires_at: post.fin_expires_at,
    open: !post.fin_closed && !expired && remaining > 0,
  };
}

// Stängda/utgångna finansieringar visas inte i flödena (men finns kvar på profil och gruppsida).
export const visibleInFeed = (p) => !p.finance || !(p.finance.closed || p.finance.expired);

// Kontroll av ett nytt/ändrat inlägg, gemensam för båda backends.
export function normalizePostInput(input) {
  const kind = POST_TYPES[input.type] ? input.type : 'vanlig';
  const clean = (xs) => [...new Set((xs || []).map((c) => c.trim()).filter(Boolean))];
  const categories = kind === 'vanlig' ? clean(input.tags) : [];
  const slides = input.slides || [];
  const caption = (input.caption || '').trim();
  if (!slides.length && !caption) throw new Error('Lägg till minst en bild eller lite text.');
  let finance = null, space = null;
  // Finansiering och resurser: behövs / finns (/ tips). Belopp och sista dag är valfria – resten i kommentarerna.
  const stance = STANCES[kind] ? (STANCES[kind][input.stance] ? input.stance : 'finns') : null;
  const amountNum = Number(String(input.amount ?? '').replace(/[\s kr]/g, ''));
  const amount = kind === 'finansiering' && input.amount !== '' && input.amount != null && amountNum >= 0 ? amountNum : null;
  const deadline = kind === 'finansiering' || kind === 'lokal' ? (input.deadline || null) : null;
  if (kind === 'lokal') {
    const functions = clean(input.space?.functions);
    if (!functions.length) throw new Error(stance === 'behovs' ? 'Skriv vad som behövs.' : 'Ange minst en sak som beskriver resursen.');
    const cost = stance === 'behovs' ? null : SPACE_COSTS[input.space?.cost] ? input.space.cost : 'gratis';
    space = { functions, cost, price: cost === 'kostar' ? (input.space?.price || '').trim() || null : null };
  }
  let event = null;
  if (input.event && kind !== 'finansiering') {
    const e = input.event;
    if (!e.date || !e.start) throw new Error('Ange datum och starttid för evenemanget.');
    const start = new Date(`${e.date}T${e.start}`);
    const end = e.end ? new Date(`${e.date}T${e.end}`) : null;
    if (isNaN(start)) throw new Error('Datum eller tid ser inte rätt ut.');
    if (end && end <= start) end.setDate(end.getDate() + 1);   // slutar efter midnatt
    event = { start: start.toISOString(), end: end ? end.toISOString() : null, address: (e.address || '').trim() || null, postcode: e.postcode || null,
      city: e.city || null, region: e.region || null, country: e.country || null, lat: e.lat ?? null, lng: e.lng ?? null, rsvp: e.rsvp !== false };
  }
  const place = !input.groupId && input.place ? { country: input.place.country || null, region: input.place.region || null, city: input.place.city || null, postcode: input.place.postcode || null } : null;
  const visibleTo = [...new Set((input.visibleTo || []).filter(Boolean))];
  const reach = REACH_LEVELS.includes(input.reach) ? input.reach : null;
  return { stance, amount, deadline, reach, visibleTo, place, groupId: input.groupId || null, asGroup: !!(input.asGroup && input.groupId), caption, slides, kind, categories, isResource: kind !== 'vanlig' || categories.length > 0, finance, space, event };
}

export async function resizeImage(file, max = 1280, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Kunde inte läsa bilden.'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; // genomskinliga bilder (PNG) får vit bakgrund i stället för svart
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const blobToDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

// Slår upp en adress på OpenStreetMap (Nominatim) för att kunna visa gruppen på kartan.
// Hittas inte adressen provas staden. Ger null om inget hittas.
export async function geocode({ address, city, region, country }) {
  const tries = [[address, city, region, country], [city, region, country]]
    .map((parts) => parts.filter((x) => (x || '').trim()).join(', '))
    .filter((q, i, all) => q && all.indexOf(q) === i);
  for (const q of tries) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=sv&q=${encodeURIComponent(q)}`);
      const [hit] = await r.json();
      if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon) };
    } catch { /* försök nästa */ }
  }
  return null;
}

// Evenemang: fälten som sparas på inlägget.
export const eventColumns = (ev) => ev ? {
  is_event: true, event_start: ev.start, event_end: ev.end, event_address: ev.address, event_postcode: ev.postcode,
  event_city: ev.city, event_region: ev.region, event_country: ev.country, event_lat: ev.lat, event_lng: ev.lng, event_rsvp: ev.rsvp,
} : { is_event: false, event_start: null, event_end: null, event_address: null, event_postcode: null, event_city: null,
  event_region: null, event_country: null, event_lat: null, event_lng: null, event_rsvp: true };

export const eventTitle = (p) => plainText(p.caption || '').split(/\n|(?<=[.!?])\s/)[0].slice(0, 80) || 'Evenemang';
export const fmtEventTime = (p) => {
  const s = new Date(p.event_start), e = p.event_end ? new Date(p.event_end) : null;
  const day = s.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  const t = (d) => d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${day.charAt(0).toUpperCase() + day.slice(1)} kl ${t(s)}${e ? '–' + t(e) : ''}`;
};

// Kalenderfil (.ics) för ett evenemang. Samma UID varje gång och SEQUENCE från senaste ändringen,
// så att en ny nedladdning uppdaterar händelsen i kalendern i stället för att skapa en dubblett.
export function eventIcs(p, url) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  const end = p.event_end || new Date(new Date(p.event_start).getTime() + 2 * 3600e3).toISOString();
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Omställningsplatser//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${p.id}@kooperativsystemet`, `SEQUENCE:${Math.floor(new Date(p.updated_at || p.created_at).getTime() / 1000) % 2147483647}`,
    `DTSTAMP:${z(new Date())}`, `DTSTART:${z(p.event_start)}`, `DTEND:${z(end)}`, `SUMMARY:${esc(eventTitle(p))}`,
    `LOCATION:${esc([p.event_address, p.event_city].filter(Boolean).join(', '))}`, `DESCRIPTION:${esc(plainText(p.caption) + '\n\n' + url)}`, `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
export function googleCalendarUrl(p, url) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = p.event_end || new Date(new Date(p.event_start).getTime() + 2 * 3600e3).toISOString();
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle(p))}&dates=${z(p.event_start)}/${z(end)}&details=${encodeURIComponent(p.caption + '\n\n' + url)}&location=${encodeURIComponent([p.event_address, p.event_city].filter(Boolean).join(', '))}`;
}

// Har man lagt till kalenderprenumerationen (på den här enheten)?
export const calendarSubscribed = () => { try { return !!localStorage.getItem('kalender-prenumererar'); } catch { return false; } };

// Minne: kategorier från början (ur beskrivningen av plattformen). Man kan också skapa egna när man sparar.
export const MEMORY_THEMES = [
  { name: 'Bygga & bo', about: 'Byggemenskaper, kollektivhus, material och renovering' },
  { name: 'Mat & odling', about: 'Odling, andelsjordbruk, frön och mat tillsammans' },
  { name: 'Energi', about: 'Solel, värme och energigemenskaper' },
  { name: 'Vatten & avfall', about: 'Gråvatten, kompost och kretslopp' },
  { name: 'Produktion & reparation', about: 'Verkstäder, lagning och lokal tillverkning' },
  { name: 'Ekonomi & delning', about: 'Finansiering, delningsekonomi och kooperativ' },
  { name: 'Rättvisa & organisering', about: 'Föreningar, beslut, inkludering och påverkan' },
  { name: 'Relationer & gemenskap', about: 'Grannskap, möten och att ta hand om varandra' },
];

// Vilken kategori ett inlägg hör till i Minne: den flest valt när de sparade det; vid lika den som valdes först.
export function majorityTheme(votes = []) {
  const by = new Map();
  for (const v of votes) {
    if (!v.theme) continue;
    const x = by.get(v.theme) || { n: 0, first: v.created_at || '' };
    x.n++; if ((v.created_at || '') < x.first) x.first = v.created_at;
    by.set(v.theme, x);
  }
  let best = null;
  for (const [t, x] of by) if (!best || x.n > best.n || (x.n === best.n && x.first < best.first)) best = { t, ...x };
  return best?.t || null;
}

// Kategorierna ett inlägg ligger i: Redaktionens val om det finns, annars alla som valts när någon sparat det
// (de som valts av flest först).
export function postThemes(p, votes = []) {
  if (p.memory_themes?.length) return [...p.memory_themes];
  if (p.memory_theme) return [p.memory_theme];
  const n = new Map();
  for (const v of votes) for (const t of v.themes?.length ? v.themes : v.theme ? [v.theme] : []) n.set(t, (n.get(t) || 0) + 1);
  return [...n.keys()].sort((a, b) => n.get(b) - n.get(a));
}
