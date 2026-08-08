// En-tête collant. Marque à gauche, indicateur « En direct » à droite.
// Le « point » est un carré terracotta (aucun coin arrondi).
export function EnTete() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-fond border-b-filet-fort border-encre px-pad py-gap">
      <span className="font-titre font-black text-l uppercase tracking-tight">
        Alerte Sénégal
      </span>
      <span className="flex items-center gap-gap font-texte text-xs uppercase tracking-wide text-gris">
        <span className="as-pulse block w-gap h-gap bg-signal" aria-hidden="true" />
        En direct
      </span>
    </header>
  );
}
