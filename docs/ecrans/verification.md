# Écran de vérification

Écran le plus important du produit après la fiche alerte.

## Objectif
Répondre en quinze secondes à : « est-ce que ce numéro, cette plaque, cet objet est signalé ? »

## Entrée
Un champ unique. La détection de format et la normalisation sont faites **en
base** par `verifier_identifiant` (voir « Contrat backend » plus bas), pas côté
écran. Le champ transmet la valeur brute ; la fonction renvoie `type_detecte` :
- 9 chiffres commençant par 7 → numéro de téléphone sénégalais
- 15 chiffres → IMEI
- format alphanumérique court → plaque
- sinon → recherche texte libre

## Contrat backend (fonction en base — créée et testée, ne pas modifier)

`public.verifier_identifiant(p_valeur text)` — `security definer`, exécutable
par `anon`. Correspondance **exacte** exigée, ne renvoie **jamais** l'identifiant
recherché : le registre n'est pas énumérable. Normalise les formats (tirets,
espaces, indicatif `221` optionnel).

Retourne une ligne :

| Colonne | Type | Sens |
|---|---|---|
| `type_detecte` | text | `imei`, `telephone`, `plaque` ou `autre` |
| `nb_signalements` | int | total de signalements correspondants |
| `nb_verifies` | int | dont vérifiés par Alerte Sénégal (toujours distingué de `nb_signalements`, cf. critères) |
| `nb_plaintes` | int | plaintes déclarées |
| `dernier_le` | timestamptz | date du signalement le plus récent |
| `zones` | text[] | zones concernées |
| `categories` | text[] | catégories concernées |
| `slug_recent` | text | slug de la fiche la plus récente (lien vers `/alerte/[slug]`) |

Exceptions : `valeur_trop_courte` si moins de 6 caractères (à traiter côté écran
comme un message de saisie, pas une erreur générique).

Résultat = 0 signalement → « Aucun signalement connu » (ne garantit rien).
Résultat > 0 → afficher `nb_signalements` / `nb_verifies` / `nb_plaintes`,
`dernier_le`, `zones`, et le lien via `slug_recent`.

Tests de référence : `DK-4821-AB` → 1 signalement vérifié, plainte vérifiée,
Grand Yoff. IMEI inconnu → 0.

Cette fonction ne lit pas `alerts_public` : elle interroge le registre (colonnes
dures réservées au modérateur) sans jamais exposer ces colonnes au public — ce
qui lève le point ouvert en fin d'audit.

## Trois résultats possibles

**Aucun signalement connu.**
Formulation obligatoire : dire que l'absence de signalement ne garantit rien. Ne jamais écrire « cet objet est sain ».

**N signalements.**
Afficher le nombre total, le nombre vérifié par Alerte Sénégal, la date du plus récent et la zone.

**Déclaré volé ou frauduleux.**
Bandeau terracotta, date, zone, lien vers la fiche.

## Depuis le résultat
- Bouton « Signaler à mon tour »
- Bouton « Suivre ce numéro » (prévenu si un nouveau signalement arrive)

## Critères d'acceptation
- Fonctionne sans JavaScript (formulaire GET vers une page de résultat)
- Résultat rendu côté serveur, indexable
- Aucune donnée personnelle du déclarant exposée
- Le nombre de signalements non vérifiés est toujours distingué du nombre vérifié
- Réponse affichée en moins d'une seconde sur réseau lent
