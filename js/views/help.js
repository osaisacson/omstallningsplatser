// Frågetecknet: feedback, om plattformen, Redaktionen, finansiering och det juridiska.
import { EDITOR_POWERS } from './roles.js';
import { html, useState } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, useAsync, go, attempt, toast } from '../store.js';
import { Icon, Avatar, Header, Loading, ErrorBox, linkify, ReportForm } from '../ui.js';
import { timeAgo } from '../util.js';
import { CONTACT_EMAIL } from '../config.js';

const OPEN_COLLECTIVE = 'https://opencollective.com/post-growth-sverige';

export function About() {
  return html`<div class="about">
    <blockquote><p>Growth has costs as well as benefits, but we usually don’t count the costs.</p><cite>Meadows (1999)</cite></blockquote>
    <blockquote><p>Earth is now well outside of the safe operating space for humanity.</p><cite>Richardson et al. (2023)</cite></blockquote>
    <p>Vi lever i en tid som definieras av ett pressande behov av omställning - en omställning till att leva inom planetens gränser och samtidigt ge alla en god levnadsstandard.
      Men att ställa om ett helt samhälle är ett enormt åtagande. I praktiken betyder det att nästan allt behöver bli annorlunda än i dag:</p>
    <blockquote><p>…everything will need to be different: different activities, different forms and uses of energy, different relations, different gender roles,
      different allocations of time between paid and non-paid work, different relations with the non-human world.</p><cite>Kallis et al. (2014, s. 33)</cite></blockquote>
    <p>En sådan omställning är inte lätt att föreställa sig, och samma lösning passar inte alla. Vi behöver hitta sätt att känna att det är hanterbart:
      jobba i en skala som går att greppa, och pröva oss fram till sätt som passar både förutsättningarna och människorna på platsen.</p>
    <p>Sverige har fler sådana omställningsplatser än man kanske tror – från ekobyar till byggemenskaper, från makerspaces till stödstrukturer,
      från konstnärskollektiv till odlingsgrupper. Alla undersöker, på ett eller annat sätt, hur man i praktiken kan göra${' '}<em>småskaliga omkonfigurationer av samhället</em>: hur vi kan bygga, bo, äta, producera, hantera energi och avfall, skapa rättvisa och relationer – annorlunda.</p>
    <p>Den här plattformen finns för att vi ska bli synliga för varandra och kunna dela det vi gör.</p>
    <p>För vi är fler än man tror, och tillsammans är vi starka. Hur äter man en elefant? <em>Bit för bit.</em></p>
  </div>`;
}

// Villkoren – visas på hjälpsidan och kan fällas ut när man skapar konto.
export const Terms = () => html`<div class="prose">
  <p>Omställningsplatser är en ideell, öppen plattform som drivs av Redaktionen. Den är gratis och har ingen reklam.</p>
  <ul>
    <li><b>Du måste vara minst 13 år</b> för att skapa ett konto.</li>
    <li><b>Du ansvarar för det du lägger upp.</b> Lägg bara upp sådant du har rätt att dela, och fråga innan du lägger upp bilder där andra syns.</li>
    <li><b>Inget olagligt, hatiskt, hotfullt eller trakasserande</b>, ingen spam och inga andras personuppgifter utan lov.</li>
    <li><b>Finansiering och lokaler</b> avtalas direkt mellan grupperna. Plattformen hanterar inga pengar och ansvarar inte för överenskommelser mellan användare.</li>
    <li><b>Redaktionen</b> kan ta bort inlägg, grupper och konton som bryter mot villkoren.</li>
    <li>Du kan när som helst radera ditt konto. Då försvinner din profil, dina inlägg, kommentarer och meddelanden.</li>
    <li>Ändras villkoren meddelar vi det i appen.</li>
  </ul>
</div>`;

function Section({ title, open = false, children }) {
  return html`<details class="help-sec" open=${open}><summary>${title}</summary><div class="help-body">${children}</div></details>`;
}

