"use client";

import { useState } from "react";
import {
  Bell, Lock, LockOpen, ClipboardCheck, Droplets, Settings,
  Search, Shield, BarChart3, Calendar, FileText,
} from "lucide-react";

import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Select from "@/app/components/Select";
import Checkbox from "@/app/components/Checkbox";
import Toggle from "@/app/components/Toggle";
import DateTimePicker from "@/app/components/DateTimePicker";
import Tabs from "@/app/components/Tabs";
import ActionModal from "@/app/components/ActionModal";
import Sheet from "@/app/components/Sheet";
import Pill from "@/app/components/Pill";
import TimerDisplay from "@/app/components/TimerDisplay";
import useToast from "@/app/hooks/useToast";

// ── Theme Pair Wrappers (Client) ─────────────

/** Dual-theme wrapper for interactive demos that need independent state per column.
 *  Pass a component reference + props — it gets instantiated twice. */
export function ThemePairClient<P extends Record<string, unknown>>({
  component: Component,
  props,
}: {
  component: React.ComponentType<P>;
  props?: P;
}) {
  const p = (props ?? {}) as P;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div data-theme="user" className="bg-background rounded-xl border border-border p-4">
        <p className="text-[10px] font-mono text-foreground-faint mb-3 uppercase tracking-wider">User (Light)</p>
        <Component {...p} />
      </div>
      <div data-theme="admin" className="bg-background rounded-xl border border-border p-4">
        <p className="text-[10px] font-mono text-foreground-faint mb-3 uppercase tracking-wider">Admin (Dark)</p>
        <Component {...p} />
      </div>
    </div>
  );
}

// ── Button Demos ──────────────────────────────
export function ButtonDemo() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-foreground-faint font-mono">Varianten</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="semantic" semantic="lock" icon={<Lock size={16} />}>Lock</Button>
        <Button variant="semantic" semantic="inspect" icon={<Bell size={16} />}>Inspect</Button>
      </div>
      <p className="text-xs text-foreground-faint font-mono">Groessen</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
      </div>
      <p className="text-xs text-foreground-faint font-mono">States</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled>Disabled</Button>
        <Button
          loading={loading}
          onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 2000); }}
        >
          {loading ? "Laden..." : "Klick = Loading"}
        </Button>
        <Button icon={<Search size={16} />}>Mit Icon</Button>
        <Button fullWidth variant="secondary">Full Width</Button>
      </div>
    </div>
  );
}

// ── Input Demos ───────────────────────────────
export function InputDemo() {
  return (
    <div className="flex flex-col gap-3 max-w-md">
      <Input label="Benutzername" placeholder="z.B. admin" required />
      <Input label="E-Mail" type="email" placeholder="name@example.com" hint="Wird fuer Benachrichtigungen verwendet" />
      <Input label="Passwort" type="password" placeholder="Mindestens 8 Zeichen" error="Passwort zu kurz" />
      <Input label="Suche" placeholder="Suchen..." icon={<Search size={16} />} />
      <Input label="Deaktiviert" placeholder="..." disabled />
    </div>
  );
}

// ── Textarea Demo ─────────────────────────────
export function TextareaDemo() {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-3 max-w-md">
      <Textarea
        label="Notiz"
        placeholder="Optionaler Kommentar..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
      />
      <Textarea label="Mit Fehler" error="Feld darf nicht leer sein" required />
    </div>
  );
}

// ── Select Demo ───────────────────────────────
export function SelectDemo() {
  return (
    <div className="flex flex-col gap-3 max-w-md">
      <Select
        label="Oeffnungsgrund"
        placeholder="Bitte waehlen..."
        options={[
          { value: "REINIGUNG", label: "Reinigung" },
          { value: "KEYHOLDER", label: "Keyholder" },
          { value: "NOTFALL", label: "Notfall" },
          { value: "ANDERES", label: "Anderes" },
        ]}
      />
      <Select
        label="Mit Fehler"
        options={[{ value: "a", label: "Option A" }]}
        error="Pflichtfeld"
      />
    </div>
  );
}

// ── Checkbox + Toggle Demo ────────────────────
export function CheckboxToggleDemo() {
  const [checked, setChecked] = useState(false);
  const [toggled, setToggled] = useState(true);

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <Checkbox
        label="Unbefristet"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
      />
      <Checkbox label="Deaktiviert" checked={false} disabled onChange={() => {}} />
      <Toggle
        label="Reinigung erlauben"
        description="Benutzer darf fuer Reinigung oeffnen"
        checked={toggled}
        onChange={(v) => setToggled(v)}
      />
      <Toggle label="Deaktiviert" checked={false} disabled onChange={() => {}} />
    </div>
  );
}

