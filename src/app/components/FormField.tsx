interface Props {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export default function FormField({ label, htmlFor, children }: Props) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