function Editors() {
  const s = useStore();
  const e = useAsync(() => api.listEditors(), []);
  return html`<p>Redaktionen modererar hela plattformen och syns som gruppen ${e.data?.groupId ? html`<a href=${'#/grupp/' + e.data.groupId}>Redaktion</a>` : 'Redaktion'}. Den som är med i Redaktionen kan</p>
    <ul>${EDITOR_POWERS.map((t) => html`<li>${t}</li>`)}</ul>
    <p>En grupp som saknar admin – till exempel om admin lämnar eller slutar använda appen – sköts av Redaktionen. En medlem kan be om att bli admin, och Redaktionen godkänner. Bara de som redan är med i Redaktionen kan lägga till nya, och den som bjuds in måste själv läsa och godkänna befogenheterna.</p>
    <p>Allt Redaktionen gör sparas i en gemensam historik som alla i Redaktionen ser och kan ångra.</p>
    ${e.loading && !e.data ? html`<${Loading} />` : html`<div class="list editors">${(e.data?.editors || []).map((u) => html`<a class="row" href=${'#/profil/' + u.id} key=${u.id}>
      <${Avatar} src=${u.avatar_url} name=${u.name} size=${36} /><span class="row-main"><strong>${u.name}${u.id === s.me.id ? ' (du)' : ''}</strong></span></a>`)}</div>`}
    ${s.me.is_editor && html`<p class="small muted">Lägg till någon: gå till personens profil och tryck <b>Lägg till i Redaktionen</b>.</p>`}`;
}

function DeleteAccount() {
  async function del() {
    if (!confirm('Radera ditt konto? Din profil, dina inlägg, kommentarer och meddelanden tas bort för gott. Det går inte att ångra.')) return;
    if (prompt('Skriv RADERA för att bekräfta.')?.trim().toUpperCase() !== 'RADERA') return toast('Kontot raderades inte.');
    if (await attempt(() => api.deleteMyAccount(), 'Ditt konto är raderat')) { location.hash = '#/'; location.reload(); }
  }
  return html`<p>Raderar du kontot tas din profil, plats, dina inlägg, kommentarer, meddelanden och röster bort direkt. Grupper du har skapat finns kvar för de andra medlemmarna.</p>
    <button class="btn danger" onClick=${del}>Radera mitt konto</button>`;
}

export function Help() {
  return html`<div class="page help">
    <${Header} title="Hjälp och info" />
    <a class="feedback-banner" href="#/feedback">
      <span class="fb-icon"><${Icon} name="chat" size=${26} /></span>
      <span><strong>Tyck till om appen</strong><small>Förslag, problem och idéer – rösta på det du också vill ha.</small></span>
      <span class="fb-go">›</span>
    </a>
    <${Section} title="Om Omställningsplatser" open><${About} /><//>
    <${Section} title="Redaktionen"><${Editors} /><//>
    <${Section} title="Finansiering av plattformen">
      <p>Plattformen föreslås drivas med frivilliga medlemskap och donationer via Open Collective, där alla inkomster och utgifter syns öppet.</p>
      <p><b>Vill du stötta oss?</b> <a href=${OPEN_COLLECTIVE} target="_blank" rel="noopener noreferrer">Till vår sida på Open Collective ›</a></p>
      <p class="small muted">Länken går just nu till Post Growth Sverige – den är bara ett exempel på hur detta kan hanteras.</p>
    <//>
    <${Section} title="Användarvillkor"><${Terms} /><//>
    <${Section} title="Integritet">
      <p>Vi samlar bara in det som behövs för att appen ska fungera: namn, e-post, profilbild och det du själv lägger upp. Ingen kan se var du bor – din stad och stadsdel kan synas som ett val i platslistan, men aldrig kopplat till dig.
        Vi säljer inga uppgifter, har ingen reklam och spårar dig inte.</p>
      <p><a href="integritet.html">Läs hela integritetspolicyn ›</a></p>
    <//>
    <${Section} title="Anmäla innehåll">
      <p>Ser du något som bryter mot villkoren? Tryck på <b>···</b> på inlägget och välj <b>Anmäl till Redaktionen</b>. Grupper och personer anmäler du längst ner på deras sidor.</p>
      <p>Anmälan går till Redaktionen. Den du anmäler får inte veta vem som anmälde. Är någon i fara eller är det ett brott – kontakta polisen.</p>
    <//>
    <${Section} title="Radera ditt konto"><${DeleteAccount} /><//>
    <${Section} title="Kontakt">
      <p>Frågor? Mejla <a href=${'mailto:' + CONTACT_EMAIL}>${CONTACT_EMAIL}</a>.</p>
      <p class="small muted">Omställningsplatser är öppen källkod: <a href="https://github.com/osaisacson/omstallningsplatser" target="_blank" rel="noopener noreferrer">github.com/osaisacson/omstallningsplatser</a></p>
    <//>
  </div>`;
}

