// Open-Meteo uses WMO weather codes (https://open-meteo.com/en/docs).
// Map each to a Portuguese label that lines up with the strings the old
// IPMA TIPOS_TEMPO produced, so iconeEstadoTempo() in src/lib/utils.tsx
// (which pattern-matches the label text) keeps working unchanged.
export const WMO_TIPOS_TEMPO: Record<number, string> = {
  0: "Céu limpo",
  1: "Pouco nublado",
  2: "Parcialmente nublado",
  3: "Muito nublado",
  45: "Nevoeiro",
  48: "Nevoeiro",
  51: "Chuva fraca",
  53: "Chuva fraca",
  55: "Chuva fraca",
  56: "Chuva fraca",
  57: "Chuva fraca",
  61: "Chuva fraca",
  63: "Chuva",
  65: "Chuva forte",
  66: "Chuva",
  67: "Chuva forte",
  71: "Neve",
  73: "Neve",
  75: "Neve forte",
  77: "Neve",
  80: "Aguaceiros fracos",
  81: "Aguaceiros",
  82: "Aguaceiros fortes",
  85: "Aguaceiros de neve",
  86: "Aguaceiros de neve",
  95: "Trovoada",
  96: "Trovoada com chuva",
  99: "Trovoada com chuva forte",
};

// Open-Meteo gives wind speed in km/h; the existing scoring engine
// (src/lib/scoring.ts) is calibrated against IPMA's 0–9 Beaufort-like
// class. This converts so the recommendation algorithm doesn't need
// retuning. Boundaries are standard Beaufort (km/h).
export function ventoKmhToClasse(kmh: number | null | undefined): number | null {
  if (kmh == null || Number.isNaN(kmh)) return null;
  if (kmh < 2) return 0;
  if (kmh < 6) return 1;
  if (kmh < 12) return 2;
  if (kmh < 20) return 3;
  if (kmh < 29) return 4;
  if (kmh < 39) return 5;
  if (kmh < 50) return 6;
  if (kmh < 62) return 7;
  if (kmh < 75) return 8;
  return 9;
}
