import type { AlertStatus } from "./types";

// Libellé français lisible du statut, accordé au féminin (une alerte, une affaire).
// Source unique, utilisée partout (fiche, accueil, bandeau).
const LIBELLES: Record<AlertStatus, string> = {
  temoignage: "Témoignage",
  en_verification: "En vérification",
  verifie: "Vérifiée",
  en_cours: "En cours",
  resolu: "Résolue",
  faux: "Fausse alerte",
  hors_de_cause: "Mise hors de cause",
  classe_sans_suite: "Classée sans suite",
};

// Classe modificatrice de .as-etat (design/tokens.css). Vide = statut neutre.
const CLASSES: Record<AlertStatus, string> = {
  temoignage: "as-etat--temoignage",
  en_verification: "as-etat--verification",
  verifie: "as-etat--verifie",
  en_cours: "",
  resolu: "as-etat--resolu",
  faux: "as-etat--faux",
  hors_de_cause: "",
  classe_sans_suite: "",
};

export function libelleStatut(status: AlertStatus): string {
  return LIBELLES[status] ?? status;
}

export function classeStatut(status: AlertStatus): string {
  return CLASSES[status] ?? "";
}
