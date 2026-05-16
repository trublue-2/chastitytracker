import pkg from "../../package.json";
import UpdateAvailableIndicator from "@/app/components/UpdateAvailableIndicator";

export default function Footer({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className={`hidden sm:block border-t border-border-subtle mt-auto py-4 px-6 bg-background ${className ?? ""}`}>
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-faint">
        <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition">© trublue {year}</a>
        <span className="flex items-center gap-3">
          <UpdateAvailableIndicator currentVersion={pkg.version} />
          <span className="font-mono bg-surface-raised text-foreground-faint px-1.5 py-0.5 rounded">v{pkg.version}</span>
        </span>
      </div>
    </footer>
  );
}
