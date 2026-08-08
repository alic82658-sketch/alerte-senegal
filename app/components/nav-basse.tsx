import Link from "next/link";

// Pictogrammes tracés à la main, trait 1,5px, sans librairie d'icônes.
// viewBox 24, currentColor, coins nets (linejoin miter, linecap square).
const svgProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
};

function IconeAccueil() {
  return (
    <svg {...svgProps}>
      <path d="M4 11 L12 4 L20 11" />
      <path d="M6 10 V20 H18 V10" />
      <path d="M10 20 V14 H14 V20" />
    </svg>
  );
}

function IconeExplorer() {
  return (
    <svg {...svgProps}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 L20 20" />
    </svg>
  );
}

function IconeSignaler() {
  return (
    <svg {...svgProps}>
      <path d="M12 4 L21 20 L3 20 Z" />
      <path d="M12 10 V15" />
      <path d="M12 17.5 V18" />
    </svg>
  );
}

function IconeSuivis() {
  // Marque-page anguleux : ce que l'on suit / garde.
  return (
    <svg {...svgProps}>
      <path d="M7 4 H17 V20 L12 16 L7 20 Z" />
    </svg>
  );
}

function IconeProfil() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20 V19 C5 15.5 8 14 12 14 C16 14 19 15.5 19 19 V20" />
    </svg>
  );
}

type Entree = {
  href: string;
  label: string;
  Icone: () => React.ReactElement;
  centre?: boolean;
};

const ENTREES: Entree[] = [
  { href: "/accueil", label: "Accueil", Icone: IconeAccueil },
  { href: "/explorer", label: "Explorer", Icone: IconeExplorer },
  { href: "/signaler", label: "Signaler", Icone: IconeSignaler, centre: true },
  { href: "/suivis", label: "Suivis", Icone: IconeSuivis },
  { href: "/profil", label: "Profil", Icone: IconeProfil },
];

// Barre basse fixée dans la coque (sticky, reste dans les 420px).
// « Signaler » au centre : seul élément terracotta plein.
export function NavBasse() {
  return (
    <nav
      className="sticky bottom-0 z-10 grid grid-cols-5 bg-fond border-t-filet-fort border-encre"
      aria-label="Navigation principale"
    >
      {ENTREES.map(({ href, label, Icone, centre }) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-center gap-1 py-gap ${
            centre ? "bg-signal text-fond" : "text-encre"
          }`}
        >
          <Icone />
          <span className="font-texte text-xs uppercase tracking-wide">
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
