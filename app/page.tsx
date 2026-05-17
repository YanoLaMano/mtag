"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AppProvider } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
import { VehiclesProvider } from "@/lib/vehicles-store";
import { Sidebar } from "@/components/Sidebar";
import { StopPanel } from "@/components/StopPanel";
import { TopBar } from "@/components/TopBar";
import { TripPlanner } from "@/components/TripPlanner";
import { LiveVehiclesPanel } from "@/components/LiveVehiclesPanel";
import { VehicleDetailPanel } from "@/components/VehicleDetailPanel";
import { NearMeFab } from "@/components/NearMeFab";
import { DisruptionsBanner } from "@/components/DisruptionsBanner";
import { UrlSync } from "@/components/UrlSync";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { CommandPalette } from "@/components/CommandPalette";
import { StatusBar } from "@/components/StatusBar";
import { Splash } from "@/components/Splash";
import { ReplayBar } from "@/components/ReplayBar";
import { IsochroneControl } from "@/components/IsochroneControl";
import MapView from "@/components/Map";

const CustomCursor = dynamic(
  () => import("@/components/CustomCursor").then((m) => m.CustomCursor),
  { ssr: false, loading: () => null }
);
const KonamiEasterEgg = dynamic(
  () => import("@/components/KonamiEasterEgg").then((m) => m.KonamiEasterEgg),
  { ssr: false, loading: () => null }
);
const FavStopArrivalParticles = dynamic(
  () => import("@/components/FavStopArrivalParticles").then((m) => m.FavStopArrivalParticles),
  { ssr: false, loading: () => null }
);

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <AppProvider>
      <ToastProvider>
        <VehiclesProvider>
        <Splash />
        <CustomCursor />
        <main className="fixed inset-0 bg-bg overflow-hidden">
          {mounted ? (
            <MapView />
          ) : (
            <div className="absolute inset-0 bg-surface flex items-center justify-center">
              <div className="text-caption animate-pulse">Chargement de la carte…</div>
            </div>
          )}
          <Sidebar />
          <StopPanel />
          <LiveVehiclesPanel />
          <VehicleDetailPanel />
          <DisruptionsBanner />
          <TopBar />
          <NearMeFab />
          <ReplayBar />
          <IsochroneControl />
          <TripPlanner />
          <CommandPalette />
          <StatusBar />
          <FavStopArrivalParticles />
          <KonamiEasterEgg />
          <UrlSync />
          <ServiceWorkerRegistrar />
        </main>
        </VehiclesProvider>
      </ToastProvider>
    </AppProvider>
  );
}
