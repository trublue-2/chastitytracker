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
import {
  ThemePairClient,
  ButtonDemo, InputDemo, TextareaDemo, SelectDemo,
  CheckboxToggleDemo, DateTimePickerDemo, TabsDemo,
  ModalSheetDemo, PillDemo,
  TimerDisplayDemo, ToastDemo,
} from "./InteractiveShowcase";

import {
  PhotoCaptureDemo, ImageViewerDemo,
  CalendarContainerDemo, MonthStatsDemo,
  KontrolleListDemo, OrgasmenListDemo,
  NewEntrySheetDemo, AvatarMenuDemo,
  LocaleSwitcherDemo, UserContextBarDemo, UserSubNavDemo,
  LaufendeSessionCardMockDemo, SessionEventRowDemo,
  AdminFABMockDemo, InstallBannerMockDemo,
  VersionCheckerMockDemo, PushManagerMockDemo,
} from "./ComposedShowcase";

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
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-12">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-1">V3 Design System</h1>
        <p className="text-sm text-foreground-faint">
          44 Komponenten — Alle Primitives + Composed. Dual-Theme (User / Admin). Admin only.
        </p>
      </div>

      {/* ════════════════════════════════════════════
         INPUTS
         ════════════════════════════════════════════ */}
      <SectionGroup title="Inputs">

        <Section title="Button" description="5 Varianten, 3 Groessen, Loading-State, Icon-Slots.">
          <ThemePairClient component={ButtonDemo} />
        </Section>

        <Section title="Input" description="Text-Eingabe mit Label, Error, Hint, Icon, Required.">
          <ThemePairClient component={InputDemo} />
        </Section>

        <Section title="Textarea" description="Mehrzeilig, max 200px, Zeichenzaehler.">
          <ThemePairClient component={TextareaDemo} />
        </Section>

        <Section title="Select" description="Nativer Select mit Label, Error, Placeholder.">
          <ThemePairClient component={SelectDemo} />
        </Section>

        <Section title="Checkbox + Toggle" description="An/Aus mit Label, Touch-optimiert (48px Tippflaeche).">
          <ThemePairClient component={CheckboxToggleDemo} />
        </Section>

        <Section title="DateTimePicker" description="Nativer datetime-local mit Label und Error.">
          <ThemePairClient component={DateTimePickerDemo} />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         FEEDBACK
         ════════════════════════════════════════════ */}
      <SectionGroup title="Feedback">

        <Section title="Toast" description="4 Typen, Auto-Dismiss, Stacking (max 3). Klick = Toast.">
          <ThemePairClient component={ToastDemo} />
        </Section>

        <Section title="FormError" description="Server-Fehler in Formularen. Varianten: card + inline.">
          <ThemePair>
            <div className="flex flex-col gap-3 max-w-md">
              <p className="text-xs text-foreground-faint font-mono">variant=&quot;card&quot;</p>
              <FormError message="Du bist bereits verschlossen." />
              <p className="text-xs text-foreground-faint font-mono">variant=&quot;inline&quot;</p>
              <FormError message="Netzwerkfehler" variant="inline" />
              <p className="text-xs text-foreground-faint font-mono">message=null (rendert nichts)</p>
              <FormError message={null} />
            </div>
          </ThemePair>
        </Section>

        <Section title="Spinner" description="3 Groessen: sm (16px), default (20px), lg (32px).">
          <ThemePair>
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
          </ThemePair>
        </Section>

        <Section title="Skeleton" description="Lade-Platzhalter in verschiedenen Formen.">
          <ThemePair>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
          </ThemePair>
        </Section>

        <Section title="EmptyState" description="Platzhalter wenn keine Daten vorhanden.">
          <ThemePair>
            <EmptyState
              icon={<Clipboard size={48} />}
              title="Noch keine Eintraege"
              description="Erstelle deinen ersten Eintrag."
              action={{ label: "Verschluss erfassen", href: "#" }}
            />
          </ThemePair>
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         LAYOUT
         ════════════════════════════════════════════ */}
      <SectionGroup title="Layout">

        <Section title="Card" description="4 Varianten: default, outlined, semantic, interactive.">
          <ThemePair>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </ThemePair>
        </Section>

        <Section title="Modal + Sheet" description="Portal-Modal und Bottom-Sheet mit Focus-Trap.">
          <ThemePairClient component={ModalSheetDemo} />
        </Section>

        <Section title="Divider" description="3 Varianten: default, strong, labeled.">
          <ThemePair>
            <div className="flex flex-col gap-4">
              <Divider variant="default" />
              <Divider variant="strong" />
              <Divider variant="labeled" label="oder" />
            </div>
          </ThemePair>
        </Section>

        <Section title="Badge" description="Semantische Varianten mit optionalem Icon.">
          <ThemePair>
            <div>
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
            </div>
          </ThemePair>
        </Section>

        <Section title="Pill" description="Wie Badge, mit X-Entfernen-Button.">
          <ThemePairClient component={PillDemo} />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         NAVIGATION
         ════════════════════════════════════════════ */}
      <SectionGroup title="Navigation">

        <Section title="Tabs" description="Underline + Pills Varianten mit Keyboard-Navigation.">
          <ThemePairClient component={TabsDemo} />
        </Section>

        <Section title="BottomNav + Sidebar" description="Seitenweite Layout-Komponenten — sichtbar im normalen App-Layout.">
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

        <Section title="LaufendeSessionCard" description="Session-Hero mit Live-Timer, Trainingsvorgaben, Timeline und Sperrzeit. Statischer Nachbau.">
          <ThemePairClient component={LaufendeSessionCardMockDemo} />
        </Section>

        <Section title="SessionEventRow" description="Timeline-Zeile: Verschluss, Kontrolle (offen/erfüllt/überfällig), Reinigung, Orgasmus. Mit Pills, Code, Kommentar.">
          <ThemePairClient component={SessionEventRowDemo} />
        </Section>

        <Section title="TimerDisplay" description="Live-Timer: Countup/Countdown, Phasenfarben.">
          <ThemePairClient component={TimerDisplayDemo} />
        </Section>

        <Section title="StatsCard" description="Statistik-Kennzahl: default, progress, trend.">
          <ThemePair>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard value="142h" label="Tragedauer gesamt" icon={<BarChart3 size={20} />} />
              <StatsCard value="68%" label="Tagesziel" variant="progress" progress={68} color="lock" />
              <StatsCard value="38h" label="Diese Woche" variant="trend" trend={{ direction: "up", label: "+12%" }} />
            </div>
          </ThemePair>
        </Section>

        <Section title="EntryRow" description="Eintrags-Zeile fuer Listen.">
          <ThemePair>
            <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border-subtle">
              <EntryRow entry={mockEntry("VERSCHLUSS", { kontrollCode: "12345", note: "Siegel intakt" })} locale="de-CH" />
              <EntryRow entry={mockEntry("OEFFNEN", { note: "Reinigung" })} locale="de-CH" />
              <EntryRow entry={mockEntry("PRUEFUNG", { kontrollCode: "67890" })} locale="de-CH" />
              <EntryRow entry={mockEntry("ORGASMUS", { orgasmusArt: "ruinierter Orgasmus" })} locale="de-CH" />
            </div>
          </ThemePair>
        </Section>

        <Section title="KontrolleBanner" description="Kontroll-Anforderung Status (compact + large).">
          <ThemePair>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-foreground-faint font-mono">compact — offen</p>
              <KontrolleBanner deadline={inFuture} code="48291" overdue={false} variant="compact" />
              <p className="text-xs text-foreground-faint font-mono">compact — ueberfaellig</p>
              <KontrolleBanner deadline={inPast} code="48291" kommentar="Bitte sofort pruefen" overdue={true} variant="compact" />
              <p className="text-xs text-foreground-faint font-mono">large — offen</p>
              <KontrolleBanner deadline={inFuture} code="48291" overdue={false} variant="large" />
            </div>
          </ThemePair>
        </Section>

        <Section title="LockRequestBanner" description="Verschluss-Anforderung + Sperrzeit.">
          <ThemePair>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-foreground-faint font-mono">request — compact</p>
              <LockRequestBanner variant="compact" colorScheme="request" label="Verschluss angefordert" endetAt={inFuture} locale="de-CH" />
              <p className="text-xs text-foreground-faint font-mono">sperrzeit — compact</p>
              <LockRequestBanner variant="compact" colorScheme="sperrzeit" label="Verschlossen bis 15.04. 08:00" locale="de-CH" />
              <p className="text-xs text-foreground-faint font-mono">request — large</p>
              <LockRequestBanner variant="large" colorScheme="request" label="Einschliessen angefordert" nachricht="Bitte umgehend einschliessen." endetAtLabel="Bitte einschliessen bis: 15.04.2026, 18:00" />
            </div>
          </ThemePair>
        </Section>

        <Section title="FormField" description="Label + Content Wrapper (bestehend).">
          <ThemePair>
            <div className="flex flex-col gap-3">
              <FormField label="Benutzername">
                <input type="text" placeholder="z.B. admin" className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-foreground" />
              </FormField>
            </div>
          </ThemePair>
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         MEDIA
         ════════════════════════════════════════════ */}
      <SectionGroup title="Media">

        <Section title="PhotoCapture" description="Foto-Upload mit Kamera-Support. Mobile: Direktaufnahme, Desktop: Datei + Webcam.">
          <ThemePairClient component={PhotoCaptureDemo} />
        </Section>

        <Section title="ImageViewer" description="Thumbnail → Fullscreen-Modal mit Pinch-Zoom.">
          <ThemePairClient component={ImageViewerDemo} />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         DATENLISTEN
         ════════════════════════════════════════════ */}
      <SectionGroup title="Datenlisten (paginiert)">

        <Section title="CalendarContainer" description="Monats-Kalender mit farbkodierten Tragetagen und Tages-Detail-Modal.">
          <ThemePairClient component={CalendarContainerDemo} />
        </Section>

        <Section title="MonthStats" description="Monatliche Tragestatistik-Tabelle mit Zielen und Show-More.">
          <ThemePairClient component={MonthStatsDemo} />
        </Section>

        <Section title="KontrolleItemListClient" description="Paginierte Kontrolle-Liste mit Status-Pills und Thumbnails.">
          <ThemePairClient component={KontrolleListDemo} />
        </Section>

        <Section title="OrgasmenListClient" description="Paginierte Orgasmen-Liste mit Typ und Notiz.">
          <ThemePairClient component={OrgasmenListDemo} />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         NAVIGATION CHROME
         ════════════════════════════════════════════ */}
      <SectionGroup title="Navigation Chrome">

        <Section title="NewEntrySheet" description="Bottom-Sheet mit Eintragstyp-Auswahl (bedingt aktiv je nach Schloss-Status).">
          <ThemePairClient component={NewEntrySheetDemo} />
        </Section>

        <Section title="AvatarMenu" description="User-Avatar mit Dropdown: Settings, Sign-Out.">
          <ThemePairClient component={AvatarMenuDemo} />
        </Section>

        <Section title="LocaleSwitcher" description="DE/EN Toggle, speichert in Cookie.">
          <ThemePairClient component={LocaleSwitcherDemo} />
        </Section>

        <Section title="UserContextBar" description="Admin: User + Lock-Status + User-Wechsel (sticky, hier contained).">
          <ThemePairClient component={UserContextBarDemo} />
        </Section>

        <Section title="UserSubNav" description="Admin User-Detail: Tabs (Desktop) / Dropdown (Mobile).">
          <ThemePairClient component={UserSubNavDemo} />
        </Section>
      </SectionGroup>

      {/* ════════════════════════════════════════════
         UTILITY / SYSTEM
         ════════════════════════════════════════════ */}
      <SectionGroup title="Utility / System">

        <Section title="InstallBanner" description="PWA-Installationsaufforderung (Android/iOS). Statischer Nachbau.">
          <ThemePairClient component={InstallBannerMockDemo} />
        </Section>

        <Section title="VersionChecker" description="App-Update-Banner. Pollt /api/version alle 5 Min. Statischer Nachbau.">
          <ThemePairClient component={VersionCheckerMockDemo} />
        </Section>

        <Section title="PushManager" description="Push-Notification Toggle. Benötigt Service Worker. Statischer Nachbau.">
          <ThemePairClient component={PushManagerMockDemo} />
        </Section>

        <Section title="AdminFAB" description="Floating Action Button → User-Picker Sheet. Statischer Nachbau.">
          <ThemePairClient component={AdminFABMockDemo} />
        </Section>
      </SectionGroup>
    </main>
  );
}

// ── Helpers ───────────────────────────────────

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

function ThemePair({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div data-theme="user" className="bg-background rounded-xl border border-border p-4">
        <p className="text-[10px] font-mono text-foreground-faint mb-3 uppercase tracking-wider">User (Light)</p>
        {children}
      </div>
      <div data-theme="admin" className="bg-background rounded-xl border border-border p-4">
        <p className="text-[10px] font-mono text-foreground-faint mb-3 uppercase tracking-wider">Admin (Dark)</p>
        {children}
      </div>
    </div>
  );
}
