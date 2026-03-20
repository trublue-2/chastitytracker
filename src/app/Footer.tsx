import pkg from "../../package.json";

export default function Footer({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  const buildDate = process.env.BUILD_DATE
    ? new Date(process.env.BUILD_DATE).toLocaleString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "local";

  return (
    <footer className={`hidden sm:block border-t border-gray-100 mt-auto py-4 px-6 bg-[#f8f9fb] ${className ?? ""}`}>
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-gray-300">
        <a href="https://fetlife.com/trublue_2" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition">© trublue {year}</a>
        <span className="flex items-center gap-3">
          <span>Build {buildDate}</span>
          <span className="font-mono bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">v{pkg.version}</span>
        </span>
      </div>
    </footer>
  );
}
