# Alerte Sénégal

Plateforme communautaire d'entraide et d'alertes au Sénégal.
Domaine : alertesenegal.com

Le nom s'écrit toujours **Alerte Sénégal**. Jamais "Alert Sénégal".

## Lecture obligatoire avant toute tâche

Ce fichier, puis le document `docs/` correspondant au module concerné.
Les maquettes de référence sont dans `docs/maquettes/`. Elles sont validées : ne pas s'en écarter sans raison écrite dans `docs/decisions.md`.

## Ce que fait le produit

Trois usages, dans cet ordre d'importance :

1. **Vérifier avant d'agir.** Un numéro Wave, une plaque, un IMEI, un vendeur. Réponse en quinze secondes. C'est ce qui fait revenir les gens.
2. **Signaler.** Le signalement alerte le quartier et rend l'objet difficile à revendre.
3. **Suivre.** Une affaire évolue, ceux qui la suivent sont prévenus.

Filtre de décision unique :
« Est-ce que cela augmente la probabilité qu'un utilisateur rejoigne la communauté, trouve de l'aide ou aide quelqu'un ? »
Si non, ne pas construire.

Ce que le produit ne promet jamais : la récupération d'un objet ou d'une personne.

## Stack

Next.js (App Router), Supabase, Tailwind, Cloudflare, GitHub.
Aucune dépendance nouvelle sans justification dans `docs/decisions.md`.
Pas de librairie de composants tierce. Les composants sont écrits à la main d'après `design/tokens.css`.

## Direction artistique

Fond clair, encre pétrole, signal terracotta. Voir `design/tokens.css`, qui fait autorité sur toutes les couleurs et tailles.

Typographie : Big Shoulders Display 800/900 pour les titres et les libellés d'action, Martian Mono pour tout le reste. Deux familles, pas une de plus.

Obligatoire :
- Statuts typographiques, jamais des pastilles colorées
- Le statut doit rester lisible sans distinction de couleur
- Filets de 1 à 1,5px pour les séparations
- Le terracotta est réservé au signal et à l'action, jamais décoratif
- Un seul élément terracotta plein par écran

Interdit :
- Noir pur, blanc pur en aplat de fond
- Ombres portées, coins arrondis, dégradés
- Icônes décoratives
- Hero vide, empilement de cartes identiques
- Esthétique SaaS ou dashboard

Test de validation : si le logo peut être remplacé par celui d'une banque sans que le design paraisse étrange, la direction a échoué.

## Contraintes techniques non négociables

- Mobile-first. Cible de référence : Android d'entrée de gamme, écran 360px, réseau lent, plein soleil.
- Chaque page reste lisible et utilisable sans JavaScript.
- Les fiches alertes sont rendues côté serveur et indexables.
- Lighthouse mobile supérieur à 90 en performance et accessibilité.
- Pas de Three.js dans le MVP.
- Les listes lisent la vue `alerts_public`, jamais la table `alerts`.

## Sécurité et données

- RLS active sur toutes les tables dès leur création. Aucune exception.
- Clés Supabase en variables d'environnement uniquement.
- Position exacte réservée aux modérateurs. Le public voit une position arrondie.
- Les récépissés de plainte vont dans un bucket privé, jamais servis au public.
- Aucune accusation publiée automatiquement comme un fait.
- Distinction permanente entre déclaré par l'auteur et vérifié par Alerte Sénégal.

## Méthode de travail

Une session, un écran, une branche, un commit.
Ne pas modifier de fichiers hors du périmètre demandé.
Présenter le diff avant de commiter.
Chaque tâche est validée par des critères d'acceptation vérifiables.
Consigner chaque arbitrage dans `docs/decisions.md` avec la date.
