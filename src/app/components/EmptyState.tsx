import { type ReactNode } from "react";
import Link from "next/link";
import Button from "./Button";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      <div className="text-foreground-faint mb-4" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-foreground-muted max-w-xs mb-6">{description}</p>
      )}
      {action && (
        action.href ? (
          <Link href={action.href}>
            <Button variant="primary" size="default">{action.label}</Button>
          </Link>
        ) : (
          <Button variant="primary" size="default" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
