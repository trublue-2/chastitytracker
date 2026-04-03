import { assertAdmin } from "@/lib/authGuards";
import { Lock, LockOpen, ClipboardCheck, Droplets, Clipboard, Shield, BarChart3 } from "lucide-react";

import FormError from "@/app/components/FormError";
import FormField from "@/app/components/FormField";
import Spinner from "@/app/components/Spinner";
import Badge from "@/app/components/Badge";
import Card from "@/app/components/Card";
import Divider from "@/app/components/Divider";
import Skeleton from "@/app/components/Skeleton";
import EmptyState from "@/app/components/EmptyState";
import StatsCard from "@/app/components/StatsCard";
import EntryRow from "@/app/components/EntryRow";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import SessionTimeline from "@/app/components/SessionTimeline";

import {
  ButtonDemo, InputDemo, TextareaDemo, SelectDemo,
  CheckboxToggleDemo, DateTimePickerDemo, TabsDemo,
  ModalSheetDemo, PillDemo, StatusBadgeDemo,
  TimerDisplayDemo, ToastDemo,
} from "./InteractiveShowcase";

export default async function ComponentsShowcase() {
  await assertAdmin();

  const now = new Date();
  const inFuture = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const inPast = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const mockEntry = (type: string, extra?: Partial<{ note: string; orgasmusArt: string; kontrollCode: string }>) => ({
    id: `demo-${type}`,
    type,
    startTime: now,
    note: extra?.note ?? null,
    orgasmusArt: extra?.orgasmusArt ?? null,
    kontrollCode: extra?.kontrollCode ?? null,
  });

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-12">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-1">V3 Design System</h1>
        <p className="text-sm text-foreground-faint">
          29 Shared Primitives — Phase 0 Component Showcase. Admin only.
        </p>
      </div>

      {/* ════════════════════════════════════════════
         INPUTS
         ════════════════════════════════════════════ */}
      <SectionGroup title="Inputs">

        <Section title="Button" description="5 Varianten, 3 Groessen, Loading-State, Icon-Slots.">
          <ButtonDemo />
        </Section>

        <Section title="Input" description="Text-Eingabe mit Label, Error, Hint, Icon, Required.">
          <InputDemo />
        </Section>

        <Section title="Textarea" description="Mehrzeilig, max 200px, Zeichenzaehler.">
          <TextareaDemo />
        </Section>

        <Section title="Select" description="Nativer Select mit Label, Error, Placeholder.">
          <SelectDemo />
        </Section>

        <Section title="Checkbox + Toggle" description="An/Aus mit Label, Touch-optimiert (48px Tippflaeche).">
          <CheckboxToggleDemo />
        </Section>

        <Section title="DateTimePicker" description="Nativer datetime-local mit Label und Error.">
          <DateTimePickerDemo />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         FEEDBACK
         ════════════════════════════════════════════ */}
      <SectionGroup title="Feedback">

        <Section title="Toast" description="4 Typen, Auto-Dismiss, Stacking (max 3). Klick = Toast.">
          <ToastDemo />
        </Section>

        <Section title="FormError" description="Server-Fehler in Formularen. Varianten: card + inline.">
          <div className="flex flex-col gap-3 max-w-md">
            <p className="text-xs text-foreground-faint font-mono">variant=&quot;card&quot;</p>
            <FormError message="Du bist bereits verschlossen." />
            <p className="text-xs text-foreground-faint font-mono">variant=&quot;inline&quot;</p>
            <FormError message="Netzwerkfehler" variant="inline" />
            <p className="text-xs text-foreground-faint font-mono">message=null (rendert nichts)</p>
            <FormError message={null} />
          </div>
        </Section>

        <Section title="Spinner" description="3 Groessen: sm (16px), default (20px), lg (32px).">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Spinner size="sm" /> <span className="text-xs text-foreground-faint">sm</span>
            </div>
            <div className="flex items-center gap-2">
              <Spinner size="default" /> <span className="text-xs text-foreground-faint">default</span>
            </div>
            <div className="flex items-center gap-2">
              <Spinner size="lg" /> <span className="text-xs text-foreground-faint">lg</span>
            </div>
          </div>
        </Section>

        <Section title="Skeleton" description="Lade-Platzhalter in verschiedenen Formen.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg">
            <div>
              <p className="text-xs text-foreground-faint font-mono mb-2">text</p>
              <Skeleton variant="text" />
            </div>
            <div>
              <p className="text-xs text-foreground-faint font-mono mb-2">text-block</p>
              <Skeleton variant="text-block" />
            </div>
            <div>
              <p className="text-xs text-foreground-faint font-mono mb-2">card</p>
              <Skeleton variant="card" />
            </div>
            <div>
              <p className="text-xs text-foreground-faint font-mono mb-2">avatar + stat</p>
              <div className="flex items-center gap-4">
                <Skeleton variant="avatar" />
                <Skeleton variant="stat" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="EmptyState" description="Platzhalter wenn keine Daten vorhanden.">
          <div className="max-w-sm">
            <EmptyState
              icon={<Clipboard size={48} />}
              title="Noch keine Eintraege"
              description="Erstelle deinen ersten Eintrag."
              action={{ label: "Verschluss erfassen", href: "#" }}
            />
          </div>
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         LAYOUT
         ════════════════════════════════════════════ */}
      <SectionGroup title="Layout">

        <Section title="Card" description="4 Varianten: default, outlined, semantic, interactive.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
            <Card variant="default">
              <p className="text-sm font-medium">Default Card</p>
              <p className="text-xs text-foreground-muted">Shadow + Border</p>
            </Card>
            <Card variant="outlined">
              <p className="text-sm font-medium">Outlined Card</p>
              <p className="text-xs text-foreground-muted">Nur Border</p>
            </Card>
            <Card variant="semantic" semantic="lock">
              <p className="text-sm font-medium text-lock-text">Semantic (Lock)</p>
              <p className="text-xs text-lock-text">Farbiger Hintergrund</p>
            </Card>
            <Card variant="interactive">
              <p className="text-sm font-medium">Interactive Card</p>
              <p className="text-xs text-foreground-muted">Hover-Effekt</p>
            </Card>
          </div>
        </Section>

        <Section title="Modal + Sheet" description="Portal-Modal und Bottom-Sheet mit Focus-Trap.">
          <ModalSheetDemo />
        </Section>

        <Section title="Divider" description="3 Varianten: default, strong, labeled.">
          <div className="flex flex-col gap-4 max-w-md">
            <Divider variant="default" />
            <Divider variant="strong" />
            <Divider variant="labeled" label="oder" />
          </div>
        </Section>

        <Section title="Badge" description="Semantische Varianten mit optionalem Icon.">
          <div className="flex flex-wrap gap-2">
            <Badge variant="lock" label="Verschlossen" icon={<Lock size={12} />} />
            <Badge variant="unlock" label="Offen" icon={<LockOpen size={12} />} />
            <Badge variant="inspect" label="Kontrolle" icon={<ClipboardCheck size={12} />} />
            <Badge variant="orgasm" label="Orgasmus" icon={<Droplets size={12} />} />
            <Badge variant="request" label="Anforderung" />
            <Badge variant="sperrzeit" label="Sperrzeit" />
            <Badge variant="warn" label="Ueberfaellig" />
            <Badge variant="ok" label="Verifiziert" />
            <Badge variant="neutral" label="Neutral" />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="lock" label="Small" size="sm" />
            <Badge variant="warn" label="Small" size="sm" />
          </div>
        </Section>

        <Section title="Pill" description="Wie Badge, mit X-Entfernen-Button.">
          <PillDemo />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         NAVIGATION
         ════════════════════════════════════════════ */}
      <SectionGroup title="Navigation">

        <Section title="Tabs" description="Underline + Pills Varianten mit Keyboard-Navigation.">
          <TabsDemo />
        </Section>

        <Section title="BottomNav + Sidebar" description="Bestehende Komponenten — Update in Phase 1/2.">
          <p className="text-sm text-foreground-faint">
            BottomNav und Sidebar sind seitenweite Layout-Komponenten und werden hier nicht inline dargestellt.
            Sichtbar im normalen App-Layout.
          </p>
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         DOMAIN
         ════════════════════════════════════════════ */}
      <SectionGroup title="Domain-Komponenten">

        <Section title="StatusBadge" description="Lock-State Hero-Element. Large + Compact.">
          <StatusBadgeDemo />
        </Section>

        <Section title="TimerDisplay" description="Live-Timer: Countup/Countdown, Phasenfarben.">
          <TimerDisplayDemo />
        </Section>

        <Section title="StatsCard" description="Statistik-Kennzahl: default, progress, trend.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatsCard value="142h" label="Tragedauer gesamt" icon={<BarChart3 size={20} />} />
            <StatsCard value="68%" label="Tagesziel" variant="progress" progress={68} color="lock" />
            <StatsCard value="38h" label="Diese Woche" variant="trend" trend={{ direction: "up", label: "+12%" }} />
          </div>
        </Section>

        <Section title="SessionTimeline" description="Vertikale Timeline einer Lock-Session.">
          <div className="max-w-sm">
            <SessionTimeline
              isActive
              events={[
                { id: "1", type: "VERSCHLUSS", time: yesterday, label: "Verschluss", note: "Siegel #48291" },
                { id: "2", type: "PRUEFUNG", time: new Date(yesterday.getTime() + 6 * 3600_000), label: "Pruefung", note: "Code verifiziert" },
                { id: "3", type: "ORGASMUS", time: new Date(yesterday.getTime() + 12 * 3600_000), label: "Orgasmus", note: "Ruiniert" },
                { id: "4", type: "REINIGUNG", time: new Date(Date.now() - 4 * 3600_000), label: "Reinigung" },
              ]}
            />
          </div>
        </Section>

        <Section title="EntryRow" description="Eintrags-Zeile fuer Listen.">
          <div className="bg-surface rounded-2xl border border-border overflow-hidden max-w-lg divide-y divide-border-subtle">
            <EntryRow entry={mockEntry("VERSCHLUSS", { kontrollCode: "12345", note: "Siegel intakt" })} locale="de-CH" />
            <EntryRow entry={mockEntry("OEFFNEN", { note: "Reinigung" })} locale="de-CH" />
            <EntryRow entry={mockEntry("PRUEFUNG", { kontrollCode: "67890" })} locale="de-CH" />
            <EntryRow entry={mockEntry("ORGASMUS", { orgasmusArt: "ruinierter Orgasmus" })} locale="de-CH" />
          </div>
        </Section>

        <Section title="KontrolleBanner" description="Kontroll-Anforderung Status (compact + large).">
          <div className="flex flex-col gap-3 max-w-lg">
            <p className="text-xs text-foreground-faint font-mono">compact — offen</p>
            <KontrolleBanner deadline={inFuture} code="48291" overdue={false} variant="compact" />
            <p className="text-xs text-foreground-faint font-mono">compact — ueberfaellig</p>
            <KontrolleBanner deadline={inPast} code="48291" kommentar="Bitte sofort pruefen" overdue={true} variant="compact" />
            <p className="text-xs text-foreground-faint font-mono">large — offen</p>
            <KontrolleBanner deadline={inFuture} code="48291" overdue={false} variant="large" />
          </div>
        </Section>

        <Section title="LockRequestBanner" description="Verschluss-Anforderung + Sperrzeit.">
          <div className="flex flex-col gap-3 max-w-lg">
            <p className="text-xs text-foreground-faint font-mono">request — compact</p>
            <LockRequestBanner variant="compact" colorScheme="request" label="Verschluss angefordert" endetAt={inFuture} locale="de-CH" />
            <p className="text-xs text-foreground-faint font-mono">sperrzeit — compact</p>
            <LockRequestBanner variant="compact" colorScheme="sperrzeit" label="Verschlossen bis 15.04. 08:00" locale="de-CH" />
            <p className="text-xs text-foreground-faint font-mono">request — large</p>
            <LockRequestBanner variant="large" colorScheme="request" label="Einschliessen angefordert" nachricht="Bitte umgehend einschliessen." endetAtLabel="Bitte einschliessen bis: 15.04.2026, 18:00" />
          </div>
        </Section>

        <Section title="FormField" description="Label + Content Wrapper (bestehend).">
          <div className="flex flex-col gap-3 max-w-md">
            <FormField label="Benutzername">
              <input type="text" placeholder="z.B. admin" className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-foreground" />
            </FormField>
          </div>
        </Section>
      </SectionGroup>
    </main>
  );
}

function SectionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-xl font-bold text-foreground border-b border-border-strong pb-2">{title}</h2>
      {children}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-base font-semibold text-foreground mb-0.5">{title}</h3>
      <p className="text-xs text-foreground-faint mb-4">{description}</p>
      {children}
    </section>
  );
}
