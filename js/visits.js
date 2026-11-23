// När var man här sist? Används för "nytt sen sist" överst i flödet.
// Tiden sparas när man lämnar appen. Var appen undanlagd en stund räknas återkomsten som ett nytt besök.
import { setState } from './store.js';

const KEY = 'last-visit';
const AWAY = 30 * 60e3;   // så länge man ska ha varit borta för att det ska räknas som ett nytt besök
const read = () => { try { const v = localStorage.getItem(KEY); return v ? new Date(v) : null; } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* går bra utan */ } };

export function startVisits() {
  setState({ lastVisit: read() });
  save();
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return save();
    const left = read();
    if (left && Date.now() - left > AWAY) setState({ lastVisit: left });
    save();
  });
}
