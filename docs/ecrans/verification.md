# Écran de vérification

Écran le plus important du produit après la fiche alerte.

## Objectif
Répondre en quinze secondes à : « est-ce que ce numéro, cette plaque, cet objet est signalé ? »

## Entrée
Un champ unique. Détection automatique du format :
- 9 chiffres commençant par 7 → numéro de téléphone sénégalais
- 15 chiffres → IMEI
- format alphanumérique court → plaque
- sinon → recherche texte libre

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
