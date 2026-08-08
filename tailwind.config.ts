import type { Config } from "tailwindcss";

/**
 * Tailwind ne détient aucune valeur de design.
 * Toutes les couleurs, tailles et familles pointent vers les variables
 * définies dans design/tokens.css, qui reste la seule source d'autorité.
 * Ajouter une couleur ici sans jeton correspondant est interdit.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // On remplace la palette Tailwind par défaut : seuls les jetons existent.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      fond: "var(--as-fond)",
      "fond-2": "var(--as-fond-2)",
      encre: "var(--as-encre)",
      gris: "var(--as-gris)",
      "gris-2": "var(--as-gris-2)",
      signal: "var(--as-signal)",
      bon: "var(--as-bon)",
      attente: "var(--as-attente)",
    },
    fontFamily: {
      titre: "var(--as-titre)",
      texte: "var(--as-texte)",
    },
    fontSize: {
      xs: "var(--as-t-xs)",
      s: "var(--as-t-s)",
      m: "var(--as-t-m)",
      l: "var(--as-t-l)",
      xl: "var(--as-t-xl)",
      "2xl": "var(--as-t-2xl)",
    },
    // Aucun coin arrondi, aucune ombre : rappelés depuis les jetons.
    borderRadius: {
      none: "var(--as-radius)",
    },
    boxShadow: {
      none: "var(--as-ombre)",
    },
    extend: {
      spacing: {
        pad: "var(--as-pad)",
        gap: "var(--as-gap)",
      },
      borderWidth: {
        filet: "var(--as-filet)",
        "filet-fort": "var(--as-filet-fort)",
      },
    },
  },
  plugins: [],
};

export default config;
