// Evenemang: kommande evenemang, filtrerade på vald plats (världen, land, region, stad eller stadsdel).
import { html, useState, useEffect } from '../lib.js';
import { api } from '../api/index.js';
import { useAsync, toast } from '../store.js';
import { Avatar, Loading, ErrorBox } from '../ui.js';
import { inPlace, postPlace, postVisibleAt, eventTitle, calendarSubscribed } from '../util.js';

// Prenumerera: telefonens (eller datorns) kalender hämtar en egen hemlig länk regelbundet, så evenemang man är
// intresserad av, kommer på eller själv lagt upp läggs till – och ändras eller försvinner – av sig själva.
// Visas som inställning i Profil och inställningar och som en fråga på profilen som går att avböja.
const SUBSCRIBED = 'kalender-prenumererar';
const DISMISSED = 'kalender-fraga-avbojd';
const flag = (k) => { try { return !!localStorage.getItem(k); } catch { return false; } };
const setFlag = (k) => { try { localStorage.setItem(k, '1'); } catch { /* ok */ } };

export function CalendarSetting({ prompt = false }) {
  const [url, setUrl] = useState(null);
  const [done, setDone] = useState(() => flag(SUBSCRIBED));
  const [hidden, setHidden] = useState(() => flag(DISMISSED));
  const [open, setOpen] = useState(!prompt);
  useEffect(() => { if (open && api.mode === 'supabase' && !url) api.calendarUrl().then(setUrl, (e) => toast(e.message)); }, [open]);
  if (prompt && (done || hidden || api.mode !== 'supabase')) return null;
  if (api.mode !== 'supabase') return html`<div class="setting-row"><span class="muted">Kalenderprenumeration fungerar inte i demoläget.</span></div>`;
  const mark = () => { setFlag(SUBSCRIBED); setDone(true); };
  const webcal = url && url.replace(/^https:/, 'webcal:');
  const google = url && `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  async function copy() { try { await navigator.clipboard.writeText(url); toast('Länken är kopierad'); } catch { window.prompt('Kopiera länken:', url); } mark(); }
  const intro = html`<span><b>Vill du se evenemang i din egen kalender?</b> Det du trycker <b>Intresserad</b> eller <b>Kommer</b> på (och dina egna evenemang) hamnar automatiskt i din vanliga kalender – och uppdateras om tid eller plats ändras.</span>`;
  if (prompt && !open) return html`<div class="nudge badge-setting">
    ${intro}
    <span class="btnrow"><button class="btn small primary" onClick=${() => setOpen(true)}>Lägg till</button>
      <button class="btn small" onClick=${() => { setFlag(DISMISSED); setHidden(true); }}>Inte nu</button></span>
  </div>`;
  return html`<div class=${prompt ? 'nudge badge-setting' : 'setting-row cal-setting'} id=${prompt ? undefined : 'kalender'}>
    ${prompt ? html`<span><b>Välj din kalender</b></span>` : done
      ? html`<span><b>Du prenumererar på dina evenemang.</b> Det du trycker Intresserad eller Kommer på dyker upp i din kalender. Behöver du lägga till den igen, t.ex. på en ny telefon, välj nedan.</span>`
      : intro}
    ${!url ? html`<${Loading} />` : html`<div class="btnrow cal-btns">
      <a class="btn small primary" href=${webcal} onClick=${mark}>iPhone, Mac eller Outlook</a>
      <a class="btn small" href=${google} target="_blank" rel="noopener" onClick=${mark}>Google Kalender</a>
      <button class="btn small" onClick=${copy}>Kopiera länk</button>
    </div>
    <small class="muted">Kalendern hämtar nytt ungefär en gång i timmen (Google Kalender kan ta upp till ett dygn). Dela inte länken – den visar dina evenemang.</small>`}
    ${prompt && html`<button class="link small muted" onClick=${() => { setFlag(DISMISSED); setHidden(true); }}>Inte nu</button>`}
  </div>`;
}

// Fliken Events i flödet: kommande evenemang i vald plats, dag för dag.
export function EventsList({ place, empty, match = () => true, subscribe = true }) {
  const events = useAsync(() => api.listEvents(), []);
  const list = (events.data || []).filter((p) => postVisibleAt(p, place) && match(p));

  // Gruppera per dag
  const days = [];
  for (const p of list) {
    const d = new Date(p.event_start);
    const key = d.toDateString();
    if (!days.length || days[days.length - 1].key !== key) days.push({ key, date: d, items: [] });
    days[days.length - 1].items.push(p);
  }
  const dayLabel = (d) => {
    const t = new Date(); const tm = new Date(); tm.setDate(t.getDate() + 1);
    if (d.toDateString() === t.toDateString()) return 'Idag';
    if (d.toDateString() === tm.toDateString()) return 'Imorgon';
    const s = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const time = (iso) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  return html`<div class="events">
    ${subscribe && html`<a class="cal-sub link" href="#/redigera-profil?del=kalender">${calendarSubscribed() ? '✓ Dina evenemang finns i din kalender' : 'Få dina evenemang i din kalender ›'}</a>`}
    ${events.loading && !events.data ? html`<${Loading} />` : events.error ? html`<${ErrorBox} error=${events.error} />`
      : !days.length ? empty
      : days.map((d) => html`<section class="cal-day" key=${d.key}>
          <h2 class="cal-date">${dayLabel(d.date)}</h2>
          ${d.items.map((p) => html`<a class="cal-item" href=${'#/post/' + p.id} key=${p.id}>
            <span class="cal-time">${time(p.event_start)}${p.event_end ? html`<small>${time(p.event_end)}</small>` : ''}</span>
            <span class="cal-main">
              <strong>${eventTitle(p)}</strong>
              <small class="muted">${[p.event_address || p.event_city, p.group?.name].filter(Boolean).join(' · ')}</small>
              ${p.event_rsvp && (p.rsvp_going || p.rsvp_interested) ? html`<small class="cal-count">${p.rsvp_going} kommer · ${p.rsvp_interested} intresserade</small>` : ''}
            </span>
            ${p.group && html`<${Avatar} src=${p.group.avatar_url} name=${p.group.name} size=${36} />`}
          </a>`)}
        </section>`)}
  </div>`;
}
