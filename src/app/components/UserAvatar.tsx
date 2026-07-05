interface Props {
  username: string;
  size?: "sm" | "md" | "lg";
  /** Switches to the lock color — used in keyholder views to flag a currently-locked sub. */
  locked?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-10 h-10 text-sm",
};

/** Round initial-avatar for a user. Extracted so the admin overview, the Benutzerverwaltung list
 *  and the sub context bar share one source instead of re-inlining the same circle. */
export default function UserAvatar({ username, size = "md", locked = false }: Props) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
        locked ? "bg-lock-bg text-lock" : "bg-surface-raised text-foreground-muted"
      }`}
    >
      {username[0]?.toUpperCase()}
    </div>
  );
}