// ── DateTimePicker Demo ───────────────────────
export function DateTimePickerDemo() {
  return (
    <div className="flex flex-col gap-3 max-w-md">
      <DateTimePicker label="Startzeit" required />
      <DateTimePicker label="Mit Fehler" error="Startzeit liegt in der Zukunft" />
    </div>
  );
}

// ── Tabs Demo ─────────────────────────────────
export function TabsDemo() {
  const [activeU, setActiveU] = useState("overview");
  const [activeP, setActiveP] = useState("a");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-foreground-faint font-mono">variant=&quot;underline&quot;</p>
      <Tabs
        variant="underline"
        activeTab={activeU}
        onChange={setActiveU}
        tabs={[
          { key: "overview", label: "Uebersicht" },
          { key: "entries", label: "Eintraege" },
          { key: "controls", label: "Kontrollen" },
          { key: "stats", label: "Statistiken" },
          { key: "settings", label: "Einstellungen" },
        ]}
      />
      <p className="text-xs text-foreground-faint font-mono">variant=&quot;pills&quot;</p>
      <Tabs
        variant="pills"
        activeTab={activeP}
        onChange={setActiveP}
        tabs={[
          { key: "a", label: "Tag" },
          { key: "b", label: "Woche" },
          { key: "c", label: "Monat" },
        ]}
      />
    </div>
  );
}

// ── Modal + Sheet Demo ────────────────────────
export function ModalSheetDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
        Modal oeffnen
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)}>
        Sheet oeffnen
      </Button>

      <ActionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Beispiel-Modal"
        icon={<Settings size={20} className="text-foreground-muted" />}
        iconBg="var(--background-subtle)"
      >
        <p className="text-sm text-foreground-muted">Modal-Inhalt mit Focus-Trap und ESC-Schliessen.</p>
        <Button variant="primary" onClick={() => setModalOpen(false)}>Schliessen</Button>
      </ActionModal>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Beispiel-Sheet">
        <p className="text-sm text-foreground-muted mb-4">Sheet-Inhalt, mobile-optimiert von unten.</p>
        <Button variant="primary" fullWidth onClick={() => setSheetOpen(false)}>Schliessen</Button>
      </Sheet>
    </div>
  );
}

// ── Pill Demo ─────────────────────────────────
export function PillDemo() {
  const [pills, setPills] = useState(["Lock", "Inspect", "Orgasm"]);
  const variants: Array<"lock" | "inspect" | "orgasm"> = ["lock", "inspect", "orgasm"];

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p, i) => (
        <Pill
          key={p}
          label={p}
          variant={variants[i]}
          onRemove={() => setPills(pills.filter((x) => x !== p))}
        />
      ))}
      {pills.length === 0 && (
        <Button variant="ghost" size="sm" onClick={() => setPills(["Lock", "Inspect", "Orgasm"])}>
          Reset
        </Button>
      )}
    </div>
  );
}

// ── TimerDisplay Demo ─────────────────────────
export function TimerDisplayDemo() {
  const past = new Date(Date.now() - 3 * 24 * 60 * 60_000 - 14 * 60 * 60_000);
  const future = new Date(Date.now() + 2 * 60 * 60_000 + 30 * 60_000);
  const soonFuture = new Date(Date.now() + 5 * 60_000);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-foreground-faint w-32">Countup (long):</span>
        <TimerDisplay targetDate={past} mode="countup" format="long" className="text-2xl" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-foreground-faint w-32">Countdown (long):</span>
        <TimerDisplay targetDate={future} mode="countdown" format="long" className="text-2xl" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-foreground-faint w-32">Countdown (short):</span>
        <TimerDisplay targetDate={soonFuture} mode="countdown" format="short" className="text-xl" />
      </div>
    </div>
  );
}

// ── Toast Demo ────────────────────────────────
export function ToastDemo() {
  const toast = useToast();

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="semantic" semantic="ok" size="sm" onClick={() => toast.success("Eintrag gespeichert")}>
        Success Toast
      </Button>
      <Button variant="danger" size="sm" onClick={() => toast.error("Speichern fehlgeschlagen")}>
        Error Toast
      </Button>
      <Button variant="semantic" semantic="inspect" size="sm" onClick={() => toast.warning("Reinigungszeit fast abgelaufen")}>
        Warning Toast
      </Button>
      <Button variant="semantic" semantic="unlock" size="sm" onClick={() => toast.info("KI-Verifikation laeuft...")}>
        Info Toast
      </Button>
    </div>
  );
}
