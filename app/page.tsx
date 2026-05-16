"use client";
import { useEffect, useState } from "react";
import { AppProvider } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
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
import { CustomCursor } from "@/components/CustomCursor";
import { KonamiEasterEgg } from "@/components/KonamiEasterEgg";
import { FavStopArrivalParticles } from "@/components/FavStopArrivalParticles";
import { ReplayBar } from "@/components/ReplayBar";
import { IsochroneControl } from "@/components/IsochroneControl";
import MapView from "@/components/Map";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <AppProvider>
      <ToastProvider>
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
      </ToastProvider>
    </AppProvider>
  );
}
