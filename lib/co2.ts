// Emission factors (g CO2e per passenger-km) — sources ADEME 2024
export const CO2_GR_PER_KM = {
  walk: 0,
  bike: 0,
  ebike: 6,
  tram: 4.4,
  bus_urban: 132,    // average diesel French urban bus
  car_solo: 218,
  car_carpool_2: 109,
} as const;

// Average speed (km/h) used for time estimation when API isn't available
export const SPEEDS = {
  walk: 5,
  bike: 16,
  ebike: 20,
  transit: 22,   // mix tram+bus
  car: 30,       // urban
} as const;

export function compareModes(distanceKm: number) {
  const t = (km: number, kph: number) => Math.round((km / kph) * 60);
  return [
    {
      key: "walk", label: "Marche", icon: "footprints",
      timeMin: t(distanceKm, SPEEDS.walk),
      co2g: 0,
      detail: "0 g CO₂",
    },
    {
      key: "bike", label: "Vélo (Métrovélo)", icon: "bike",
      timeMin: t(distanceKm, SPEEDS.bike),
      co2g: Math.round(distanceKm * CO2_GR_PER_KM.bike),
      detail: "0 g CO₂",
    },
    {
      key: "transit", label: "Tram + bus", icon: "tram",
      timeMin: t(distanceKm, SPEEDS.transit),
      co2g: Math.round(distanceKm * (CO2_GR_PER_KM.tram * 0.5 + CO2_GR_PER_KM.bus_urban * 0.5)),
      detail: "M temps réel",
    },
    {
      key: "car", label: "Voiture (solo)", icon: "car",
      timeMin: t(distanceKm, SPEEDS.car),
      co2g: Math.round(distanceKm * CO2_GR_PER_KM.car_solo),
      detail: "Ref. CO₂",
    },
  ];
}

export function formatCO2(g: number): string {
  if (g <= 0) return "0 g";
  if (g < 1000) return `${g} g`;
  return `${(g / 1000).toFixed(1)} kg`;
}
