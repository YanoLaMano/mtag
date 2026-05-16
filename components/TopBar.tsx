"use client";
import { useApp } from "@/lib/store";
import { Flame, Moon, Sun, Route as RouteIcon, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccentPicker } from "./AccentPicker";

export function TopBar() {
  const { state, dispatch } = useApp();

  const openPalette = () => {
    const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    window.dispatchEvent(evt);
  };

  return (
    <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
      <button
        type="button"
        onClick={openPalette}
        className="hidden md:inline-flex h-10 px-3 rounded-2xl glass items-center gap-2 text-body text-muted hover:text-fg transition-colors btn-press ripple"
        aria-label="Ouvrir la palette de commandes"
      >
        <Command size={14} />
        <span>Rechercher</span>
        <kbd className="ml-1">⌘K</kbd>
      </button>

      <button
        type="button"
        onClick={() => dispatch({ type: "TOGGLE_TRIP" })}
        className={cn(
          "h-10 px-3 rounded-2xl glass inline-flex items-center gap-2 text-body font-medium transition-all btn-press ripple",
          state.tripOpen
            ? "!bg-accent !text-accent-fg !border-transparent shadow-glow"
            : "hover:bg-surface"
        )}
        aria-label="Itinéraire"
        aria-pressed={state.tripOpen ? "true" : "false"}
      >
        <RouteIcon size={14} />
        <span className="hidden sm:inline">Itinéraire</span>
      </button>

      <button
        type="button"
        onClick={() => dispatch({ type: "TOGGLE_HEATMAP" })}
        className={cn(
          "h-10 w-10 rounded-2xl glass inline-flex items-center justify-center transition-all btn-press ripple",
          state.showHeatmap
            ? "!bg-accent !text-accent-fg !border-transparent shadow-glow"
            : "hover:bg-surface"
        )}
        aria-label="Heatmap d'activité"
        aria-pressed={state.showHeatmap ? "true" : "false"}
      >
        <Flame size={15} />
      </button>

      <button
        type="button"
        onClick={() =>
          dispatch({ type: "SET_THEME", theme: state.theme === "dark" ? "light" : "dark" })
        }
        className="h-10 w-10 rounded-2xl glass inline-flex items-center justify-center hover:bg-surface transition-colors btn-press ripple"
        aria-label={state.theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
      >
        {state.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <AccentPicker />
    </div>
  );
}
