import { formatCurrency } from '@/features/espelho-vendas/constants';
import type { PublicProject, PublicUnit } from '@/features/espelho-vendas/types';

interface EspelhoHeroProps {
  project: PublicProject;
  units: PublicUnit[];
  onScrollToImplantacao: () => void;
}

/**
 * Tradução 1:1 de `EspelhoHero.jsx` — inclui a mesma lógica de destaque de
 * título por número de palavras (`renderTitle`) e o grafismo decorativo
 * (gradiente no canto superior direito, some no mobile).
 */
export function EspelhoHero({ project, units, onScrollToImplantacao }: EspelhoHeroProps) {
  const disponiveis = units.filter((u) => u.status === 'disponivel').length;
  const words = project.name?.split(' ') ?? [];

  function renderTitle() {
    if (words.length >= 3) {
      return (
        <>
          {words[0]} <span className="text-espelho-orange">{words[1]}</span> <em>{words.slice(2).join(' ')}</em>
        </>
      );
    }
    if (words.length === 2) {
      return (
        <>
          {words[0]} <span className="text-espelho-orange">{words[1]}</span>
        </>
      );
    }
    return <span className="text-espelho-orange">{project.name}</span>;
  }

  return (
    <section
      className="relative overflow-hidden bg-espelho-bg px-6 py-16 md:px-10 md:py-24"
      style={{ fontFamily: 'var(--font-espelho-sans)' }}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 hidden h-full w-1/3 md:block"
        style={{ background: 'linear-gradient(135deg, transparent 60%, rgba(223,219,202,0.3) 100%)' }}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        {/* LEFT */}
        <div>
          <div className="mb-6 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-espelho-orange opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-espelho-orange" />
            </span>
            <span className="text-xs font-semibold tracking-widest text-espelho-navy/60 uppercase" style={{ letterSpacing: '0.25em' }}>
              Em vendas · MCMV Faixa {project.mcmv_faixa || '2/3'}
            </span>
          </div>

          <h1
            className="mb-4 text-5xl leading-tight font-light text-espelho-navy md:text-6xl"
            style={{ fontFamily: 'var(--font-espelho-serif)', letterSpacing: '-0.02em' }}
          >
            {renderTitle()}
          </h1>

          {(project.city || project.state) && (
            <div className="mb-5 flex items-center gap-1.5 text-espelho-navy/60">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">
                {project.city}
                {project.state ? `, ${project.state}` : ''}
              </span>
            </div>
          )}

          {project.description_public && (
            <p className="mb-8 max-w-md text-base leading-relaxed font-normal text-espelho-navy/70">{project.description_public}</p>
          )}

          <button
            onClick={onScrollToImplantacao}
            className="inline-flex items-center gap-2 rounded-full bg-espelho-orange px-7 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Ver unidades disponíveis
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* RIGHT — Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 rounded-2xl bg-espelho-navy p-6 text-white">
            <p className="mb-1 text-xs font-semibold tracking-widest text-white/60 uppercase">A partir de</p>
            <p className="text-3xl font-light text-espelho-orange" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
              {formatCurrency(project.valor_min)}
            </p>
            {project.valor_max && <p className="mt-1 text-sm text-white/50">até {formatCurrency(project.valor_max)}</p>}
          </div>

          <div className="rounded-2xl border border-espelho-navy/10 bg-white p-5">
            <p className="mb-1 text-xs font-semibold tracking-wider text-espelho-navy/50 uppercase">Entrada mín.</p>
            <p className="text-xl font-medium text-espelho-navy" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
              {formatCurrency(project.entrada_min)}
            </p>
          </div>

          <div className="rounded-2xl border border-espelho-navy/10 bg-white p-5">
            <p className="mb-1 text-xs font-semibold tracking-wider text-espelho-navy/50 uppercase">Parcela aprox.</p>
            <p className="text-xl font-medium text-espelho-navy" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
              {formatCurrency(project.parcela_aprox)}
            </p>
            <p className="mt-0.5 text-xs text-espelho-navy/40">por mês</p>
          </div>

          <div className="col-span-2 rounded-2xl bg-espelho-sand p-5">
            <p className="mb-1 text-xs font-semibold tracking-wider text-espelho-navy/60 uppercase">Unidades</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold text-espelho-navy" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
                {disponiveis}
              </p>
              <p className="text-sm text-espelho-navy/60">disponíveis</p>
            </div>
            <p className="mt-1 text-xs text-espelho-navy/50">{units.length} unidades no total</p>
          </div>
        </div>
      </div>
    </section>
  );
}
