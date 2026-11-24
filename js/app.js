// Startpunkt: enkel hash-router (#/sökväg) + bottenmenyn.
import { html, render, useState, useEffect, Component } from './lib.js';
import { api } from './api/index.js';
import { useStore, refreshMe, refreshBadges, refreshAll, toast } from './store.js';
import { Icon, Avatar, Count } from './ui.js';
import { Home, PostView, Compose } from './views/feed.js';
import { GroupView, GroupSettings, NewGroup, Welcome } from './views/groups.js';
import { AuthView, Search, Profile, EditProfile, NewPassword } from './views/people.js';
import { Notifications, Todos, Inbox, Thread, NewMessage, NewChat, ChatView } from './views/inbox.js';
import { MapView } from './views/map.js';
import { Help, Feedback, FeedbackView } from './views/help.js';
import { InstallSheet } from './install.js';
import { RolePrompts } from './views/roles.js';
import { Memory } from './views/memory.js';
import { startVisits } from './visits.js';

startVisits();

function parse() {
  let h = location.hash.slice(1);
  // Länkar från inloggningsmejl (#access_token=…, #error=…) är inga sidor i appen.
  if (/(^|&)(access_token|error|error_description)=/.test(h)) h = '/';
  const [path, qs] = (h || '/').split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}

function route({ parts: [a, b, c], query }) {
  switch (a) {
    case undefined: return html`<${Home} />`;
    case 'hjalp': return html`<${Help} />`;
    case 'feedback': return b ? html`<${FeedbackView} id=${b} />` : html`<${Feedback} />`;
    case 'sok': return html`<${Search} tab=${query.get('flik')} tags=${query.get('tagg')} />`;
    case 'minne': return html`<${Memory} theme=${b ? decodeURIComponent(b) : null} />`;
    case 'ny': return html`<${Compose} groupId=${query.get('grupp')} type=${query.get('typ')} />`;
    case 'notiser': return html`<${Notifications} />`;
    case 'karta': return html`<${MapView} />`;
    case 'kalender': return html`<${Home} tab="evenemang" />`;   // gamla länkar
    case 'profil': return html`<${Profile} id=${b} />`;
    case 'redigera-profil': return html`<${EditProfile} section=${query.get('del')} />`;
    case 'grupp': return c === 'installningar' ? html`<${GroupSettings} id=${b} />` : html`<${GroupView} id=${b} />`;
    case 'ny-grupp': return html`<${NewGroup} next=${query.get('next')} />`;
    case 'valkommen': return html`<${Welcome} />`;
    case 'post': return c === 'redigera' ? html`<${Compose} editId=${b} />` : html`<${PostView} id=${b} />`;
    case 'meddelanden': return b === 'ny' ? html`<${NewMessage} />` : b === 'flera' ? html`<${NewChat} />` : b ? html`<${Thread} userId=${b} />` : html`<${Inbox} />`;
    case 'samtal': return html`<${ChatView} chatId=${b} key=${b} />`;
    case 'att-gora': return html`<${Todos} />`;
    default: return html`<p class="empty">Sidan finns inte. <a href="#/">Till flödet</a></p>`;
  }
}

