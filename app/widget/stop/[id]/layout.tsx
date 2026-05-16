import "@/app/globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata = {
  title: "Arrêt en temps réel · M",
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
