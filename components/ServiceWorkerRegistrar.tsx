"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // skip non-prod builds
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
