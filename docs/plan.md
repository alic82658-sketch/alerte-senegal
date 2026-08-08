# Plan de construction

Ordre imposé. Une branche, un commit, un écran par session.

1. **Socle.** Projet Next.js, Tailwind configuré sur `design/tokens.css`, déploiement Cloudflare, page blanche en ligne.
2. **Base.** Migration SQL (`db/001_schema.sql`), RLS, jeu de données de test, vue `alerts_public`.
3. **Fiche alerte.** Statique d'abord, données factices, puis branchée sur Supabase.
4. **Vérification.** Formulaire GET, page de résultat serveur.
5. **Suivre + envoyer une information.** Déclenche l'inscription.
6. **Inscription et onboarding.**
7. **Écran de seuil** sur la racine, avec l'exception lien direct.
8. **Accueil membre** et flux par zone.
9. **Modération.** File d'attente, publication, rejet, droit de réponse.
10. **Import.** Reprise des meilleures affaires des pages Facebook existantes.

Le moteur de rapprochement arrive après le point 4, une fois que la vérification existe.
