// Väljer backend: Supabase om config.js är ifylld, annars demoläge i webbläsaren.
// Lägg till ?demo i adressen för att prova demoläget även när Supabase är inkopplat.
// Båda filerna exporterar samma funktioner, så resten av appen bryr sig inte om vilken som används.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const demo = new URLSearchParams(location.search).has('demo') || !(SUPABASE_URL && SUPABASE_ANON_KEY);
// Supabase-biblioteket hämtas som en enda fil (i stället för ett tiotal i rad) och bara när det behövs.
function loadScript(src) {
  return new Promise((ok, fail) => {
    if (window.supabase?.createClient) return ok();
    const s = document.querySelector(`script[data-supabase]`) || Object.assign(document.createElement('script'), { src, async: true });
    s.dataset.supabase = '1';
    s.addEventListener('load', () => ok(), { once: true });
    s.addEventListener('error', () => fail(new Error('Kunde inte ladda Supabase')), { once: true });
    if (!s.parentNode) document.head.appendChild(s);
  });
}
if (!demo) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
const mod = demo ? await import('./local.js') : await import('./supabase.js');
export const api = mod.api;
