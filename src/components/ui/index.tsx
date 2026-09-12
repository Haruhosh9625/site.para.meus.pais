"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

/**
 * Componentes básicos de interface.
 *
 * Regras de acessibilidade que valem para todos:
 *  - todo campo tem <label> ligado por id;
 *  - erro é anunciado por aria-describedby + role="alert";
 *  - botões têm área de toque mínima de 44px (classe .tap);
 *  - estados de carregamento usam aria-busy, não só um spinner visual.
 */

// --------------------------------- Button ----------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  /*
    O botão da marca é amarelo, e amarelo é claro: texto branco em cima dele
    fica em 1,85:1 — ilegível. Por isso o texto é escuro em TODOS os estados,
    e o pressionado escurece só até o 600, que ainda aceita texto escuro.
  */
  primary:
    "bg-brand-500 text-coal-900 hover:bg-brand-400 active:bg-brand-600 " +
    "disabled:bg-brand-200 disabled:text-coal-500 shadow-sm",
  secondary:
    "bg-coal-900 text-white hover:bg-coal-800 active:bg-coal-950 disabled:opacity-50 dark:bg-coal-100 dark:text-coal-900",
  outline:
    "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-sunken)] text-[var(--text)]",
  ghost: "hover:bg-[var(--surface-sunken)] text-[var(--text)]",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300",
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "text-sm px-3 py-2 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2",
  lg: "text-base px-5 py-3.5 rounded-xl gap-2 font-semibold",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "tap inline-flex items-center justify-center font-medium transition-colors",
        "disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

// --------------------------------- Spinner ---------------------------------

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------- Field ----------------------------------

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="text-brand ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_CLASS =
  "w-full rounded-xl border bg-[var(--surface)] px-3.5 py-3 text-base transition-colors " +
  "placeholder:text-[var(--text-muted)] focus:border-brand-500 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cx(CONTROL_CLASS, invalid && "border-red-500", className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_CLASS, "min-h-24 resize-y", invalid && "border-red-500", className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_CLASS, "appearance-none pr-9", invalid && "border-red-500", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath fill='%236d6154' d='M6 8 0 0h12z'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
        backgroundSize: "10px",
      }}
      {...props}
    >
      {children}
    </select>
  );
});

// ---------------------------------- Badge ----------------------------------

const BADGE_TONES = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-muted)]",
  brand: "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------- Estados vazios ----------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-4xl" aria-hidden="true">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="muted max-w-md text-sm">{description}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} aria-hidden="true" />;
}

/** Mensagem de erro em bloco, com opção de tentar de novo. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
    >
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Tentar novamente
        </button>
      )}
    </div>
  );
}

