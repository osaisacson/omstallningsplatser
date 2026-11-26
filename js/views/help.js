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
    <p>Vi lever i en tid som präglas av ett akut behov av förändring. Vi behöver omorientera samhället mot ett annat mål, där vi fokuserar på att både hålla oss inom planetens gränser och att ge alla en god levnadsstandard.
      Men en sådan omställning är ingen liten uppgift. I praktiken innebär det att nästan allt behöver bli annorlunda än i dag:</p>
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
    <li><b>Finansiering och resurser</b> avtalas direkt mellan grupperna. Plattformen hanterar inga pengar och ansvarar inte för överenskommelser mellan användare.</li>
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
    <a class="feedback-banner" href="#/o/feedback">
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

// ---------- Delar som forumet (js/views/forum.js) använder: röster, skrivfält och kommentarer i trådar ----------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function Votes({ f, onChange }) {
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

// Skrivfältet för kommentarer och svar: litet tills man trycker i det.
export function Reply({ onSend, onCancel, autofocus = false, placeholder = 'Lägg till en kommentar' }) {
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

export function Comment({ c, kids, me, editor, feedbackId, reload }) {
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
