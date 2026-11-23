// Vad som är nytt i appen. Visas överst i flödet som "N uppdateringar sen sist" för den som varit här förut.
// Lägg nya rader överst: när (svensk tid) och en kort mening som en användare förstår.
export const CHANGES = [
  ['2026-11-23T16:00', 'Listorna som går i sidled (t.ex. grupperna överst) går att dra direkt, utan att man behöver ta nytt tag.'],
  ['2026-11-23T15:00', 'Regionerna heter som de gör på riktigt – Region Uppsala, Västra Götalandsregionen – så att de inte blandas ihop med städerna.'],
  ['2026-11-23T14:00', 'Platsens namn syns alltid helt – långa namn radbryts och krymper.'],
  ['2026-11-23T14:00', 'Att dra uppåt i en lista uppdaterar inte längre hela appen.'],
  ['2026-11-23T12:00', 'Överst i flödet syns hur mycket som är nytt sen du var här sist.'],
  ['2026-11-23T12:00', 'Notiser har fått en egen klocka uppe till höger – under pratbubblan finns bara meddelanden.'],
  ['2026-11-23T12:00', 'Platsväljaren är luftigare och regionerna stämmer.'],
  ['2026-11-23T08:20', 'Redaktionen modererar hela plattformen och tar hand om grupper som saknar admin.'],
  ['2026-11-23T08:20', 'Gå med i en grupp utan admin och be om att bli admin – Redaktionen godkänner.'],
  ['2026-11-23T08:20', 'Siffran på appikonen visar olästa meddelanden, notiser och det du har att göra.'],
  ['2026-11-22T17:51', 'Inlägg hör till sin grupps plats. Inlägg utan grupp får en egen plats.'],
  ['2026-11-22T17:39', 'Minne: spara i en eller flera kategorier och sök med förslag.'],
  ['2026-11-22T17:08', 'Platsväljaren visar bara platser där det finns något.'],
  ['2026-11-22T16:32', 'Minne finns i menyn längst ner. Sök har flyttat upp till höger.'],
  ['2026-11-21T12:37', 'Dra ner överst för att uppdatera, och flödet hämtar fler när du når slutet.'],
  ['2026-11-21T12:37', 'Gruppens admins kan lägga till medlemmar och publicera som gruppen.'],
  ['2026-11-20T12:39', 'Prenumerera på evenemangen i din kalender.'],
].map(([at, text]) => ({ at: new Date(at + '+01:00'), text }));
