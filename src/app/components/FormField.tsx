interface Props {
  label: string;
  children: React.ReactNode;
}

export default function FormField({ label, children }: Props) {
  return (
    <div>
      <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}
