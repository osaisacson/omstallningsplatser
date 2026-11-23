// Roller: Redaktionen (modererar hela plattformen) och gruppadmins.
// Den som bjuds in till Redaktionen, eller godkänns som gruppadmin, måste läsa och bocka i vad det innebär först.
import { html, useState, useEffect } from '../lib.js';
import { api } from '../api/index.js';
import { useStore, attempt, refreshMe, refreshBadges, go } from '../store.js';
import { Modal } from '../ui.js';

export const EDITOR_POWERS = [
  'Ta bort inlägg, grupper och konton som bryter mot villkoren.',
  'Gå igenom anmälningar i Redaktionens checklista och bocka av dem.',
  'Ta hand om grupper som saknar admin, och godkänna eller avslå den som vill bli admin.',
  'Lägga till och ta bort personer i Redaktionen.',
  'Skapa, byta namn på och flytta kategorier i Minne.',
  'Sätta status på feedback (planerad, klar).',
  'Se Redaktionens historik och ångra det som går att ångra.',
];
export const ADMIN_POWERS = [
  'Ändra gruppens namn, beskrivning, bild och plats.',
  'Lägga till och ta bort medlemmar, och göra andra medlemmar till admins.',
  'Publicera inlägg som gruppen och ta bort inlägg i gruppen.',
  'Redaktionen kan ta bort innehåll och ändra admins om villkoren inte följs.',
  'Lämnar du gruppen, eller slutar använda appen, går gruppen tillbaka till Redaktionen.',
];

// En lista där varje rad måste bockas i innan man kan gå vidare.
function Checklist({ items, checked, setChecked }) {
  return html`<div class="role-list">${items.map((t, i) => html`<label class="check role-item" key=${i}>
    <input type="checkbox" checked=${!!checked[i]} onChange=${(e) => setChecked({ ...checked, [i]: e.target.checked })} /><span>${t}</span></label>`)}</div>`;
}

// Redaktionen lägger till någon: en varning som måste bockas i.
export function AddEditorConfirm({ user, onClose, onDone }) {
  const [ok, setOk] = useState(false);
  async function add() { if (await attempt(() => api.setEditor(user.id, true), `${user.name} är inbjuden till Redaktionen`)) onDone(); }
  return html`<${Modal} title="Lägg till i Redaktionen" onClose=${onClose}>
    <p>Den som är med i Redaktionen modererar hela plattformen och kan:</p>
    <ul class="role-powers">${EDITOR_POWERS.map((t) => html`<li>${t}</li>`)}</ul>
    <p class="small muted">${user.name} får en fråga och måste själv läsa och godkänna detta innan befogenheterna gäller.</p>
    <label class="check role-item"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} />
      <span>Jag förstår att ${user.name} får de här befogenheterna på hela plattformen.</span></label>
    <button class="btn primary block" disabled=${!ok} onClick=${add}>Bjud in till Redaktionen</button>
  <//>`;
}

// Be om att bli admin för en grupp utan admin.
export function AdminRequestForm({ group, onClose, onDone }) {
  const [msg, setMsg] = useState('');
  async function send(e) {
    e.preventDefault();
    if (await attempt(() => api.requestAdmin(group.id, msg), 'Skickat till Redaktionen')) onDone();
  }
  return html`<${Modal} title=${`Bli admin för ${group.name}?`} onClose=${onClose}>
    <form class="form" onSubmit=${send}>
      <p>Gruppen har ingen admin just nu, så Redaktionen tar hand om den. Vill du bli admin? Berätta kort om din roll i gruppen – Redaktionen läser och godkänner.</p>
      <label>Din roll i gruppen<textarea required minlength="3" rows="3" value=${msg} onInput=${(e) => setMsg(e.target.value)} placeholder="T.ex. Jag sitter i styrelsen och sköter våra kanaler."></textarea></label>
      <div class="btnrow"><button class="btn primary">Skicka till Redaktionen</button><button type="button" class="btn" onClick=${onClose}>Inte nu</button></div>
    </form>
  <//>`;
}

// Frågor som visas när appen öppnas: inbjudan till Redaktionen, och godkännande som gruppadmin att bekräfta.
export function RolePrompts() {
  const s = useStore();
  const [requests, setRequests] = useState([]);
  const [checked, setChecked] = useState({});
  useEffect(() => { if (s.me) api.myAdminRequests().then(setRequests, () => {}); }, [s.me?.id, s.badges.notifications]);
  if (!s.me) return null;
  if (s.me.editor_invited) {
    const all = EDITOR_POWERS.every((_, i) => checked[i]);
    const answer = async (yes) => { if (await attempt(() => api.acceptEditor(yes), yes ? 'Välkommen till Redaktionen' : 'Du tackade nej')) { setChecked({}); await refreshMe(); refreshBadges(); } };
    return html`<${Modal} title="Du är inbjuden till Redaktionen">
      <p>Redaktionen modererar hela plattformen. Bocka i varje punkt för att visa att du läst och godkänner vad det innebär:</p>
      <${Checklist} items=${EDITOR_POWERS} checked=${checked} setChecked=${setChecked} />
      <div class="btnrow"><button class="btn primary" disabled=${!all} onClick=${() => answer(true)}>Godkänn</button>
        <button class="btn" onClick=${() => answer(false)}>Tacka nej</button></div>
    <//>`;
  }
  const approved = requests.find((r) => r.status === 'approved');
  if (approved) {
    const all = ADMIN_POWERS.every((_, i) => checked[i]);
    const accept = async () => {
      if (await attempt(() => api.acceptAdminRole(approved.id), `Du är admin för ${approved.group?.name}`)) {
        setChecked({}); setRequests(await api.myAdminRequests()); await refreshMe(); go('/grupp/' + approved.group_id);
      }
    };
    return html`<${Modal} title=${`Admin för ${approved.group?.name}`}>
      <p>Redaktionen har godkänt att du blir admin. Bocka i varje punkt för att visa att du läst och godkänner:</p>
      <${Checklist} items=${ADMIN_POWERS} checked=${checked} setChecked=${setChecked} />
      <p class="small muted">När du bekräftat kan du lägga till fler admins i gruppens inställningar.</p>
      <button class="btn primary block" disabled=${!all} onClick=${accept}>Bekräfta och bli admin</button>
    <//>`;
  }
  return null;
}
