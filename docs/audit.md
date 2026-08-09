# Audit — passage vers la vision communautaire

Date : 2026-08-09. Cet audit ne modifie aucun code. Il fixe la trajectoire ;
les trois arbitrages de fin sont tranchés et reportés dans `docs/decisions.md`,
l'ordre de migration dans `docs/plan.md`.

Correction factuelle actée : aucune fonctionnalité météo, embouteillages ou
incendies n'existe dans le code. L'existant réel est celui décrit dans `plan.md`.

---

## 0. Les deux questions préalables

### Question 1 — Positionnement : renforce ou affaiblit le fossé ?

**Verdict : prise au pied de la lettre, la nouvelle vision affaiblit l'avantage.
Recadrée, elle le renforce. Il faut la recadrer.**

Les deux pages Facebook (109 000 abonnés) font déjà, mieux et gratuitement, ce
que la vision décrit comme « le produit » : un fil, des publications, des
commentaires, des réactions, de l'entraide. Sur ce terrain, Facebook a le
réseau, les notifications, l'habitude et 109 000 personnes déjà présentes. On
démarre à 100 membres. Un fil de « je cherche un plombier » avec cinq
commentaires est un groupe Facebook — et un groupe Facebook le fait mieux.

La seule chose que Facebook ne peut **structurellement** pas faire, c'est ce que
le code contient déjà : un **registre interrogeable d'identifiants durs**
(numéro Wave/Orange Money, plaque, IMEI) qui répond en quinze secondes
« déclaré volé, N signalements dont X vérifiés, zone, date ». Facebook produit
les mêmes conversations mais **jette le résidu structuré** : un numéro
d'arnaqueur cité dans 40 commentaires y est introuvable trois jours plus tard.
Chez nous il devient une entrée permanente, indexée, cherchable. **C'est le
fossé défensif, et rien d'autre.**

Danger de la vision telle qu'écrite : elle met le fil au centre et **enterre la
vérification** (absente de la navigation proposée). C'est l'inversion exacte du
fossé, et une bataille perdue à 100 contre 109 000.

**Articulation retenue :** le fil n'est pas le produit, c'est **l'instrument qui
alimente le registre**. La boucle de la section 0 du brief est le squelette :

> VÉRIFIER → si réponse : terminé.
> VÉRIFIER → si rien → DEMANDER À LA COMMUNAUTÉ → réponse → **structurer et
> conserver** → enrichir le registre.

Mouvement de design décisif : **la recherche est la porte d'entrée**, et
« Demander à la communauté » n'est pas un CTA de publication proéminent — c'est
le **rebond d'une recherche qui n'a rien donné**. Le résidu utile (pro
recommandé, numéro confirmé frauduleux) est **promu** en donnée durable ;
Facebook ne promeut rien, il oublie.

### Question 2 — Charge de modération pour une personne seule

