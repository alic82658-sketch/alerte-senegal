# Fiche alerte

Page d'atterrissage du trafic réseaux sociaux. Premier écran à construire.

## Contenu
titre, catégorie, statut, zone, date, description, photos, vidéo YouTube éventuelle, auteur du signalement, chronologie des mises à jour, nombre de personnes qui suivent.

## Actions
- Suivre (déclenche l'inscription si non connecté)
- J'ai une information (trois champs maximum)
- Partager (lien WhatsApp en premier)

## Règles
- Rendu côté serveur, indexable, lisible sans JavaScript
- Position affichée arrondie, jamais exacte
- Le badge « Plainte vérifiée » n'apparaît que si complaint = 'verifiee'
- Une affaire résolue affiche clairement sa résolution et, si applicable, « Résolue grâce à N informations »
- Les informations reçues (tips) ne sont jamais publiques

## Critères d'acceptation
- Lighthouse mobile > 90
- La page se charge et s'affiche complètement sans JS
- Balises Open Graph correctes (le partage WhatsApp doit afficher titre, image, zone)
- Aucun coin arrondi, aucune ombre
