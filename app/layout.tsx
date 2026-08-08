import type { Metadata } from "next";
import { Big_Shoulders, Martian_Mono } from "next/font/google";
import "./globals.css";

// Servies en local par next/font : aucune requête vers Google au runtime.
const titre = Big_Shoulders({
  subsets: ["latin"],
  weight: ["800", "900"],
  variable: "--as-font-titre",
  display: "swap",
});

const texte = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--as-font-texte",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alerte Sénégal",
  description: "Plateforme communautaire d'entraide et d'alertes au Sénégal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${titre.variable} ${texte.variable}`}>
      <body>{children}</body>
    </html>
  );
}
