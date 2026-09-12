"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Field, Input, Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";

/**
 * Escolha do horário de retirada.
 *
 * A DS Espetos ainda não entrega: o cliente combina a hora e busca no balcão.
 * A hora é LIVRE — ele digita o que quiser — e a tela confere no servidor a
 * cada mudança para avisar na hora ("esse horário está lotado") em vez de
 * deixar o erro estourar só no fim do pedido.
 *
 * Importante: esta tela só ORIENTA. Quem decide se o horário vale é o
 * servidor, em services/scheduling.ts, tanto aqui quanto na criação do
 * pedido. Nada que o navegador mande é aceito sem essa conferência.
 */

export type ScheduleRules = {
  earliest: string | null;
  latest: string | null;
  minLeadMinutes: number;
  slotWindowMinutes: number;
  slotCapacity: number;
  horizonDays: number;
  todayOpen: string | null;
  todayClose: string | null;
  closedToday: boolean;
  timezone: string;
  suggestions: Array<{ time: string; at: string; remaining: number | null }>;
};

type CheckResult =
  | { valid: true; scheduledFor: string; window: { remaining: number | null } }
  | { valid: false; reason: string };

/** "2026-09-12T22:30:00.000Z" -> "19:30" no fuso da loja. */
function hourOf(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function SchedulePicker({
  value,
  onChange,
  onValidityChange,
  error,
}: {
  /** Hora escolhida, em "HH:MM". String vazia quando ainda não escolheu. */
  value: string;
  onChange: (time: string) => void;
  /** Avisa o formulário se o horário atual foi aprovado pelo servidor. */
  onValidityChange?: (valid: boolean) => void;
  error?: string;
}) {
  const [rules, setRules] = useState<ScheduleRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  // Cada conferência recebe um número; respostas atrasadas de horários
  // antigos são descartadas em vez de sobrescrever a atual.
  const requestId = useRef(0);

  useEffect(() => {
    void api<{ rules: ScheduleRules }>("/api/schedule")
      .then((data) => setRules(data.rules))
      .catch(() => setRules(null))
      .finally(() => setLoading(false));
  }, []);

  const check = useCallback(
    async (time: string) => {
      const id = ++requestId.current;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        setResult(null);
        onValidityChange?.(false);
        return;
      }
      setChecking(true);
      try {
        const data = await api<CheckResult>("/api/schedule/check", {
          method: "POST",
          body: { scheduledFor: time },
        });
        if (id !== requestId.current) return;
        setResult(data);
        onValidityChange?.(data.valid);
      } catch {
        if (id !== requestId.current) return;
        // Falha de rede não pode travar o pedido: o servidor confere de novo
        // na criação, então deixamos o cliente seguir.
        setResult(null);
        onValidityChange?.(true);
      } finally {
        if (id === requestId.current) setChecking(false);
      }
    },
    [onValidityChange],
  );

  // Espera o cliente parar de digitar antes de conferir.
  useEffect(() => {
    if (!value) {
      setResult(null);
      onValidityChange?.(false);
      return;
    }
    const timer = setTimeout(() => void check(value), 400);
    return () => clearTimeout(timer);
  }, [value, check, onValidityChange]);

  if (loading) {
    return (
      <p className="muted flex items-center gap-2 text-sm">
        <Spinner className="size-4" /> Carregando horários...
      </p>
    );
  }

  if (rules?.closedToday || (!rules?.earliest && !rules?.closedToday)) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="font-semibold">Hoje não temos horário disponível.</p>
        <p className="muted mt-1">
          {rules?.closedToday
            ? "Estamos fechados hoje."
            : "O expediente de hoje já encerrou para novos agendamentos."}{" "}
          Volte no próximo dia de funcionamento para agendar sua retirada.
        </p>
      </div>
    );
  }

  const earliestHour = hourOf(rules?.earliest ?? null, rules?.timezone ?? "America/Sao_Paulo");
  const latestHour = hourOf(rules?.latest ?? null, rules?.timezone ?? "America/Sao_Paulo");

  return (
    <div className="space-y-3">
      <p className="muted text-sm">
        Você escolhe a hora e deixamos tudo pronto para esse momento.{" "}
        {earliestHour && latestHour && (
          <>
            Hoje dá para retirar entre <strong>{earliestHour}</strong> e{" "}
            <strong>{latestHour}</strong>.
          </>
        )}
      </p>

      {(rules?.suggestions.length ?? 0) > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase">
            Horários com vaga
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sugestões de horário">
            {rules?.suggestions.map((suggestion) => (
              <button
                key={suggestion.time}
                type="button"
                onClick={() => onChange(suggestion.time)}
                aria-pressed={value === suggestion.time}
                className={cx(
                  // Alvo grande: no celular esse é o botão mais tocado da tela.
                  "min-h-11 rounded-xl border px-4 text-sm font-bold tabular-nums transition-colors",
                  value === suggestion.time
                    ? "border-brand-500 bg-brand-100 dark:bg-brand-900/50"
                    : "hover:bg-[var(--surface-sunken)]",
                )}
              >
                {suggestion.time}
                {suggestion.remaining !== null && suggestion.remaining <= 2 && (
                  <span className="muted ml-1.5 text-xs font-medium">
                    {suggestion.remaining} vaga{suggestion.remaining === 1 ? "" : "s"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field
        label="Ou digite outro horário"
        hint={
          rules
            ? `Com no mínimo ${rules.minLeadMinutes} minutos de antecedência${
                rules.horizonDays === 0 ? ", para hoje" : ""
              }.`
            : undefined
        }
        error={error ?? (result && !result.valid ? result.reason : undefined)}
        required
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            type="time"
            required
            // Passos de 5 minutos no seletor nativo, sem impedir qualquer
            // outro minuto digitado à mão.
            step={300}
            className="max-w-40 text-lg font-bold tabular-nums"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>

      <div aria-live="polite" className="min-h-5 text-sm">
        {checking && (
          <span className="muted flex items-center gap-2">
            <Spinner className="size-4" /> Conferindo o horário...
          </span>
        )}
        {!checking && result?.valid && (
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            Horário disponível — retirada às {value}.
            {result.window.remaining !== null && result.window.remaining <= 2 && (
              <span className="muted ml-1 font-medium">
                Últimas {result.window.remaining} vagas nesse horário.
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
