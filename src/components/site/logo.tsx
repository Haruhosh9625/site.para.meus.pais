import Link from "next/link";

/**
 * Marca DS Espetos.
 * Monograma em SVG (espetos cruzados sobre a brasa) + nome em destaque.
 */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="DS Espetos">
      <defs>
        <linearGradient id="ds-fire" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#cc3f16" />
          <stop offset="1" stopColor="#f7b955" />
        </linearGradient>
      </defs>
      {/*
        O anel usa --border, que muda com o tema: sem ele, no modo escuro o
        disco escuro do logo se dissolvia no cabeçalho e sobrava só a chama
        flutuando.
      */}
      <circle cx="24" cy="24" r="23" fill="var(--color-coal-900)" stroke="var(--border)" strokeWidth="1.5" />
      <path
        d="M24 9c4.6 4.4 6.9 8.3 6.9 11.7 0 2.3-1 4-3 5.1.6-2.5.2-4.5-1.3-6.1.3 3.6-1 6.2-4 7.9-2.4 1.4-3.6 3.2-3.6 5.4 0 3 2.3 5.4 5.6 6.2-6.9.6-11.5-2.7-11.5-8.3 0-3 1.4-5.9 4.2-8.7C20.7 18.7 23 14.2 24 9z"
        fill="url(#ds-fire)"
      />
      <g stroke="var(--color-coal-100)" strokeWidth="2" strokeLinecap="round" opacity=".85">
        <path d="M13 38 35 16" />
        <path d="M35 38 13 16" />
      </g>
    </svg>
  );
}

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="DS Espetos, página inicial">
      <LogoMark className={compact ? "size-8" : "size-10"} />
      <span className="leading-none">
        <span
          className={
            "block font-extrabold tracking-tight " + (compact ? "text-base" : "text-lg sm:text-xl")
          }
        >
          DS <span className="text-brand-600">Espetos</span>
        </span>
        {!compact && (
          <span className="muted text-[11px] font-medium tracking-widest uppercase">
            Na brasa, do jeito certo
          </span>
        )}
      </span>
    </Link>
  );
}
