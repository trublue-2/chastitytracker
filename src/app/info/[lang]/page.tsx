import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Lock, LayoutDashboard, PlusCircle, BarChart2, ClipboardCheck, LogIn, ShieldCheck } from "lucide-react";

type Lang = "de" | "en";

const content = {
  de: {
    meta: {
      title: "KG-Tracker – App-Übersicht",
      description: "KG-Tracker: Keuschheitsgürtel-Tracking für Keuschheitsträger:innen und Schlüsselhalter:innen. Einschlüsse, Kontrollen und Statistiken auf einen Blick.",
    },
    login: "Anmelden",
    langSwitch: { label: "EN", href: "/info/en" },
    nav: [
      { id: "dashboard",   label: "Dashboard" },
      { id: "eintraege",   label: "Einträge" },
      { id: "statistiken", label: "Statistiken" },
      { id: "kontrollen",  label: "Kontrollen" },
      { id: "admin",       label: "Admin" },
    ],
    hero: {
      subtitle: "Keuschheitsgürtel-Tracking für Paare. Einschlüsse, Kontrollen und Statistiken — übersichtlich auf einen Blick.",
      cta: "Jetzt anmelden",
    },
    sections: [
      {
        id: "dashboard",
        icon: LayoutDashboard,
        iconColor: "text-emerald-600",
        title: "Dashboard-Übersicht",
        description: "Der Echtzeit-Status zeigt, ob der Gürtel gerade verschlossen ist und wie lange die aktuelle Session läuft. Darunter eine chronologische Liste aller Einschlusspaare mit Zeitstempeln und Fotos.",
        flip: false,
        shots: [
          { src: "/screenshots/info/01-dashboard-a.png", alt: "Dashboard – Status und Stats" },
          { src: "/screenshots/info/01-dashboard-b.png", alt: "Dashboard – Einschluss-Liste" },
          { src: "/screenshots/info/01-dashboard-c.png", alt: "Dashboard – Ältere Einträge" },
        ],
        features: [
          { icon: Lock, color: "text-emerald-500", text: "Echtzeit-Status: Verschlossen / Geöffnet mit laufender Zeitanzeige" },
          { icon: LayoutDashboard, color: "text-gray-400", text: "Alle Einschlusspaare mit Zeitstempel und Foto in chronologischer Liste" },
          { icon: ClipboardCheck, color: "text-orange-500", text: "Offene Kontrollen werden als prominentes Banner hervorgehoben" },
        ],
      },
      {
        id: "eintraege",
        icon: PlusCircle,
        iconColor: "text-indigo-600",
        title: "Einträge erfassen",
        description: "Vier Eintragstypen per Schnellauswahl: Verschluss mit Foto, Öffnung, Kontrolle mit Code-Erkennung und Orgasmus mit Typ.",
        flip: true,
        shots: [
          { src: "/screenshots/info/02-new-entry.png", alt: "Neuer Eintrag – Typenauswahl" },
          { src: "/screenshots/info/03-verschluss.png", alt: "Verschluss-Formular" },
        ],
        features: [
          { icon: Lock, color: "text-emerald-500", text: "Verschluss: Datum, Uhrzeit und obligatorisches Foto" },
          { icon: Lock, color: "text-gray-400", text: "Öffnen: Nur möglich bei aktivem Verschluss, mit optionaler Notiz" },
          { icon: ClipboardCheck, color: "text-orange-500", text: "Kontrolle: Foto mit handgeschriebenem Code, KI-gestützte Verifikation" },
          { icon: PlusCircle, color: "text-rose-500", text: "Orgasmus: Art (Dropdown) und optionale Notiz" },
        ],
      },
      {
        id: "statistiken",
        icon: BarChart2,
        iconColor: "text-indigo-600",
        title: "Statistiken & Kalender",
        description: "Detaillierte Auswertungen: Trainingsziel-Fortschritt, farbcodierter Tragekalender über 4 Monate, Monatsübersichten und persönliche Rekorde.",
        flip: false,
        shots: [
          { src: "/screenshots/info/05-stats-a.png", alt: "Statistiken – Übersicht" },
          { src: "/screenshots/info/05-stats-b.png", alt: "Statistiken – Kalender" },
          { src: "/screenshots/info/05-stats-c.png", alt: "Statistiken – Details" },
        ],
        features: [
          { icon: BarChart2, color: "text-indigo-500", text: "Trainingsziele für Tag, Woche und Monat mit Fortschrittsbalken" },
          { icon: LayoutDashboard, color: "text-gray-400", text: "Farbcodierter Tragekalender: Traganteil pro Tag auf einen Blick" },
          { icon: Lock, color: "text-amber-500", text: "Rekorde: Längste und kürzeste Session" },
        ],
      },
      {
        id: "kontrollen",
        icon: ClipboardCheck,
        iconColor: "text-orange-500",
        title: "Kontrollen",
        description: "Der Admin kann jederzeit eine Kontrolle anfordern. Der Benutzer erhält per E-Mail einen 5-stelligen Code und muss innerhalb von 4 Stunden ein Foto mit dem handgeschriebenen Code einreichen.",
        flip: true,
        shots: [
          { src: "/screenshots/info/04-pruefung.png", alt: "Kontrolle einreichen" },
          { src: "/screenshots/info/08-kontrollen-a.png", alt: "Admin-Kontrollen Übersicht" },
        ],
        features: [
          { icon: ClipboardCheck, color: "text-orange-500", text: "Admin fordert Kontrolle an — Benutzer erhält Code per E-Mail (4h Frist)" },
          { icon: PlusCircle, color: "text-gray-400", text: "Foto mit handgeschriebenem Code wird hochgeladen" },
          { icon: BarChart2, color: "text-indigo-500", text: "Automatische KI-Verifikation via Claude Vision — oder manuelle Freigabe durch Admin" },
        ],
      },
      {
        id: "admin",
        icon: ShieldCheck,
        iconColor: "text-indigo-600",
        title: "Admin-Bereich",
        description: "Admins verwalten alle Benutzer, fordern Kontrollen an und definieren Trainingsvorgaben. Eine zentrale Übersicht zeigt den Status aller Benutzer auf einen Blick.",
        flip: false,
        shots: [
          { src: "/screenshots/info/07-admin-a.png", alt: "Admin – Benutzerübersicht" },
          { src: "/screenshots/info/07-admin-b.png", alt: "Admin – weitere Benutzer" },
          { src: "/screenshots/info/09-vorgaben.png", alt: "Admin – Trainingsvorgaben" },
        ],
        features: [
          { icon: ShieldCheck, color: "text-indigo-500", text: "Benutzerübersicht: Status, Einschlussanzahl und offene Kontrollen aller Benutzer" },
          { icon: ClipboardCheck, color: "text-orange-500", text: "Kontrollen-Dashboard: Alle Anforderungen mit Status, Code und Foto-Verifikation" },
          { icon: BarChart2, color: "text-gray-400", text: "Trainingsvorgaben: Mindesttrage­zeiten pro Tag, Woche und Monat definieren" },
        ],
      },
    ],
    cta: {
      title: "Jetzt anmelden",
      subtitle: "Melde dich mit deinen Zugangsdaten an, um fortzufahren.",
      btn: "Zur Anmeldung",
    },
    footer: `KG-Tracker · © ${new Date().getFullYear()} · Alle Rechte vorbehalten`,
  },
  en: {
    meta: {
      title: "KG-Tracker – App Overview",
      description: "KG-Tracker: Chastity belt tracking for wearers and keyholders. Lock periods, checks, and statistics at a glance.",
    },
    login: "Log in",
    langSwitch: { label: "DE", href: "/info/de" },
    nav: [
      { id: "dashboard",   label: "Dashboard" },
      { id: "eintraege",   label: "Entries" },
      { id: "statistiken", label: "Statistics" },
      { id: "kontrollen",  label: "Checks" },
      { id: "admin",       label: "Admin" },
    ],
    hero: {
      subtitle: "Chastity belt tracking for couples. Lock periods, checks, and statistics — clearly at a glance.",
      cta: "Log in now",
    },
    sections: [
      {
        id: "dashboard",
        icon: LayoutDashboard,
        iconColor: "text-emerald-600",
        title: "Dashboard Overview",
        description: "The real-time status shows whether the belt is currently locked and how long the current session has been running. Below is a chronological list of all lock periods with timestamps and photos.",
        flip: false,
        shots: [
          { src: "/screenshots/info/01-dashboard-a.png", alt: "Dashboard – Status and Stats" },
          { src: "/screenshots/info/01-dashboard-b.png", alt: "Dashboard – Lock List" },
          { src: "/screenshots/info/01-dashboard-c.png", alt: "Dashboard – Older Entries" },
        ],
        features: [
          { icon: Lock, color: "text-emerald-500", text: "Real-time status: Locked / Opened with live time display" },
          { icon: LayoutDashboard, color: "text-gray-400", text: "All lock pairs with timestamp and photo in chronological list" },
          { icon: ClipboardCheck, color: "text-orange-500", text: "Open checks are highlighted as a prominent banner" },
        ],
      },
      {
        id: "eintraege",
        icon: PlusCircle,
        iconColor: "text-indigo-600",
        title: "Record Entries",
        description: "Four entry types via quick selection: lock with photo, opening, check with code recognition, and orgasm with type.",
        flip: true,
        shots: [
          { src: "/screenshots/info/02-new-entry.png", alt: "New Entry – Type Selection" },
          { src: "/screenshots/info/03-verschluss.png", alt: "Lock Form" },
        ],
        features: [
          { icon: Lock, color: "text-emerald-500", text: "Lock: Date, time, and mandatory photo" },
          { icon: Lock, color: "text-gray-400", text: "Opening: Only possible with an active lock, with optional note" },
          { icon: ClipboardCheck, color: "text-orange-500", text: "Check: Photo with handwritten code, AI-assisted verification" },
          { icon: PlusCircle, color: "text-rose-500", text: "Orgasm: Type (dropdown) and optional note" },
        ],
      },
      {
        id: "statistiken",
        icon: BarChart2,
        iconColor: "text-indigo-600",
        title: "Statistics & Calendar",
        description: "Detailed analytics: training goal progress, color-coded wear calendar over 4 months, monthly overviews, and personal records.",
        flip: false,
        shots: [
          { src: "/screenshots/info/05-stats-a.png", alt: "Statistics – Overview" },
          { src: "/screenshots/info/05-stats-b.png", alt: "Statistics – Calendar" },
          { src: "/screenshots/info/05-stats-c.png", alt: "Statistics – Details" },
        ],
        features: [
          { icon: BarChart2, color: "text-indigo-500", text: "Training goals for day, week and month with progress bars" },
          { icon: LayoutDashboard, color: "text-gray-400", text: "Color-coded wear calendar: daily wear share at a glance" },
          { icon: Lock, color: "text-amber-500", text: "Records: Longest and shortest session" },
        ],
      },
      {
        id: "kontrollen",
        icon: ClipboardCheck,
        iconColor: "text-orange-500",
        title: "Checks",
        description: "The admin can request a check at any time. The user receives a 5-digit code by email and must submit a photo with the handwritten code within 4 hours.",
        flip: true,
        shots: [
          { src: "/screenshots/info/04-pruefung.png", alt: "Submit Check" },
          { src: "/screenshots/info/08-kontrollen-a.png", alt: "Admin Checks Overview" },
        ],
        features: [
          { icon: ClipboardCheck, color: "text-orange-500", text: "Admin requests a check — user receives code by email (4h deadline)" },
          { icon: PlusCircle, color: "text-gray-400", text: "Photo with handwritten code is uploaded" },
          { icon: BarChart2, color: "text-indigo-500", text: "Automatic AI verification via Claude Vision — or manual approval by admin" },
        ],
      },
      {
        id: "admin",
        icon: ShieldCheck,
        iconColor: "text-indigo-600",
        title: "Admin Area",
        description: "Admins manage all users, request checks, and define training targets. A central overview shows the status of all users at a glance.",
        flip: false,
        shots: [
          { src: "/screenshots/info/07-admin-a.png", alt: "Admin – User Overview" },
          { src: "/screenshots/info/07-admin-b.png", alt: "Admin – More Users" },
          { src: "/screenshots/info/09-vorgaben.png", alt: "Admin – Training Targets" },
        ],
        features: [
          { icon: ShieldCheck, color: "text-indigo-500", text: "User overview: status, lock count, and open checks for all users" },
          { icon: ClipboardCheck, color: "text-orange-500", text: "Checks dashboard: all requests with status, code, and photo verification" },
          { icon: BarChart2, color: "text-gray-400", text: "Training targets: define minimum wear times per day, week, and month" },
        ],
      },
    ],
    cta: {
      title: "Log in now",
      subtitle: "Sign in with your credentials to continue.",
      btn: "Go to login",
    },
    footer: `KG-Tracker · © ${new Date().getFullYear()} · All rights reserved`,
  },
} as const;