function BottomNav({ r }) {
  const s = useStore();
  const [a, b] = r.parts;
  // På mobilen en meny längst ner; på surfplatta och dator en meny till vänster med text (se app.css).
  const item = (href, label, on, icon, n, cls = '') => html`<a href=${href} aria-label=${label} title=${label} class=${(on ? 'on ' : '') + cls}>${icon}<${Count} n=${n} /><span class="nav-label">${label}</span></a>`;
  // Mobilen: Hem, Minne, + (i mitten), ?, Profil. Sök sitter uppe till höger. Karta, meddelanden och checklista finns överst i flödet där.
  return html`<nav class="bottomnav">
    <a class="nav-logo desk" href="#/" aria-hidden="true" tabindex="-1"><img src="icon.svg" alt="" width="32" height="32" /><span class="nav-label">Omställningsplatser</span></a>
    ${item('#/', 'Hem', !a, html`<${Icon} name="home" size=${26} />`)}
    ${item('#/minne', 'Minne', a === 'minne', html`<${Icon} name="memory" size=${26} />`)}
    ${item('#/sok', 'Sök', a === 'sok', html`<${Icon} name="search" size=${26} />`, 0, 'desk')}
    ${item('#/karta', 'Karta', a === 'karta', html`<${Icon} name="map" size=${26} />`, 0, 'desk')}
    ${item('#/meddelanden', 'Meddelanden', a === 'meddelanden', html`<${Icon} name="chat" size=${26} />`, s.badges.messages, 'desk')}
    ${item('#/notiser', 'Notiser', a === 'notiser', html`<${Icon} name="bell" size=${26} />`, s.badges.notifications, 'desk')}
    ${(s.badges.todos > 0 || s.me.is_editor) && item('#/att-gora', 'Checklista', a === 'att-gora', html`<${Icon} name="check" size=${26} />`, s.badges.todos, 'desk')}
    ${item('#/ny', 'Nytt inlägg', a === 'ny', html`<span class="nav-new-btn"><${Icon} name="add" size=${26} /></span>`, 0, 'nav-new')}
    ${item('#/hjalp', 'Hjälp och feedback', a === 'hjalp' || a === 'feedback', html`<${Icon} name="help" size=${26} />`)}
    ${item('#/profil/' + s.me.id, 'Profil', a === 'profil' && b === s.me.id, html`<span class="nav-avatar"><${Avatar} src=${s.me.avatar_url} name=${s.me.name} size=${26} /></span>`)}
  </nav>`;
}

// Dra ner överst på sidan för att uppdatera, som i Instagram: sidan följer fingret (allt trögare ju längre man drar),
// en ring fylls i glappet, och släpper man efter tröskeln snurrar den medan allt hämtas om i bakgrunden.
// Sidan laddas inte om, så man stannar där man är. I Safari utanför hemskärmsappen sköter webbläsaren det själv.
const PTR_AT = 60;     // hur långt man måste dra (efter tröghet)
const PTR_HOLD = 52;   // där sidan stannar medan det uppdateras
function usePullToRefresh(onRefresh) {
  const [st, setSt] = useState({ y: 0, state: 'idle' });   // idle | pull | busy | back
  useEffect(() => {
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (ios && !standalone) return;
    let startY = null, startX = 0, y = 0, busy = false, locked = false;
    const down = (e) => {
      if (busy || window.scrollY > 0 || document.body.classList.contains('locked') || e.touches.length !== 1) return;
      if (e.target.closest('input, textarea, select, .map-box, .modal, .sheet, .carousel, .dd-bg, .combo-list, .ta-list')) return;
      // Inne i något som skrollar för sig själv (t.ex. en lista) är det den som ska skrollas, inte sidan som ska uppdateras.
      for (let el = e.target; el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) return;
        // Sidledes listor (grupperna överst, medlemmar): där är det sidledes skroll som gäller.
        if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX)) return;
      }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX; y = 0; locked = false;
    };
    const move = (e) => {
      if (startY == null) return;
      const d = e.touches[0].clientY - startY;
      // Rör sig fingret mest åt sidan är det inte en nerdragning – släpp den direkt så att inget annat störs.
      if (!locked) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        if (dx < 8 && Math.abs(d) < 8) return;
        if (dx > Math.abs(d)) { startY = null; if (y) setSt({ y: 0, state: 'idle' }); y = 0; return; }
        locked = true;
      }
      if (d <= 0 || window.scrollY > 0) { if (y) setSt({ y: 0, state: 'idle' }); y = 0; return; }
      y = Math.min(130, d < 110 ? d * 0.6 : 66 + (d - 110) * 0.25);   // gummibandskänsla: allt trögare ju längre man drar
      setSt({ y, state: 'pull' });
    };
    const up = async () => {
      if (startY == null) return;
      startY = null;
      if (y < PTR_AT) { setSt({ y: 0, state: 'back' }); return; }
      busy = true;
      if (navigator.vibrate) navigator.vibrate(8);
      setSt({ y: PTR_HOLD, state: 'busy' });
      await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 700))]);
      setSt({ y: 0, state: 'back' });
      busy = false;
    };
    addEventListener('touchstart', down, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', up);
    addEventListener('touchcancel', up);
    return () => { removeEventListener('touchstart', down); removeEventListener('touchmove', move); removeEventListener('touchend', up); removeEventListener('touchcancel', up); };
  }, []);
  return st;
}