// ---------- Feedback: som ett förenklat Reddit ----------
// Flikar efter status (Förslag, Planerade, Klara), alltid sorterade på röster och sedan nyast.
// Kommentarer i trådar: svara direkt under en kommentar.

const TABS = [['forslag', 'Förslag', null], ['planerad', 'Planerade', 'planerad'], ['klar', 'Klara', 'klar']];
const STATUS = [[null, 'Förslag'], ['planerad', 'Planerad'], ['klar', 'Klar']];
const StatusChip = ({ status }) => status ? html`<span class=${'fb-status ' + status}>${status === 'klar' ? '✓ Klar' : 'Planerad'}</span>` : null;
const byVotes = (a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Votes({ f, onChange }) {
  const [mine, setMine] = useState(f.my_vote);
  const score = f.score - f.my_vote + mine;
  async function vote(e, v) {
    e.preventDefault(); e.stopPropagation();
    const next = mine === v ? 0 : v;
    setMine(next);
    try { await api.voteFeedback(f.id, next); onChange?.(); } catch (err) { setMine(mine); toast(err.message); }
  }
  return html`<span class=${'votes' + (mine > 0 ? ' up' : mine < 0 ? ' down' : '')}>
    <button class="vote" aria-label="Rösta upp" aria-pressed=${mine > 0} onClick=${(e) => vote(e, 1)}><${Icon} name="up" size=${18} /></button>
    <span class="score">${score}</span>
    <button class="vote" aria-label="Rösta ner" aria-pressed=${mine < 0} onClick=${(e) => vote(e, -1)}><${Icon} name="down" size=${18} /></button>
  </span>`;
}

// "Skapa inlägg": ser ut som ett fält, öppnas till rubrik + beskrivning.
function NewFeedback({ onDone }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    const id = await attempt(() => api.createFeedback({ title, body }), 'Publicerat – nu kan andra rösta');
    setBusy(false);
    if (id) { setTitle(''); setBody(''); setOpen(false); onDone(); }
  }
  if (!open) return html`<button class="fb-compose-closed" onClick=${() => setOpen(true)}>
    <${Avatar} src=${s.me.avatar_url} name=${s.me.name} size=${32} /><span>Skriv ett förslag eller problem…</span></button>`;
  return html`<form class="fb-compose" onSubmit=${submit}>
    <input required autofocus maxlength="140" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="Rubrik – en sak per inlägg" aria-label="Rubrik" />
    <textarea required rows="4" maxlength="4000" value=${body} onInput=${(e) => setBody(e.target.value)} aria-label="Beskrivning"
      placeholder="Beskriv mer: vad vill du kunna göra, eller vad hände och vad hade du väntat dig?"></textarea>
    <div class="fb-compose-actions"><button type="button" class="btn small" onClick=${() => setOpen(false)}>Avbryt</button>
      <button class="btn small primary" disabled=${busy || title.trim().length < 3 || !body.trim()}>${busy ? 'Publicerar…' : 'Publicera'}</button></div>
  </form>`;
}

