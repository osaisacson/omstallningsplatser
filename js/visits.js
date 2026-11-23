// "Nytt sen sist": när man var här förra gången sparas på kontot (se begin_visit i databasen).
// Kommer man tillbaka till appen efter en stund räknas det som ett nytt besök.
import { state, beginVisit } from './store.js';

const AWAY = 30 * 60e3;
export function startVisits() {
  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (state.me && hiddenAt && Date.now() - hiddenAt > AWAY) beginVisit();
  });
}