Hypothèses : produit d'entraide, engagement décroissant par tête,
pré-modération (tout passe par `en_attente` → `publie`, comme aujourd'hui).

| Membres | Publications/j | Commentaires/j | Items/j | Temps/j (~20 s) | Verdict |
|---|---|---|---|---|---|
| 100 | 10–15 | 30–50 | ~50–65 | 20–30 min | Tenable |
| 1 000 | 80–120 | 300–500 | ~400–600 | 2 h – 3 h 20 | **Rupture** |
| 10 000 | 800–1 500 | 3 000–5 000 | 4 000–6 000 | 15–30 h | Intenable |

**Seuil de rupture pour une personne seule ayant une autre activité : entre 500
et 1 000 membres actifs, avec commentaires libres et pré-modération.**

Le piège n'est pas le volume mais le **sous-ensemble sensible** : une accusation
nominative peut diffamer une personne réelle et exposer juridiquement. Elle ne
peut pas être post-modérée sans risque. Le volume se tamponne ; le risque
réputationnel, non.

**Restrictions initiales recommandées (sans compter sur l'IA, non budgétée) :**

1. **Pas de commentaires libres au lancement.** Réactions structurées d'abord
   (« Je confirme », « Vu aussi », « Je recommande la même personne »). Zéro
   texte libre = quasi zéro modération, et cela produit la donnée structurée.
2. **Pré-modération uniquement là où la réputation est en jeu** (contenu
   nominatif, accusations). Le reste en post-modération. Réutiliser la
   distinction `déclaré`/`vérifié` + `alert_replies` : c'est déjà le
   « human in the loop » de la section 10, ne pas le dupliquer.
3. **Rate-limiting** : N publications/jour/membre, délai entre deux.
4. **Les vagues (100 pionniers) sont un outil de modération**, pas un gadget.
   Garder les vagues petites tant que l'outillage (file de signalements,
   masquer, bannir) n'existe pas.
5. **Zéro publication anonyme** : chaque contenu rattaché à un profil vérifié
   par téléphone.
6. **Co-modérateurs (rôle `moderator` déjà en base) avant la vague des 1 000.**

Tranche : la feuille de route 100 → 500 → 1 000 est le bon garde-fou *à
condition* que les commentaires restent contraints et les co-modérateurs
recrutés avant 1 000.

### Principe stratégique — la boucle

Trois règles pour rendre la boucle simple sans devenir un Facebook miniature :
la recherche est la façade (pas le fil) ; « Demander à la communauté » est un
rebond d'échec de recherche (pas un CTA proéminent) ; un mécanisme léger de
**promotion** transforme une réponse en donnée durable. On ne construit pas
l'infrastructure « profil pro » maintenant — seulement le **crochet** (une
entité/sujet rattachable à un post).

---

## 1. L'audit en quatre catégories

### 1.1 GARDER (ne pas toucher)

| Élément | Rôle | Pourquoi garder | Risque si on y touche |
|---|---|---|---|
| Design system (`tokens.css`, `statuts.ts`, `temps.ts`) | Autorité visuelle | Validé, non rediscutable | Élevé |
| Identifiants durs (`imei`, `plate`, `phone_number`, `account_number`) | Registre structuré | **Le fossé (Q1)** | Élevé |
| Bloc plainte (`déclaré`/`vérifié`, `alert_replies`) | Accusation ≠ fait + droit de réponse | Human-in-the-loop (section 10) | Élevé |
| RLS + security-definer, aucune clé service-role | Sécurité | Non négociable, déjà propre | Critique |
| Vue `alerts_public` | Masque les champs sensibles | Modèle à généraliser | Moyen |
| Fiche alerte SSR indexable | Surface d'acquisition | Cœur de la croissance | Moyen |
| Machinerie de modération (`db/002`, `/moderation`) | File, publier/rejeter/vérifier | Répond aux sections 10–11 | Moyen |
| Coquille (ticker, en-tête, nav basse SVG) | Cadre applicatif | Répond à la section 4 | Faible |
| `waitlist` + `invited_at`/`converted_at` | Collecte e-mails | Fondation cohortes/vagues | Faible |
| `content_reports`, `user_role`, `is_banned` | Modération communautaire | Fondations section 11 | Faible |
| Écran de seuil (`/`) | Waitlist + mur caviardé | Porte des vagues | Faible |

### 1.2 MODIFIER (modification minimale)

| Élément | Modification minimale | Risque |
|---|---|---|
| `alerts` → modèle `posts` | Supertype `posts` + `kind` (`alerte`, `entraide`, `emploi`, `recommandation`, `bon_plan`, `conseil`). L'alerte devient un type. **Identifiants durs et bloc plainte inchangés.** | Élevé |
| `alerts_public` → `posts_public` | Vue équivalente sur le supertype | Moyen |
| Accueil (`/accueil`) | Fil multi-types + **barre de recherche en tête** + filtres étendus | Moyen |
| Nav basse | `Explorer→Vérifier` (loupe déjà dessinée), `Signaler→Publier (+)`, `Suivis→Notifications`. Mêmes 5 emplacements | Faible |
| Signalement → Publier | Sélecteur de type → formulaire partagé ; `creer_signalement` → `creer_publication(kind, …)` | Moyen |
| `profiles` | Compteurs de contribution, champs cohorte/PIONNIER, date d'entrée | Moyen |
| Écran de seuil | Brancher sur limites de cohorte (ouvrir/fermer, compteur de vague, `PIONNIER · 2026`) | Faible |
| Zone « Ngor par défaut » codée en dur | Remplacer par la zone réelle du membre une fois l'auth en place | Faible |

