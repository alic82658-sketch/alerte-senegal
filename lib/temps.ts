// Formatage du temps en français. Source unique, utilisée partout.
// Le fuseau du serveur (UTC en production) coïncide avec l'heure du Sénégal (GMT).

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function memeJour(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function estHier(d: Date, maintenant: Date): boolean {
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  return memeJour(d, hier);
}

// Date absolue : "le 30 juillet" (avec l'année si elle diffère de l'année courante).
export function dateComplete(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  const base = `le ${d.getDate()} ${MOIS[d.getMonth()]}`;
  return d.getFullYear() === maintenant.getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`;
}

// Temps écoulé : "il y a 6 min", "il y a 2 h", "hier", "le 30 juillet".
export function tempsEcoule(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  const minutes = Math.floor((maintenant.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (memeJour(d, maintenant)) return `il y a ${Math.floor(minutes / 60)} h`;
  if (estHier(d, maintenant)) return "hier";
  return dateComplete(iso, maintenant);
}

// Séparateur de groupe de jour du flux : "Aujourd'hui", "Hier", ou "le 30 juillet".
export function libelleJour(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  if (memeJour(d, maintenant)) return "Aujourd'hui";
  if (estHier(d, maintenant)) return "Hier";
  return dateComplete(iso, maintenant);
}

// Clé de regroupement par jour (année-mois-jour).
export function cleJour(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Retourne true si l'alerte a moins de N minutes.
export function moinsDe(iso: string, minutes: number, maintenant: Date = new Date()): boolean {
  return maintenant.getTime() - new Date(iso).getTime() < minutes * 60000;
}
