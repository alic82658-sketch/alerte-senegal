# Alerte Sénégal — dossier de reprise

Ce dossier contient tout ce qui a été décidé et validé. Il se dépose à la racine d'un dépôt vide.

## Contenu

- `CLAUDE.md` — règles non négociables, lues à chaque session
- `design/tokens.css` — couleurs, typographies, tailles. Fait autorité.
- `docs/produit.md` — ce que fait le produit et pourquoi
- `docs/ux.md` — parcours
- `docs/plan.md` — ordre de construction
- `docs/decisions.md` — arbitrages datés
- `docs/ecrans/` — spécification par écran
- `docs/maquettes/` — maquettes HTML validées, à ouvrir dans un navigateur
- `db/001_schema.sql` — migration Supabase

## Démarrage

1. Créer un dépôt GitHub vide, y déposer ce dossier, pousser.
2. Créer le projet Supabase, exécuter `db/001_schema.sql`, créer le bucket privé pour les récépissés.
3. Ouvrir Claude Code à la racine et lancer la première session :

   « Lis CLAUDE.md et docs/plan.md. Exécute uniquement l'étape 1 du plan : initialiser le projet Next.js App Router avec Tailwind branché sur design/tokens.css, et rien d'autre. Montre-moi le diff avant de commiter. »

4. Une session par étape du plan. Ne jamais enchaîner deux étapes dans la même session.

## Variables d'environnement

À créer dans Cloudflare, jamais dans le dépôt :
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