### 1.3 RETIRER OU MASQUER

Rien n'est détruit (le brief l'interdit). À masquer / ne pas activer à V1 :

| Élément | Décision | Raison |
|---|---|---|
| Commentaires libres | Ne pas construire à V1 ; réactions + confirmations structurées | Charge de modération (Q2) |
| Onglet « Suivis » autonome | Fusionner dans « Notifications » | Simplifie la nav |
| Média lourd (`youtube_video_id`, `cover_image_url`, upload) | Garder en schéma, pas d'upload | Section 18 |
| Badges au-delà de `PIONNIER` | Masquer | Éviter la gamification (section 8) |

### 1.4 AJOUTER PLUS TARD (architecture maintenant, construction plus tard)

| Élément | Préparer maintenant | Ne pas construire |
|---|---|---|
| Parrainage (section 7) | `invited_by` sur `profiles`, table `invitations` | La mécanique d'invitation |
| Profils pro « recommandé 27 fois » (section 9) | Crochet entité/sujet rattachable | Marketplace, paiement |
| Modération IA (sections 10, 12) | Enum `approved`/`flagged`/`pending_review`/`rejected` | Le pipeline IA |
| Regroupement d'événements | — | Le clustering |
| Badges (Contributeur fiable, Référent local) | Compteurs de contribution | Seuils/attributions |
| Push / PWA offline | Manifest PWA, `user_alert_preferences` existe | Push serveur |
| Moteur de rapprochement | Identifiants durs déjà là | Le moteur (après auth + vérification) |
| Monétisation (section 17) | Rien | Rien en V1 |

---

## 2. Propositions (1 session = 1 écran ou 1 module)

- **A. Navigation — ~1 session.** `Accueil · Vérifier · Publier (+) ·
  Notifications · Profil`. Barre de recherche persistante en tête d'accueil.
- **B. Inscription (auth + onboarding + cohortes) — ~3–4 sessions.** Auth
  Supabase (téléphone/OTP), onboarding section 6, cohortes/`PIONNIER`, vrai
  `created_by`, `is_staff()` réel.
- **C. Fil communautaire — ~2 sessions.** Fil multi-types + pagination +
  barre de recherche + rebond « demander ».
- **D. Profil membre — ~1–2 sessions.** Compteurs de contribution, badge
  `PIONNIER`, membre depuis ; triggers de compteurs.
- **E. Publication — ~2–3 sessions.** Migration `posts` (1) + flux Publier
  (1–2).
- **F. Commentaires et réactions — ~1 session maintenant.** Réactions/
  confirmations structurées. Commentaires contraints différés.
- **G. Modération — ~2 sessions.** UI file de signalements + masquer/bannir +
  migration passphrase → `is_staff()`.
- **H. Base de données — ~1–2 sessions nettes.** Supertype `posts`,
  `posts_public`, compteurs, champs cohorte, enum statut modération, crochets
  invitations. (Recoupe B/D/E.)
- **I. Plan de migration — voir `docs/plan.md`.**
- **J. Feuille de route V1 — ≈ 15–19 sessions** (voir `plan.md`).

---

## 3. Arbitrages tranchés (2026-08-09)

1. **Vérification d'abord**, avant tout le reste, sans attendre l'auth. Seul
   écran qui a du sens avec zéro membre. C'est le fossé.
2. **Pas de commentaires libres à V1.** Réactions et confirmations structurées
   uniquement.
3. **Supertype `posts` avec `kind`, oui — mais après la vérification.** Les
   colonnes `imei`, `plate`, `phone_number`, `account_number` et le bloc plainte
   ne subissent **aucune** modification. Si quelque chose doit casser, ce sera le
   fil, jamais le registre.
