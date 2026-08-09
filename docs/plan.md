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
- [x] **Modération.** `/moderation`, pré-auth par passphrase (jeton HMAC httpOnly, secret comparé en base), RPC `security definer` (`db/002_moderation.sql`) : file d'attente, publier, rejeter (motif obligatoire), demander vérification, vérifier la plainte. À migrer vers `is_staff()` une fois l'auth livrée.

## Reste, dans l'ordre

Réordonné le 2026-08-09 après l'audit `docs/audit.md` (section I) et les trois
arbitrages tranchés dans `docs/decisions.md`. Principe : la vérification est le
fossé et sort en premier, sans attendre l'auth ; la migration vers le supertype
`posts` ne touche jamais le registre (identifiants durs, bloc plainte). La
modération `db/002` est déjà construite (voir « Fait »).

1. **Vérification** *(~2 sessions)*. Champ unique, détection de format, page de résultat serveur indexable (aucun signalement connu / N signalements dont X vérifiés / déclaré volé avec date et zone). Public, sans auth. Depuis un résultat vide : rebond « Demander à la communauté ». Moteur de rétention n°1, le fossé face à Facebook.
2. **Inscription (auth + onboarding + cohortes)** *(~3–4 sessions)*. Auth Supabase (téléphone/OTP), onboarding section 6 (prénom, ville/quartier, téléphone, « pourquoi rejoindre ? »), cohortes/vagues + `PIONNIER · 2026`. Donne un vrai `created_by` (fin du profil « Signalement anonyme ») et active `is_staff()` réel (remplace le verrou passphrase de la modération).
3. **Navigation** *(~1 session)*. Transition des 5 onglets : `Explorer→Vérifier` (loupe déjà dessinée), `Signaler→Publier (+)`, `Suivis→Notifications`. Mêmes emplacements.
4. **Modèle `posts` + Publier** *(~2–3 sessions)*. Supertype `posts` + `kind`, vue `posts_public`. Colonnes `imei`, `plate`, `phone_number`, `account_number` et bloc plainte **inchangés**. Flux Publier : sélecteur de type → formulaire partagé, l'alerte devient une branche ; `creer_signalement` → `creer_publication(kind, …)`.
5. **Fil communautaire** *(~2 sessions)*. Accueil multi-types, pagination, filtres étendus aux types, rebond « demander » branché.
6. **Réactions et confirmations** *(~1 session)*. Structurées uniquement (« Je confirme », « Vu aussi », « Je recommande la même personne »). Pas de commentaires libres à la V1.
7. **Profil membre** *(~1–2 sessions)*. Compteurs de contribution (contributions utiles, signalements confirmés, personnes aidées, recommandations), badge `PIONNIER`, membre depuis ; triggers de compteurs.
8. **Modération étendue** *(~2 sessions)*. UI de file de signalements (`content_reports`), masquer/avertir/bannir. À livrer avant la vague des 1 000.
9. **Notifications** *(~1–2 sessions)*. Fusionne « Suivis » ; suivre + envoyer une information.

### Hors V1 (architecture préparée, construction différée)

Parrainage (`invited_by`, table `invitations`), profils pro « recommandé N fois »
(crochet entité/sujet), modération IA (enum de statut préparé), regroupement
d'événements, badges au-delà de `PIONNIER`, push/PWA offline, moteur de
rapprochement (perdu/trouvé — après auth + vérification), monétisation.

### Toujours utile, non séquencé

**Import.** Reprise des meilleures affaires des pages Facebook existantes.
