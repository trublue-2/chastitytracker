interface FormSuccessProps {
  message: string | null;
}

export default function FormSuccess({ message }: FormSuccessProps) {
  if (!message) return null;
  return (
    <p className="text-sm text-ok-text bg-ok-bg border border-ok-border rounded-xl px-4 py-3">
      {message}
    </p>
  );
}
