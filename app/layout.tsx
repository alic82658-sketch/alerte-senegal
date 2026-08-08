import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
