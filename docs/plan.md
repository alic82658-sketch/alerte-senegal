# Plan de construction

Ordre imposé au départ ; l'ordre réel a un peu varié (coquille et écrans membres construits avant la vérification). État au 8 août 2026.

Une session, un écran, une branche, un commit.

## Fait

- [x] **Socle.** Next.js (App Router) + TypeScript, Tailwind branché sur `design/tokens.css`, déploiement Cloudflare (adaptateur OpenNext).
- [x] **Base.** `db/001_schema.sql`, RLS, jeu de données de test, vue `alerts_public` (enrichie : `author_name`, `zone_name`, `zone_slug`).
- [x] **Clients Supabase.** `lib/supabase/` (serveur + navigateur), types dérivés du schéma (`lib/types.ts`).
- [x] **Fiche alerte.** `/alerte/[slug]`, rendu serveur, branchée sur `alerts_public`.
- [x] **Coquille.** Bandeau défilant, en-tête collant, barre basse (groupe de routes `(app)`), hors racine.
- [x] **Écran de seuil.** Racine `/`, mur d'alertes caviardé, inscription waitlist, exception « lien direct vers une fiche ».
- [x] **Accueil membre.** `/accueil`, filtres par paramètres d'URL, flux par zone groupé par jour, synthèse.
- [x] **Signalement.** `/signaler`, trois étapes sans JavaScript, RPC `creer_signalement` (auteur « Signalement anonyme » en attendant l'auth), identifiants durs stockés en colonnes (`imei`, `plate`, `phone_number`, `account_number`).

## Reste, dans l'ordre

1. **Vérification.** Formulaire GET, page de résultat serveur (aucun signalement connu / N signalements dont X vérifiés / déclaré volé avec date et zone). Moteur de rétention n°1.
2. **Moteur de rapprochement.** Perdu/trouvé, volé/en vente, recherché/aperçu — sur identifiants durs (IMEI, plaque, numéros), sinon zone + date. Arrive après la vérification.
3. **Modération.** File d'attente, publication, rejet, droit de réponse — indispensable pour publier les signalements aujourd'hui en attente.
4. **Suivre + envoyer une information.** Déclenche l'inscription.
5. **Inscription et onboarding.** Ville, quartier, catégories — donne aussi un vrai auteur aux signalements (`created_by`), en remplacement du profil « Signalement anonyme ».
6. **Import.** Reprise des meilleures affaires des pages Facebook existantes.
