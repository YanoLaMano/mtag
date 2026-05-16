import type { useApp } from "@/lib/store";

export type AppCtx = ReturnType<typeof useApp>;
export type AppState = AppCtx["state"];
export type AppDispatch = AppCtx["dispatch"];