function FeatureList({ items }: { items: readonly { icon: React.ElementType; color: string; text: string }[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <item.icon size={16} className={`flex-shrink-0 mt-0.5 ${item.color}`} />
          <span className="text-sm text-gray-600 leading-relaxed">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ScreenshotStrip({ shots }: { shots: readonly { src: string; alt: string }[] }) {
  return (
    <div className={`grid gap-2 ${shots.length === 1 ? "grid-cols-1" : shots.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {shots.map((s) => (
        <div key={s.src} className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
          <Image src={s.src} alt={s.alt} width={390} height={700} className="w-full block" unoptimized priority />
        </div>
      ))}
    </div>
  );
}

function Section({ id, flip = false, icon: Icon, iconColor, title, description, features, shots }: {
  id: string;
  flip?: boolean;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  features: readonly { icon: React.ElementType; color: string; text: string }[];
  shots: readonly { src: string; alt: string }[];
}) {
  const textBlock = (
    <div className="flex flex-col gap-5 justify-center">
      <div className={`flex items-center gap-2 ${iconColor}`}>
        <Icon size={20} />
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      <FeatureList items={features} />
    </div>
  );

  const imageBlock = <ScreenshotStrip shots={shots} />;
  const multiShot = shots.length > 1;

  if (multiShot) {
    return (
      <section id={id} className="scroll-mt-28 flex flex-col gap-6">
        {textBlock}
        {imageBlock}
      </section>
    );
  }

  return (
    <section id={id} className="scroll-mt-28 grid md:grid-cols-2 gap-8 items-start">
      {flip ? (
        <>
          <div className="md:order-2">{textBlock}</div>
          <div className="md:order-1">{imageBlock}</div>
        </>
      ) : (
        <>
          {textBlock}
          {imageBlock}
        </>
      )}
    </section>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const c = content[lang as Lang];
  if (!c) return {};
  return { title: c.meta.title, description: c.meta.description };
}

export default async function InfoPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (lang !== "de" && lang !== "en") notFound();
  const c = content[lang];

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
              <Lock size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">KG-Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={c.langSwitch.href}
              className="text-xs font-semibold text-gray-400 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              {c.langSwitch.label}
            </Link>
            <Link
              href="/login"
              className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-700 transition active:scale-95"
            >
              {c.login}
            </Link>
          </div>
        </div>
      </header>

      {/* Anchor Navigation */}
      <nav className="bg-white border-b border-gray-100 sticky top-14 z-10 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 h-10 flex items-center gap-1">
          {c.nav.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12 flex flex-col gap-20">
        {/* Hero */}
        <section className="flex flex-col items-center text-center gap-6 py-4">
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center">
            <Lock size={28} className="text-white" />
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-bold text-gray-900">KG-Tracker</h1>
            <p className="text-base text-gray-500 leading-relaxed max-w-lg mx-auto">{c.hero.subtitle}</p>
          </div>
          <Link
            href="/login"
            className="bg-gray-900 text-white rounded-xl px-6 py-3.5 font-semibold hover:bg-gray-700 transition active:scale-[0.98]"
          >
            {c.hero.cta}
          </Link>
        </section>

        <div className="w-full border-t border-gray-100" />

        {c.sections.map((s) => (
          <Section
            key={s.id}
            id={s.id}
            icon={s.icon}
            iconColor={s.iconColor}
            title={s.title}
            description={s.description}
            flip={s.flip}
            shots={s.shots}
            features={s.features}
          />
        ))}

        {/* CTA */}
        <section className="bg-gray-900 text-white rounded-2xl px-8 py-10 flex flex-col items-center text-center gap-5">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
            <LogIn size={22} className="text-white" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold">{c.cta.title}</h2>
            <p className="text-sm text-gray-400">{c.cta.subtitle}</p>
          </div>
          <Link
            href="/login"
            className="bg-white text-gray-900 rounded-xl px-6 py-3.5 font-semibold hover:bg-gray-100 transition active:scale-[0.98]"
          >
            {c.cta.btn}
          </Link>
        </section>

        <footer className="text-center text-xs text-gray-400 pb-4">{c.footer}</footer>
      </div>
    </div>
  );
}
