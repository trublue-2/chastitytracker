interface Props {
  username: string;
  size?: "sm" | "md" | "lg";
  /**
   * Färbt den Kreis nach dem Zustand des Trägers: `true` grün (verschlossen), `false` rosa (offen).
   *
   * **Weglassen heisst „Zustand unbekannt", nicht „offen".** Der Unterschied ist neu und trägt: seit
   * v6 haben BEIDE Zustände eine Farbe, und eine Vorgabe von `false` färbte damit jede Liste rosa,
   * die den Zustand gar nicht lädt — die Benutzerverwaltung etwa zeigt auch Konten, die keine
   * Träger sind. Vorher war „offen" der neutrale Kreis und die Verwechslung folgenlos.
   *
   * In der Keyholder-Welt ist dieser Kreis der einzige Weg, den Zustand zu zeigen: ihre Fläche
   * bleibt Indigo, egal wie viele Träger verschlossen sind.
   */
  locked?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-10 h-10 text-sm",
};

/** Round initial-avatar for a user. Extracted so the admin overview, the Benutzerverwaltung list
 *  and the sub context bar share one source instead of re-inlining the same circle. */
export default function UserAvatar({ username, size = "md", locked }: Props) {
  const stateCls = locked === undefined
    ? "bg-surface-raised text-foreground-muted"
    : locked ? "bg-lock-bg text-lock" : "bg-unlock-bg text-unlock";
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${stateCls}`}
    >
      {username[0]?.toUpperCase()}
    </div>
  );
}
