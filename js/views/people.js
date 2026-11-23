// Inloggning/registrering, sök, profil och redigera profil.
import { html, useState, useEffect } from '../lib.js';
import { api } from '../api/index.js';
import { APP_NAME, AUTH_PROVIDERS, VAPID_PUBLIC_KEY } from '../config.js';
import { useStore, useAsync, go, attempt, refreshMe, refreshBadges, setState, toast } from '../store.js';
import { Icon, Count, Avatar, Header, PostGrid, GroupRow, UserRow, ImagePicker, Loading, ErrorBox, ReportForm, MoreMenu, editorDelete } from '../ui.js';
import { Terms } from './help.js';
import { AddEditorConfirm } from './roles.js';
import { HomePlaceFields, checkHome, emptyHome, PlaceSwitcher } from './place.js';
import { EventsList, CalendarSetting } from './calendar.js';
import { inPlace, postPlace, postType, placeLabel, zoomOut, canZoomOut } from '../util.js';

const PROVIDERS = {
  google: { label: 'Fortsätt med Google', icon: '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>' },
  apple: { label: 'Fortsätt med Apple', icon: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>' },
};

function ProviderButtons() {
  const list = api.mode === 'supabase' ? AUTH_PROVIDERS.filter((p) => PROVIDERS[p]) : [];
  if (!list.length) return null;
  return html`<div class="providers">
    ${list.map((p) => html`<button type="button" class=${'btn block provider ' + p} key=${p}
      onClick=${() => attempt(() => api.signInWithProvider(p))}>
      <span dangerouslySetInnerHTML=${{ __html: PROVIDERS[p].icon }}></span>${PROVIDERS[p].label}</button>`)}
    <div class="divider"><span>eller med e-post och lösenord</span></div>
  </div>`;
}

export function AuthView() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [home, setHome] = useState(emptyHome);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') { await api.signIn({ email, password }); go('/'); }
      else if (mode === 'reset') {
        await api.requestPasswordReset(email);
        setInfo('Om det finns ett konto med den adressen har vi skickat ett mejl med en länk. Hittar du det inte? Titta i skräpposten.');
        return;
      } else {
        if (!agree) { setErr('Bekräfta att du är minst 13 år och godkänner villkoren.'); return; }
        const bad = checkHome(home);
        if (bad) { setErr(bad); return; }
        const r = await api.signUp({ email, password, name, avatarFile: file, home });
        if (r.needsConfirmation) { setInfo('Nästan klart! Vi har skickat ett mejl – klicka på länken i det och logga sedan in här.'); setMode('login'); }
        else go('/valkommen');
      }
      await refreshMe();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  const signup = mode === 'signup';
  const places = useAsync(() => (signup ? api.listPlaces() : Promise.resolve([])), [signup]);
  const reset = mode === 'reset';
  const switchTo = (m) => { setMode(m); setErr(''); setInfo(''); };
  return html`<div class="auth">
    <img class="auth-logo" src="icon.svg" alt="" width="72" height="72" />
    <h1 class="logo big">Omställningsplatser<small class="logo-sub">Småskaliga omkonfigurationer av samhället</small></h1>
    <form class="form card" onSubmit=${submit}>
      ${!reset && html`<${ProviderButtons} />`}
      ${reset && html`<p><strong>Glömt lösenordet?</strong><br /><span class="muted">Skriv din e-postadress så skickar vi en länk där du kan välja ett nytt.</span></p>`}
      ${signup && html`<${ImagePicker} name=${name} onFile=${setFile} label="Välj profilbild" />
        <label>Namn<input required autocomplete="name" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="För- och efternamn" /></label>`}
      <label>E-post<input required type="email" autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} /></label>
      ${!reset && html`<label>Lösenord<input required type="password" minlength="6" autocomplete=${signup ? 'new-password' : 'current-password'} value=${password} onInput=${(e) => setPassword(e.target.value)} /></label>`}
      ${signup && html`<${HomePlaceFields} value=${home} onChange=${setHome} groups=${places.data} />
        <label class="check terms-check"><input type="checkbox" checked=${agree} onChange=${(e) => setAgree(e.target.checked)} />
          <span>Jag är minst 13 år och godkänner <a href="#" onClick=${(e) => { e.preventDefault(); e.currentTarget.closest('form').querySelector('.terms-text').toggleAttribute('open'); }}>villkoren</a>.</span></label>
        <details class="terms-text"><summary>Villkoren</summary><${Terms} /></details>`}
      ${mode === 'login' && html`<button type="button" class="link small forgot" onClick=${() => switchTo('reset')}>Glömt lösenordet?</button>`}
      ${info && html`<p class="info">${info}</p>`}
      ${err && html`<p class="error">${err}</p>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Vänta…' : signup ? 'Skapa konto' : reset ? 'Skicka länk' : 'Logga in'}</button>
    </form>
    ${reset
      ? html`<p class="center"><button class="link strong" onClick=${() => switchTo('login')}>Tillbaka till inloggningen</button></p>`
      : html`<p class="center">${signup ? 'Har du redan ett konto? ' : 'Ny här? '}
          <button class="link strong" onClick=${() => switchTo(signup ? 'login' : 'signup')}>${signup ? 'Logga in' : 'Skapa konto'}</button></p>`}
    <p class="hint center"><a href="integritet.html">Integritet</a></p>
    ${api.mode === 'demo' && html`<p class="hint center">Demoläge: konton och inlägg sparas bara i den här webbläsaren.</p>`}
  </div>`;
}

// Sök: allt inom området som är valt uppe till vänster (samma som i resten av appen), uppdelat i flikar.
// Det man skriver begränsar alla flikar samtidigt; siffran på varje flik visar hur många träffar den har.
const SEARCH_TABS = [['grupper', 'Grupper'], ['folk', 'Folk'], ['poster', 'Poster'], ['finansiering', 'Finansiering'],
  ['lokaler', 'Lokaler'], ['evenemang', 'Events'], ['minne', 'Minne']];
const OLD_TABS = { inlagg: 'poster', personer: 'folk' };

export function Search({ tab: initialTab }) {
  const s = useStore();
  const place = s.place || { level: 'world' };
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const start = OLD_TABS[initialTab] || initialTab;
  const [tab, setTab] = useState(() => { try { return SEARCH_TABS.some(([k]) => k === start) ? start : sessionStorage.getItem('sok-flik') || 'grupper'; } catch { return 'grupper'; } });
  const choose = (k) => { setTab(k); try { sessionStorage.setItem('sok-flik', k); } catch { /* ok */ } };
  useEffect(() => { const t = setTimeout(() => setDq(q), 200); return () => clearTimeout(t); }, [q]);
  const groups = useAsync(() => api.listGroups(), []);
  const users = useAsync(() => api.listUsers(), []);
  const posts = useAsync(() => api.listPosts(), []);
  const events = useAsync(() => api.listEvents(), []);

  const needle = dq.trim().toLowerCase();
  const has = (...xs) => !needle || xs.some((x) => String(x || '').toLowerCase().includes(needle));
  const postText = (p) => [p.caption, p.author?.name, p.group?.name, ...(p.categories || []), ...(p.slides || []).map((x) => x.text),
    p.event_title, p.event_address, p.event_city, ...(p.space_functions || [])];
  const postMatch = (p) => has(...postText(p));

  const localGroups = (groups.data || []).filter((g) => inPlace(g, place));
  // Folk i ett område = de som är med i grupperna där (var man själv bor syns bara för en själv).
  const memberIds = new Set(localGroups.flatMap((g) => g.member_ids || []));
  const people = (users.data || []).filter((u) => (place.level === 'world' || memberIds.has(u.id)) && has(u.name));
  const localPosts = (posts.data || []).filter((p) => inPlace(postPlace(p), place) && postMatch(p));
  const lists = {
    grupper: localGroups.filter((g) => has(g.name, g.description, g.city, g.region, g.address)),
    folk: people,
    poster: localPosts,
    finansiering: localPosts.filter((p) => postType(p) === 'finansiering'),
    lokaler: localPosts.filter((p) => postType(p) === 'lokal'),
    evenemang: (events.data || []).filter((p) => inPlace(postPlace(p), place) && postMatch(p)),
    minne: localPosts.filter((p) => p.memory_count > 0).sort((a, b) => b.memory_count - a.memory_count),
  };
  const loading = { grupper: groups, folk: users, evenemang: events }[tab] || posts;
  const items = lists[tab];
  const where = placeLabel(place);
  const what = { grupper: 'grupper', folk: 'personer', poster: 'poster', finansiering: 'finansiering', lokaler: 'lokaler', evenemang: 'kommande evenemang', minne: 'sparat i minnet' }[tab];
  const empty = html`<p class="empty">${needle ? `Inga ${what} i ${where} som matchar ”${dq.trim()}”.` : `Inga ${what} i ${where} än.`}
    ${canZoomOut(place) && html`<br /><span class="small">Tryck på <b>‹</b> uppe till vänster för att söka i ${placeLabel(zoomOut(place))}.</span>`}</p>`;

  return html`<div class="page search-page">
    <header class="topbar brand"><${PlaceSwitcher} groups=${groups.data || []} /></header>
    <p class="search-hint">Välj område uppe till vänster – stadsdel, stad, region, land eller hela världen – och skriv för att hitta det du letar efter där.</p>
    <div class="searchbar"><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${`Sök i ${where}`} aria-label=${`Sök i ${where}`} /></div>
    <div class="filterbar search-tabs" role="tablist">${SEARCH_TABS.map(([k, label]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => choose(k)}>
      ${label}${(k === 'folk' ? users.data && groups.data : k === 'grupper' ? groups.data : k === 'evenemang' ? events.data : posts.data) ? html` <span class="tab-n">${lists[k].length}</span>` : ''}</button>`)}</div>
    ${loading.error ? html`<${ErrorBox} error=${loading.error} />` : (loading.loading && !loading.data) || (tab === 'folk' && !groups.data) ? html`<${Loading} />`
      : tab === 'grupper' ? html`<div class="list">
          <a class="row" href="#/ny-grupp"><span class="avatar plus">+</span><span class="row-main"><strong>Skapa ny grupp</strong></span></a>
          ${items.map((g) => html`<${GroupRow} key=${g.id} group=${g} onChange=${groups.reload} />`)}</div>${!items.length && empty}`
      : tab === 'folk' ? (items.length ? html`<div class="list">${items.map((u) => html`<${UserRow} key=${u.id} user=${u} />`)}</div>` : empty)
      : tab === 'evenemang' ? html`<${EventsList} place=${place} match=${postMatch} subscribe=${false} empty=${empty} />`
      : items.length ? html`<${PostGrid} posts=${items} showAuthor />` : empty}
  </div>`;
}

// Gruppernas ikoner i en rad som går att scrolla åt höger; fler laddas in när man närmar sig slutet.
function GroupIcons({ groups, canAdd }) {
  const [shown, setShown] = useState(24);
  const more = (e) => {
    const el = e.currentTarget;
    if (shown < groups.length && el.scrollLeft + el.clientWidth > el.scrollWidth - 120) setShown((n) => n + 24);
  };
  return html`<div class="group-icons" onScroll=${more} aria-label="Grupper">
    ${canAdd && html`<a class="group-add" href="#/valkommen" title="Gå med i eller skapa en grupp" aria-label="Gå med i eller skapa en grupp">+</a>`}
    ${groups.slice(0, shown).map((g) => html`<a href=${'#/grupp/' + g.id} key=${g.id} title=${g.name + (g.role === 'admin' ? ' (admin)' : '')}>
      <${Avatar} src=${g.avatar_url} name=${g.name} size=${44} /></a>`)}
  </div>`;
}

export function Profile({ id }) {
  const s = useStore();
  const u = useAsync(() => api.getUser(id), [id]);
  const posts = useAsync(() => api.listPosts({ authorId: id }), [id]);
  const isMe = id === s.me.id;
  const [reporting, setReporting] = useState(false);
  const [inviting, setInviting] = useState(false);
  if (u.loading && !u.data) return html`<div class="page"><${Header} title="" back=${!isMe} /><${Loading} /></div>`;
  if (u.error) return html`<div class="page"><${Header} title="" back /><${ErrorBox} error=${u.error} /></div>`;
  const user = u.data;
  async function logout() { await api.signOut(); await refreshMe(); go('/'); }
  const editorAct = async (fn, msg) => { if (await attempt(fn, msg)) { await refreshMe(); u.reload(); } };
  return html`<div class="page">
    <${Header} title=${user.name} back=${!isMe} right=${!isMe ? html`<${MoreMenu} items=${[
        !s.me.is_editor && ['Anmäl användaren', () => setReporting(true)],
        s.me.is_editor && (user.is_editor
          ? ['Ta bort ur Redaktionen', () => confirm(`Ta bort ${user.name} ur Redaktionen?`) && editorAct(() => api.setEditor(id, false), `${user.name} är inte längre med i Redaktionen`)]
          : user.editor_invited ? ['Inbjuden till Redaktionen – väntar på svar', null]
          : ['Lägg till i Redaktionen', () => setInviting(true)]),
        s.me.is_editor && ['Ta bort användaren', async () => { if (await editorDelete('user', id, `användaren ${user.name} och allt hen lagt upp`)) go('/'); }, 'danger'],
      ]} />` : html`<span class="profile-tools">
      <a class="iconbtn" href="#/sok" aria-label="Sök" title="Sök"><${Icon} name="search" /></a>
      ${(s.badges.todos > 0 || s.me.is_editor) && html`<a class="iconbtn" href="#/att-gora" aria-label="Checklista" title="Checklista"><${Icon} name="check" /><${Count} n=${s.badges.todos} /></a>`}
      <a class="iconbtn" href="#/notiser" aria-label="Notiser" title="Notiser"><${Icon} name="bell" /><${Count} n=${s.badges.notifications} /></a>
      <a class="iconbtn" href="#/meddelanden" aria-label="Meddelanden" title="Meddelanden"><${Icon} name="chat" /><${Count} n=${s.badges.messages} /></a></span>`} />
    <div class="profile-head">
      <${Avatar} src=${user.avatar_url} name=${user.name} size=${84} />
      <div class="stats">
        <div><b>${posts.data?.length ?? '–'}</b><span>inlägg</span></div>
        <div><b>${user.groups.length}</b><span>grupper</span></div>
      </div>
    </div>
    <div class="profile-info"><strong>${user.name}</strong>
      ${user.is_editor && html`<a class="role-badge" href="#/hjalp" title="Redaktionen modererar plattformen">Redaktionen</a>`}</div>
    ${(isMe || user.groups.length > 0) && html`<${GroupIcons} groups=${user.groups} canAdd=${isMe} />`}
    <div class="profile-actions">
      ${isMe
        ? html`<a class="btn" href="#/redigera-profil">Profil och inställningar</a><button class="btn" onClick=${logout}>Logga ut</button>`
        : html`<a class="btn primary" href=${'#/meddelanden/' + id}>Skicka meddelande</a>`}
    </div>
    ${isMe && html`<${PushSetting} />`}
    ${isMe && html`<${CalendarSetting} prompt />`}
    ${isMe && user.groups.length === 0 && html`<p class="muted small pad-x">Du är inte med i någon grupp än – tryck på <b>+</b> för att gå med i en eller skapa en ny.</p>`}
    <div class="grid-sep"></div>
    ${posts.data ? html`<${PostGrid} posts=${posts.data} />` : html`<${Loading} />`}
    ${inviting && html`<${AddEditorConfirm} user=${user} onClose=${() => setInviting(false)} onDone=${() => { setInviting(false); u.reload(); }} />`}
    ${reporting && html`<${ReportForm} kind="user" id=${id} name=${user.name} onClose=${() => setReporting(false)} />`}
  </div>`;
}

// Visas när man kommer från länken i "återställ lösenord"-mejlet.
export function NewPassword() {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api.setNewPassword(pw);
      setState({ recovering: false });
      toast('Lösenordet är ändrat');
      go('/');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return html`<div class="auth">
    <img class="auth-logo" src="icon.svg" alt="" width="72" height="72" />
    <h1 class="logo big">Omställningsplatser<small class="logo-sub">Småskaliga omkonfigurationer av samhället</small></h1>
    <form class="form card" onSubmit=${submit}>
      <p><strong>Välj ett nytt lösenord</strong></p>
      <label>Nytt lösenord<input required type="password" minlength="6" autocomplete="new-password" value=${pw} onInput=${(e) => setPw(e.target.value)} autofocus /></label>
      ${err && html`<p class="error">${err}</p>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Sparar…' : 'Spara lösenordet'}</button>
    </form>
  </div>`;
}

// Notiser + siffra på appikonen, även när appen är stängd (push). På iPhone fungerar det bara i appen sparad på hemskärmen.
const urlB64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
// Notiser. På profilsidan visas bara en vänlig fråga om de inte är påslagna (och den går att avböja);
// i Redigera profil finns inställningen alltid, så att man kan slå på eller stänga av.
const PUSH_DISMISSED = 'push-fraga-avbojd';
function PushSetting({ settings = false }) {
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem(PUSH_DISMISSED); } catch { return false; } });
  const supported = api.mode === 'supabase' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const [state, setState2] = useState('laddar');
  useEffect(() => {
    if (!supported) return setState2('nej');
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState2(s && Notification.permission === 'granted' ? 'på' : Notification.permission === 'denied' ? 'nekad' : 'av'));
  }, []);
  const dismiss = () => { try { localStorage.setItem(PUSH_DISMISSED, '1'); } catch { /* ok */ } setDismissed(true); };
  if (!supported) {
    if (settings && !(ios && !standalone)) return html`<div class="setting-row"><span class="muted">${api.mode === 'demo' ? 'Notiser fungerar inte i demoläget.' : 'Notiser fungerar inte i den här webbläsaren.'}</span></div>`;
    if (!(ios && !standalone) || (!settings && dismissed)) return null;
    return html`<div class=${settings ? 'setting-row' : 'nudge badge-setting'}><span>På iPhone fungerar notiser bara i appen sparad på hemskärmen – i Safari frågar telefonen aldrig.
      ${settings && html`<ol class="howto"><li>Tryck på <b>Dela ⬆︎</b> och välj <b>Lägg till på hemskärmen</b>.</li><li>Öppna appen från ikonen på hemskärmen.</li>
        <li>Gå hit igen (Profil och inställningar) och tryck <b>Slå på</b> – då frågar telefonen om lov.</li></ol>`}</span>
      ${!settings && html`<button class="btn small" onClick=${dismiss}>Inte nu</button>`}</div>`;
  }
  async function on() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState2(perm === 'denied' ? 'nekad' : 'av');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(VAPID_PUBLIC_KEY) });
      await api.savePushSubscription(sub);
      setState2('på'); toast('Notiser är på'); refreshBadges();
    } catch (e) { toast('Det gick inte att slå på notiser: ' + e.message); }
  }
  async function off() {
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) { await api.removePushSubscription(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
    setState2('av'); toast('Notiser är avstängda');
  }
  if (state === 'laddar') return null;
  if (!settings) {
    if (state !== 'av' || dismissed) return null;
    return html`<div class="nudge badge-setting">
      <span>Vill du få notiser om nya meddelanden och ansökningar, och en siffra på appikonen?</span>
      <span class="btnrow"><button class="btn small primary" onClick=${on}>Slå på</button><button class="btn small" onClick=${dismiss}>Inte nu</button></span>
    </div>`;
  }
  return html`<div class="setting-row">
    ${state === 'på' ? html`<span><b>Notiser är på.</b> Du får besked om nya meddelanden och ansökningar, och en siffra på appikonen.</span><button class="btn small" onClick=${off}>Stäng av</button>`
      : state === 'nekad' ? html`<span><b>Notiser är blockerade för appen.</b> Du har tidigare tackat nej, så appen får inte fråga igen – du slår på dem själv:
          <ol class="howto">${blockedSteps().map((t) => html`<li>${t}</li>`)}</ol>
          <button class="btn small" onClick=${() => location.reload()}>Jag har slagit på dem – kolla igen</button></span>`
      : html`<span><b>Notiser är av.</b> Tryck <b>Slå på</b> så frågar ${ios ? 'telefonen' : 'webbläsaren'} om lov – svara <b>Tillåt</b>. Då får du besked om nya meddelanden och ansökningar, och en siffra på appikonen.</span><button class="btn small primary" onClick=${on}>Slå på</button>`}
  </div>`;
}

// Var man slår på notiser igen efter att ha tackat nej – olika för varje telefon och webbläsare.
function blockedSteps(ua = navigator.userAgent) {
  const B = (t) => html`<b>${t}</b>`;
  const bar = html`${B('adressfältet')} – fältet högst upp i webbläsaren där webbadressen (osaisacson.github.io/…) står`;
  const mac = /Macintosh/i.test(ua), win = /Windows/i.test(ua);
  const system = mac ? html`Får du ändå inga notiser: öppna ${B('Systeminställningar → Notiser')}, välj din webbläsare och slå på ${B('Tillåt notiser')}.`
    : win ? html`Får du ändå inga notiser: öppna ${B('Inställningar → System → Meddelanden')} och slå på dem för din webbläsare.` : null;
  if (/iphone|ipad/i.test(ua) || (mac && navigator.maxTouchPoints > 1)) return [
    html`Öppna appen ${B('Inställningar')} på telefonen (den grå med kugghjulet).`, html`Tryck på ${B('Notiser')} och leta upp ${B('Omställningsplatser')} i listan.`,
    html`Slå på ${B('Tillåt notiser')} (och gärna ${B('Symboler')} för siffran på ikonen).`, 'Gå tillbaka hit och tryck på knappen nedan.'];
  if (/android/i.test(ua)) return [
    html`Håll fingret på appikonen ${B('Omställningsplatser')} och tryck på ${B('ⓘ')} (Appinformation) – eller öppna sidan i Chrome och tryck på ${B('⋮')} → ${B('ⓘ')}.`,
    html`Välj ${B('Aviseringar')} eller ${B('Behörigheter → Aviseringar')}.`, html`Slå på ${B('Tillåt')}.`, 'Gå tillbaka hit och tryck på knappen nedan.'];
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|Firefox/i.test(ua)) return [
    html`Välj ${B('Safari → Inställningar…')} i menyraden högst upp på skärmen och klicka på fliken ${B('Webbplatser')}.`,
    html`Välj ${B('Notiser')} i listan till vänster och ändra ${B('osaisacson.github.io')} till ${B('Tillåt')}.`, system, 'Tryck på knappen nedan.'].filter(Boolean);
  return [
    html`Klicka på den lilla symbolen längst till vänster i ${bar}. Det är ett ${B('lås')} eller två små ${B('reglage')}.`,
    html`Leta upp ${B('Aviseringar')} (eller ${B('Notiser')}) i rutan som öppnas och ändra till ${B('Tillåt')}.`, system, 'Tryck på knappen nedan.'].filter(Boolean);
}

export function EditProfile({ section }) {
  const s = useStore();
  useEffect(() => { if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); }, [section]);
  const [name, setName] = useState(s.me.name);
  const [file, setFile] = useState(null);
  const [home, setHome] = useState(() => (s.me.home ? { ...emptyHome(), ...s.me.home } : emptyHome()));
  const groups = useAsync(() => api.listGroups(), []);
  async function save(e) {
    e.preventDefault();
    const changed = home.country && JSON.stringify(home) !== JSON.stringify(s.me.home ? { ...emptyHome(), ...s.me.home } : emptyHome());
    if (changed && checkHome(home)) return toast(checkHome(home));
    if (await attempt(() => api.updateProfile({ name, avatarFile: file, home: changed ? home : undefined }), 'Profilen sparades')) {
      await refreshMe(); go('/profil/' + s.me.id);
    }
  }
  async function leave(g) {
    const msg = g.role === 'admin'
      ? `Lämna ${g.name}? Är du gruppens enda admin blir den som varit med längst admin.`
      : `Lämna ${g.name}?`;
    if (confirm(msg) && await attempt(() => api.leaveGroup(g.id), `Du har lämnat ${g.name}`)) await refreshMe();
  }
  return html`<div class="page">
    <${Header} title="Profil och inställningar" back />
    <form class="form pad" onSubmit=${save}>
      <${ImagePicker} current=${s.me.avatar_url} name=${s.me.name} onFile=${setFile} label="Byt profilbild" />
      <label>Namn<input required value=${name} onInput=${(e) => setName(e.target.value)} /></label>
      <${HomePlaceFields} value=${home} onChange=${setHome} groups=${groups.data} />
      <small class="muted">Ingen kan se var du bor. Platsen bestämmer var appen startar, och stadsdelen kan synas som ett val i platslistan – aldrig kopplad till dig.</small>
      <button class="btn primary block">Spara</button>
    </form>
    <h2 class="settings-title" id="kalender-rubrik">Kalender</h2>
    <div class="pad-x settings-block"><${CalendarSetting} /></div>
    <h2 class="settings-title">Notiser</h2>
    <div class="pad-x settings-block"><${PushSetting} settings /></div>
    ${s.me.is_editor && html`<h2 class="settings-title">Redaktionen</h2>
      <div class="pad-x settings-block"><div class="setting-row"><span>Du är med i Redaktionen och kan hantera anmälningar och ta bort innehåll.</span>
        <button class="btn small" onClick=${async () => { if (confirm('Lämna Redaktionen? Någon i Redaktionen kan lägga till dig igen.') && await attempt(() => api.setEditor(s.me.id, false), 'Du har lämnat Redaktionen')) await refreshMe(); }}>Lämna</button></div></div>`}
    ${s.myGroups.length > 0 && html`<h2 class="settings-title">Dina grupper</h2>
    <div class="list">${s.myGroups.map((g) => html`<div class="row" key=${g.id}>
      <a href=${'#/grupp/' + g.id}><${Avatar} src=${g.avatar_url} name=${g.name} size=${40} /></a>
      <a class="row-main" href=${'#/grupp/' + g.id}><strong>${g.name}</strong><small class="muted">${g.role === 'admin' ? 'Admin' : 'Medlem'}</small></a>
      ${g.locked ? html`<small class="muted">Via Redaktionen</small>` : html`<button class="btn small" onClick=${() => leave(g)}>Lämna</button>`}</div>`)}</div>`}
  </div>`;
}
