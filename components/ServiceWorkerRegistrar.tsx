"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.hostname === "localhost") return; // skip dev
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
