/** External link to the public how-to content on the marketing site. Always opens in a new tab —
 *  the app is a PWA, an in-place navigation would drop the user out of the installed shell.
 *  `className` carries the semantic colour of the surrounding block (default: muted). */
export default function HelpLink({ href, label, className = "text-foreground-muted" }: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`self-start text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100 ${className}`}
    >
      {label}
    </a>
  );
}
