interface Props {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}

export default function FormField({ label, htmlFor, required, children }: Props) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2"
      >
        {label}
        {required && <span className="text-warn ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
