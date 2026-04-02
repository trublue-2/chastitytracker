import { assertAdmin } from "@/lib/authGuards";
import FormError from "@/app/components/FormError";
import FormField from "@/app/components/FormField";
import EntryRow from "@/app/components/EntryRow";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import ActionModalDemo from "./ActionModalDemo";

export default async function ComponentsShowcase() {
  await assertAdmin();

  const now = new Date();
  const inFuture = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const inPast = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const mockEntry = (type: string, extra?: Partial<{ note: string; orgasmusArt: string; kontrollCode: string }>) => ({
    id: `demo-${type}`,
    type,
    startTime: now,
    note: extra?.note ?? null,
    orgasmusArt: extra?.orgasmusArt ?? null,
    kontrollCode: extra?.kontrollCode ?? null,
  });

  return (
    <main className="w-full max-w-4xl px-6 py-8 flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-1">Komponentenbibliothek</h1>
        <p className="text-sm text-foreground-faint">Shared Primitives — Admin only, nicht in Produktion verlinkt.</p>
      </div>

      {/* ── FormError ── */}
      <Section title="FormError" description="Einheitliche Fehler-Anzeige für alle Formulare.">
        <div className="flex flex-col gap-3 max-w-md">
          <Label>variant=&quot;default&quot;</Label>
          <FormError message="Passwort muss mindestens 8 Zeichen lang sein." />
          <Label>variant=&quot;compact&quot;</Label>
          <FormError message="Netzwerkfehler" variant="compact" />
          <Label>message=null (rendert nichts)</Label>
          <FormError message={null} />
        </div>
      </Section>

      {/* ── FormField ── */}
      <Section title="FormField" description="Label + Content Wrapper für Form-Inputs.">
        <div className="flex flex-col gap-3 max-w-md">
          <FormField label="Benutzername">
            <input type="text" placeholder="z.B. admin" className="w-full bg-surface-raised border border-border rounded-xl px-4 py-3 text-sm text-foreground" />
          </FormField>
          <FormField label="Anweisung (optional)">
            <textarea placeholder="Freitext..." rows={2} className="w-full bg-surface-raised border border-border rounded-xl px-4 py-3 text-sm text-foreground resize-none" />
          </FormField>
        </div>
      </Section>

      {/* ── ActionModal ── */}
      <Section title="ActionModal" description="Portal-Modal mit Backdrop, Scroll-Lock, Icon-Header und X-Close.">
        <ActionModalDemo />
      </Section>

      {/* ── EntryRow ── */}
      <Section title="EntryRow" description="Eintrags-Zeile für Listen (Dashboard + Admin Einträge).">
        <div className="bg-surface rounded-2xl border border-border overflow-hidden max-w-lg divide-y divide-border-subtle">
          <EntryRow entry={mockEntry("VERSCHLUSS", { kontrollCode: "12345", note: "Siegel intakt" })} locale="de-CH" />
          <EntryRow entry={mockEntry("OEFFNEN", { note: "Reinigung" })} locale="de-CH" />
          <EntryRow entry={mockEntry("PRUEFUNG", { kontrollCode: "67890" })} locale="de-CH" />
          <EntryRow entry={mockEntry("ORGASMUS", { orgasmusArt: "ruinierter Orgasmus" })} locale="de-CH" />
          <EntryRow entry={mockEntry("VERSCHLUSS")} locale="de-CH" actions={<span className="text-xs text-foreground-faint">⋮ (Action Slot)</span>} />
        </div>
      </Section>

      {/* ── KontrolleBanner ── */}
      <Section title="KontrolleBanner" description="Kontroll-Anforderung Status (compact + large, open + overdue).">
        <div className="flex flex-col gap-3 max-w-lg">
          <Label>compact — offen</Label>
          <KontrolleBanner deadline={inFuture} code="48291" overdue={false} variant="compact" />
          <Label>compact — überfällig</Label>
          <KontrolleBanner deadline={inPast} code="48291" kommentar="Bitte sofort prüfen" overdue={true} variant="compact" />
          <Label>large — offen</Label>
          <KontrolleBanner deadline={inFuture} code="48291" overdue={false} variant="large" />
          <Label>large — überfällig mit Kommentar</Label>
          <KontrolleBanner deadline={inPast} code="48291" kommentar="Siegel zeigen!" overdue={true} variant="large" />
        </div>
      </Section>

      {/* ── LockRequestBanner ── */}
      <Section title="LockRequestBanner" description="Verschluss-Anforderung + Sperrzeit Banner (compact + large, normal + overdue).">
        <div className="flex flex-col gap-3 max-w-lg">
          <Label>compact — request (offen)</Label>
          <LockRequestBanner variant="compact" colorScheme="request" label="Verschluss angefordert" endetAt={inFuture} locale="de-CH" />
          <Label>compact — request (überfällig)</Label>
          <LockRequestBanner variant="compact" colorScheme="request" label="Verschluss überfällig" overdue endetAt={inPast} locale="de-CH" />
          <Label>compact — sperrzeit</Label>
          <LockRequestBanner variant="compact" colorScheme="sperrzeit" label="Verschlossen bis 15.04. 08:00" locale="de-CH" />
          <Label>compact — sperrzeit (unbefristet)</Label>
          <LockRequestBanner variant="compact" colorScheme="sperrzeit" label="Unbefristet verschlossen" locale="de-CH" />
          <Label>large — request</Label>
          <LockRequestBanner variant="large" colorScheme="request" label="Einschliessen angefordert" nachricht="Bitte umgehend einschliessen." endetAtLabel="Bitte einschliessen bis: 15.04.2026, 18:00" />
          <Label>large — sperrzeit</Label>
          <LockRequestBanner variant="large" colorScheme="sperrzeit" label="Verschlossen" nachricht="Mindest-Tragedauer läuft." endetAtLabel="Öffnen nicht erlaubt bis: 16.04.2026, 08:00" />
        </div>
      </Section>
    </main>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-foreground mb-0.5">{title}</h2>
      <p className="text-xs text-foreground-faint mb-4">{description}</p>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-foreground-faint font-mono mt-2">{children}</p>;
}
