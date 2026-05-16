# M temps réel — Carte des bus & tram de Grenoble

Carte interactive temps réel du réseau **M (TAG)** de la métropole grenobloise.
Lignes officielles, arrêts, prochains passages et positions véhicules estimées
en temps réel, le tout dans une UI fidèle à la direction artistique de
[reso-m.fr](https://www.reso-m.fr).

![preview](./preview.png)

---

## ✨ Fonctionnalités

- 🗺️ **Toutes les lignes** tram & bus du réseau M tracées sur la carte
- 🚍 **Positions véhicules en temps réel** (interpolées à partir des horaires temps réel API)
- 🔎 **Recherche** de lignes par nom court ou nom long
- 🧭 **Filtres** Tout / Tram / Bus
- ⭐ **Favoris** persistés en localStorage
- 📍 **Détail ligne** avec liste ordonnée des arrêts et code couleur officiel
- ⏱️ **Prochains passages temps réel** par arrêt (rafraîchis toutes les 20s)
- 📱 **Responsive** desktop / mobile (bottom-sheet)
- ♿ **Accessible** : focus visible, contraste WCAG AA, navigation clavier

---

## 🚀 Démarrage

```bash
pnpm install
pnpm dev
```

Ouvre http://localhost:3000.

## 🌍 Déploiement (Vercel)

```bash
pnpm i -g vercel
vercel deploy --prod
```

La région CDG1 (Paris) est configurée dans `vercel.json` pour minimiser la
latence vers l'upstream `data.mobilites-m.fr`. Les routes API utilisent
le cache Next/`fetch` (s-maxage 15-3600s + stale-while-revalidate) pour
absorber le trafic sans hammering.

Variables d'environnement : aucune requise — toutes les API M Open Data
sont publiques.

---

## 📡 Sources de données

100 % données ouvertes officielles de **Grenoble-Alpes Métropole** via
`data.mobilites-m.fr` :

| Endpoint upstream | Usage |
|---|---|
| `/api/routers/default/index/routes` | Liste des lignes |
| `/api/lines/json?types=ligne&codes={X}` | Géométrie (GeoJSON) d'une ligne |
| `/api/routers/default/index/routes/{id}/stops` | Arrêts d'une ligne |
| `/api/routers/default/index/stops/{id}/stoptimes` | Horaires temps réel par arrêt |

Tous les appels sont proxifiés côté serveur Next.js (App Router) pour ajouter
l'header `Origin` requis et bénéficier du cache `fetch` natif.

### Positions véhicules

L'API publique du TAG n'expose pas de flux GTFS-RT vehicle-positions.
Les positions sont **dérivées** à partir des temps de passage temps réel
(`realtimeArrival`/`realtimeDeparture`) :

1. Pour chaque ligne, on récupère les `stoptimes` de tous ses arrêts
2. On agrège par `tripId` les paires `(arrêt, heure)` → trajectoire du véhicule
3. On localise le segment `[prevDeparture, nextArrival]` qui encadre **maintenant**
4. On interpole linéairement la position le long du segment entre les deux arrêts

Cette technique restitue fidèlement le mouvement des trams (intervalle court entre
stations) et reste raisonnable sur les lignes de bus structurantes.

---

## 🎨 Design system

Inspiré de **reso-m.fr** : thème clair, sans-serif moderne (Inter), flat,
couleurs neutres + accent magenta M réso.

Tokens dans [app/globals.css](./app/globals.css) :

```
--bg            #ffffff           Surface principale
--surface       #fcfcfd           Surface secondaire (hover, inputs)
--border        #e7e9ee           Bordures, séparateurs
--fg            #161a23           Texte principal
--muted         #565d6c           Texte secondaire
--accent        #dc1271           Magenta M réso (CTA, état actif)
--success       #229a64           Live, OK
--warning       #f4a623           Favoris, alerte
--danger        #df3030           Erreur
```

Échelle : 4 / 8 / 12 / 16 / 24 / 32. Radius 4 / 6 / 10 / 12 / 16 / 20 / 24.

---

## 🧩 Stack

- Next.js 15 (App Router, RSC pour les API routes)
- React 18 + TypeScript
- MapLibre GL JS (cartographie WebGL gratuite, tuiles OSM France)
- Tailwind CSS 3 + tokens CSS variables
- Radix UI primitives (Dialog, Popover, Switch…)
- Lucide React (icônes SVG)

---

## 📁 Structure

```
app/
  api/
    routes/route.ts             → liste des lignes
    line/[id]/route.ts          → géométrie d'une ligne
    stops/[routeId]/route.ts    → arrêts d'une ligne
    stoptimes/[stopId]/route.ts → horaires temps réel
    vehicles/[routeId]/route.ts → positions interpolées
  layout.tsx
  page.tsx
  globals.css
components/
  Map.tsx           → carte MapLibre, lignes, arrêts, véhicules
  Sidebar.tsx       → liste lignes, recherche, filtres, détail ligne
  StopPanel.tsx     → panneau temps réel pour un arrêt
  LinePill.tsx      → pastille couleur officielle d'une ligne
lib/
  api.ts            → wrapper upstream avec Origin header
  interpolate.ts    → calcul des positions véhicules
  store.tsx         → state global (Context + useReducer)
  types.ts          → types TS de l'API M
  utils.ts          → cn, hex, readableOn, formatRelativeTime
```

---

## ⚖️ Mentions

Données issues de l'API ouverte M Open Data (Syndicat Mixte des Mobilités de
l'Aire Grenobloise / Grenoble-Alpes Métropole) — licence ODbL. Fond de carte
© OpenStreetMap France.

Ce projet est un prototype d'utilisateur indépendant et n'est pas affilié à
M / Métromobilité / Grenoble-Alpes Métropole.