function PullIndicator({ y, state }) {
  const p = Math.min(1, y / PTR_AT);
  const r = 9, c = 2 * Math.PI * r;
  return html`<div class=${'ptr ' + state} style=${`opacity:${state === 'busy' ? 1 : p}; transform: translateY(${Math.max(0, y - 40)}px) scale(${0.6 + 0.4 * p})`} aria-hidden="true">
    <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r=${r} fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
      stroke-dasharray=${c} stroke-dashoffset=${state === 'busy' ? c * 0.72 : c * (1 - p * 0.9)} transform="rotate(-90 13 13)" /></svg>
  </div>`;
}

// Samma vänliga laddningstexter som i index.html, medan inloggningen kollas.
function Splash() {
  const list = window.LADDNING || ['Laddar…'];
  const [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => { const t = setInterval(() => setI((x) => x + 1), 1500); return () => clearInterval(t); }, []);
  return html`<div class="splash"><img src="icon.svg" alt="" width="56" height="56" /><p key=${i}>${list[i % list.length]}</p></div>`;
}

// Fångar fel på en sida så att appen inte blir en vit, fryst skärm.
class Safe extends Component {
  constructor() { super(); this.state = { error: null }; }
  componentDidCatch(error) { console.error(error); this.setState({ error }); }
  render() {
    if (!this.state.error) return this.props.children;
    return html`<div class="crash">
      <h2>Något gick fel på den här sidan</h2>
      <p class="muted">${String(this.state.error?.message || this.state.error).slice(0, 160)}</p>
      <div class="btnrow"><a class="btn primary" href="#/" onClick=${() => this.setState({ error: null })}>Till flödet</a>
        <button class="btn" onClick=${() => location.reload()}>Ladda om</button></div>
    </div>`;
  }
}

function App() {
  const s = useStore();
  const [r, setR] = useState(parse());
  const [ready, setReady] = useState(false);
  const pull = usePullToRefresh(() => Promise.all([refreshAll(), refreshMe().catch(() => {}), refreshBadges()]));
  useEffect(() => {
    const onHash = () => {
      setR(parse()); window.scrollTo(0, 0); refreshBadges();
      document.body.classList.remove('locked');   // en meny som var öppen när man bytte sida ska inte låsa skärmen
    };
    const linkError = api.takeLinkError?.() || new URLSearchParams(location.hash.slice(1)).get('error_description');
    if (linkError) {
      toast(/expired|invalid/i.test(linkError) ? 'Länken har gått ut eller redan använts. Be om en ny.' : linkError);
      history.replaceState(null, '', location.pathname);
    }
    addEventListener('hashchange', onHash);
    refreshMe().catch(console.error).finally(() => setReady(true));
    const off = api.onAuthChange(() => refreshMe());
    const t = setInterval(() => { if (!document.hidden) refreshBadges(); }, 60000);
    const onVisible = () => { if (!document.hidden) refreshBadges(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { removeEventListener('hashchange', onHash); off(); clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (!ready) return html`<${Splash} />`;
  return html`<div class="app">
    ${s.recovering ? html`<${NewPassword} />` : s.me ? html`<${PullIndicator} ...${pull} />
      <main key=${r.path + '?' + r.query} style=${pull.y ? `transform: translateY(${pull.y}px)` : ''} data-ptr=${pull.state} class=${['karta', 'grupp', 'profil', undefined].includes(r.parts[0]) && r.parts[2] !== 'installningar' ? 'wide' : ''} data-page=${r.parts[0] || 'hem'}><${Safe}>${route(r)}<//></main><${BottomNav} r=${r} />` : html`<${AuthView} />`}
    <${InstallSheet} />
    ${s.me && html`<${RolePrompts} />`}
    ${s.toast && html`<div class="toast" role="status">${s.toast}</div>`}
  </div>`;
}

const root = document.getElementById('root');
root.textContent = '';   // den statiska laddningstexten från index.html ersätts av appens egen
render(html`<${App} />`, root);

// Service worker för push-notiser (och siffran på appikonen när appen är stängd)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