export function Feedback() {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('fb-tab') || 'forslag'; } catch { return 'forslag'; } });
  const list = useAsync(() => api.listFeedback(), []);
  const choose = (t) => { setTab(t); try { sessionStorage.setItem('fb-tab', t); } catch {} };
  const status = TABS.find(([k]) => k === tab)[2];
  const all = list.data || [];
  const items = all.filter((f) => (f.status || null) === status).sort(byVotes);
  const count = (st) => all.filter((f) => (f.status || null) === st).length;
  return html`<div class="page feedback">
    <${Header} title="Feedback" back />
    <p class="fb-intro">Förslag och problem med appen. <b>Rösta upp</b> det du också vill ha, <b>ner</b> det du tycker är en dålig idé, och kommentera för att utveckla.
      Redaktionen flyttar det som ska göras till <b>Planerade</b> och sedan till <b>Klara</b>.</p>
    <div class="fb-compose-wrap"><${NewFeedback} onDone=${() => { choose('forslag'); list.reload(); }} /></div>
    <div class="filterbar fb-tabs" role="tablist">${TABS.map(([k, label, st]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => choose(k)}>
      ${label}${list.data ? html` <span class="tab-n">${count(st)}</span>` : ''}</button>`)}</div>
    ${list.loading && !list.data ? html`<${Loading} />` : list.error ? html`<${ErrorBox} error=${list.error} />`
      : !items.length ? html`<p class="empty">${{ forslag: 'Inga förslag än – bli först!', planerad: 'Inget är planerat just nu.', klar: 'Inget är klart än.' }[tab]}</p>`
      : html`<div class="fb-list">${items.map((f) => html`<a class="fb-card" href=${'#/feedback/' + f.id} key=${f.id}>
          <span class="fb-meta"><${Avatar} src=${f.author?.avatar_url} name=${f.author?.name || '?'} size=${20} /> ${f.author?.name || 'Borttagen'} · ${timeAgo(f.created_at)}</span>
          <strong class="fb-title">${f.title}</strong>
          ${f.body && html`<span class="fb-excerpt">${f.body}</span>`}
          <span class="fb-bar"><${Votes} f=${f} onChange=${list.reload} />
            <span class="pill"><${Icon} name="chat" size=${16} /> ${f.comment_count}</span></span>
        </a>`)}</div>`}
  </div>`;
}

// Skrivfältet för kommentarer och svar: litet tills man trycker i det.
function Reply({ onSend, onCancel, autofocus = false, placeholder = 'Lägg till en kommentar' }) {
  const [open, setOpen] = useState(autofocus);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault(); setBusy(true);
    if (await onSend(body)) { setBody(''); setOpen(autofocus); onCancel?.(); }
    setBusy(false);
  }
  if (!open) return html`<button class="fb-reply-closed" onClick=${() => setOpen(true)}>${placeholder}</button>`;
  return html`<form class="fb-reply" onSubmit=${send}>
    <textarea autofocus rows="3" value=${body} onInput=${(e) => setBody(e.target.value)} placeholder=${placeholder} aria-label=${placeholder}></textarea>
    <div class="fb-compose-actions"><button type="button" class="btn small" onClick=${() => { setOpen(false); setBody(''); onCancel?.(); }}>Avbryt</button>
      <button class="btn small primary" disabled=${busy || !body.trim()}>${busy ? 'Skickar…' : placeholder.startsWith('Svara') ? 'Svara' : 'Kommentera'}</button></div>
  </form>`;
}

function Comment({ c, kids, me, editor, feedbackId, reload }) {
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const children = kids[c.id] || [];
  async function del() { if (confirm('Ta bort kommentaren och svaren under den?') && await attempt(() => api.deleteFeedbackComment(c.id))) reload(); }
  return html`<div class="fb-c">
    <div class="fb-c-head">
      <a href=${'#/profil/' + c.author.id}><${Avatar} src=${c.author.avatar_url} name=${c.author.name} size=${24} /></a>
      <a href=${'#/profil/' + c.author.id}><strong>${c.author.name}</strong></a> <span class="muted">· ${timeAgo(c.created_at)}</span>
    </div>
    <div class="fb-c-body">
      <button class="fb-thread-line" aria-label=${collapsed ? 'Visa svaren' : 'Dölj svaren'} onClick=${() => setCollapsed((x) => !x)}></button>
      <div class="fb-c-main">
        ${collapsed ? html`<button class="link small muted" onClick=${() => setCollapsed(false)}>Visa ${plural(children.length + 1, 'kommentar', 'kommentarer')}</button>` : html`
          <p>${linkify(c.body)}</p>
          <div class="fb-c-actions">
            <button onClick=${() => setReplying(true)}><${Icon} name="chat" size=${15} /> Svara</button>
            ${(c.author.id === me || editor) && html`<button onClick=${del}>Ta bort</button>`}
          </div>
          ${replying && html`<${Reply} autofocus placeholder=${'Svara ' + c.author.name.split(' ')[0]}
            onSend=${async (b) => { const ok = await attempt(() => api.commentFeedback(feedbackId, b, c.id)); if (ok) reload(); return ok; }} onCancel=${() => setReplying(false)} />`}
          ${children.map((k) => html`<${Comment} key=${k.id} c=${k} kids=${kids} me=${me} editor=${editor} feedbackId=${feedbackId} reload=${reload} />`)}`}
      </div>
    </div>
  </div>`;
}

export function FeedbackView({ id }) {
  const s = useStore();
  const f = useAsync(() => api.getFeedback(id), [id]);
  const [reporting, setReporting] = useState(false);
  const x = f.data;
  const mine = x?.author_id === s.me.id;
  const kids = {};
  for (const c of x?.comments || []) (kids[c.parent_id || 'root'] ||= []).push(c);
  async function del() {
    if (!confirm(mine ? 'Ta bort ditt inlägg?' : 'Ta bort inlägget som Redaktionen? Det syns i historiken.')) return;
    if (await attempt(() => api.deleteFeedback(id), 'Borttaget')) go('/feedback');
  }
  async function setStatus(st) {
    if ((x.status || null) === st) return;
    if (await attempt(() => api.setFeedbackStatus(id, st), st ? `Flyttat till ${st === 'klar' ? 'Klara' : 'Planerade'}` : 'Flyttat till Förslag')) f.reload();
  }
  return html`<div class="page feedback">
    <${Header} title="Feedback" back />
    ${f.loading && !x ? html`<${Loading} />` : f.error ? html`<${ErrorBox} error=${f.error} />` : html`
      <article class="fb-post">
        <span class="fb-meta"><${Avatar} src=${x.author?.avatar_url} name=${x.author?.name || '?'} size=${24} />
          <a href=${'#/profil/' + x.author?.id}>${x.author?.name}</a> · ${timeAgo(x.created_at)} <${StatusChip} status=${x.status} /></span>
        <h2>${x.title}</h2>
        <p class="fb-body">${linkify(x.body)}</p>
        <div class="fb-bar">
          <${Votes} f=${x} />
          <span class="pill"><${Icon} name="chat" size=${16} /> ${x.comments.length}</span>
          <span class="fb-more">
            ${(mine || s.me.is_editor) && html`<button class="link small muted" onClick=${del}>Ta bort</button>`}
            ${!mine && html`<button class="link small muted" onClick=${() => setReporting(true)}>Anmäl</button>`}
          </span>
        </div>
        ${s.me.is_editor && html`<div class="fb-status-set">
          <span class="muted small">Redaktionen:</span>
          <div class="seg" role="radiogroup" aria-label="Status">${STATUS.map(([st, label]) => html`<button role="radio" aria-checked=${(x.status || null) === st}
            class=${(x.status || null) === st ? 'on' : ''} onClick=${() => setStatus(st)}>${label}</button>`)}</div>
        </div>`}
      </article>
      <div class="fb-comments">
        <${Reply} onSend=${async (b) => { const ok = await attempt(() => api.commentFeedback(id, b)); if (ok) f.reload(); return ok; }} />
        ${!x.comments.length && html`<p class="muted small fb-none">Inga kommentarer än. Vad tycker du?</p>`}
        ${(kids.root || []).map((c) => html`<${Comment} key=${c.id} c=${c} kids=${kids} me=${s.me.id} editor=${s.me.is_editor} feedbackId=${id} reload=${f.reload} />`)}
      </div>
      ${reporting && html`<${ReportForm} kind="feedback" id=${id} name=${x.title.slice(0, 60)} onClose=${() => setReporting(false)} />`}`}
  </div>`;
}
