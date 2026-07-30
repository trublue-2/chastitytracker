import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Seit die Suite in `docker.yml` das Deploy gated, muss lokal dasselbe gelten wie auf dem
    // Runner: der läuft in UTC, die Entwicklungsmaschine in Europe/Zurich. Heute liest kein
    // Quellcode die Host-Zone (`utils.ts` rechnet gegen die Konstante `APP_TZ`), die Tests sind
    // also zonenunabhängig — diese Zeile hält es so. Ohne sie fiele ein künftiger, versehentlich
    // zonenabhängiger Test erst im Deploy-Gate auf statt beim Schreiben.
    env: { TZ: "UTC" },
  },
});
