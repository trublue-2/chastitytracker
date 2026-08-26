import { WORLDS, type World } from "@/lib/theme";

/**
 * Das Raster der Bauteil-Schau: dieselbe Sache in jeder Welt, nebeneinander.
 *
 * **Bewusst OHNE `"use client"`.** Das Bauteil braucht keinen Hook, und es wird von beiden Seiten
 * benutzt: von der Seite (Server) und von `InteractiveShowcase` (Client). Lag es in der
 * Client-Datei, musste die Server-Seite ihm ihren Inhalt als FUNKTION reichen — und eine Funktion
 * über die Server/Client-Grenze ist nicht serialisierbar. React wirft dort zur Laufzeit, `tsc`
 * sieht es nicht, der Build auch nicht (die Seite ist hinter `assertAdmin()` dynamisch): die Schau
 * war mit einem 500 tot, und nichts in der Prüfkette hätte es gemeldet.
 *
 * Drei Spalten, nicht zwei: seit v6 gibt es keinen hellen Modus mehr, dafür zwei Träger-Welten.
 * Genau dafür ist die Schau da — sonst müsste man zwischen Bildschirmen wechseln und dabei
 * behalten, wie der vorige aussah.
 */
const WORLD_LABELS: Record<World, string> = {
  "sub-open": "Träger · offen",
  "sub-locked": "Träger · verschlossen",
  keyholder: "Keyholderin",
};

export default function WorldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {WORLDS.map((world) => (
        <div key={world} data-theme={world} className="bg-background rounded-xl border border-border p-4">
          <p className="text-[10px] font-mono text-foreground-faint mb-3 uppercase tracking-wider">{WORLD_LABELS[world]}</p>
          {children}
        </div>
      ))}
    </div>
  );
}
