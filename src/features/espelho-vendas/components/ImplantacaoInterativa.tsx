import { useEffect, useRef, useState } from 'react';

import { formatCurrency, IMPLANTACAO_FILTERS, STATUS_BG_CLASS, STATUS_DOT_HEX, STATUS_LABELS } from '@/features/espelho-vendas/constants';
import type { PublicProject, PublicUnit } from '@/features/espelho-vendas/types';
import type { UnitStatus } from '@/features/units/types';

interface ImplantacaoInterativaProps {
  project: PublicProject;
  units: PublicUnit[];
  onUnitSelect: (unit: PublicUnit) => void;
}

/**
 * Tradução de `ImplantacaoInterativa.jsx`. Inclui os 2 modos do original:
 * SVG interativo (`project.implantacao_svg_url`) e grade de cards
 * (fallback sem SVG).
 *
 * ACHADO DE AUDITORIA (não corrigido aqui, mesmo critério já aplicado ao
 * fetch morto de `WhatsAppFAB`/broker): o modo SVG mapeia unidade → path
 * pelo campo `unit.svg_path_id`, mas essa coluna NUNCA foi criada neste
 * schema (confirmado por grep em todo `supabase/migrations/` — só existe
 * em `ImplantacaoInterativa.jsx` do original, sem equivalente em
 * `0008_units.sql` nem em `get_public_units`). Na prática, se um projeto
 * tiver `implantacao_svg_url` preenchida, o SVG é renderizado (fidelidade
 * visual mantida) mas nenhum elemento fica clicável/colorido por status —
 * o mapeamento nunca encontra correspondência. Reportado para o
 * `schema-architect` decidir se adiciona a coluna ou remove o modo SVG;
 * não inventado aqui. A grade de cards (fallback, sem SVG) é 100%
 * funcional e não depende deste campo.
 */
export function ImplantacaoInterativa({ project, units, onUnitSelect }: ImplantacaoInterativaProps) {
  const [filter, setFilter] = useState<'todas' | UnitStatus>('todas');
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project.implantacao_svg_url) {
      setSvgContent(null);
      return;
    }
    let cancelled = false;
    fetch(project.implantacao_svg_url)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setSvgContent(text);
      })
      .catch(() => {
        if (!cancelled) setSvgContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project.implantacao_svg_url]);

  useEffect(() => {
    if (!svgContent || !svgContainerRef.current) return;
    const container = svgContainerRef.current;
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    svgEl.style.width = '100%';
    svgEl.style.height = '100%';

    // Ver comentário de topo: `svg_path_id` não existe no schema atual, este
    // mapa fica sempre vazio na prática, mantido por fidelidade estrutural.
    const unitMap: Record<string, PublicUnit> = {};
    units.forEach((u) => {
      const pathId = (u as unknown as Record<string, unknown>).svg_path_id;
      if (typeof pathId === 'string' && pathId) unitMap[pathId] = u;
    });

    const elements = svgEl.querySelectorAll('[id], [data-sku]');
    const cleanups: Array<() => void> = [];

    elements.forEach((el) => {
      const pathId = el.getAttribute('id') || el.getAttribute('data-sku');
      const unit = pathId ? unitMap[pathId] : undefined;
      if (!unit) return;

      const htmlEl = el as HTMLElement | SVGElement;
      htmlEl.style.fill = STATUS_DOT_HEX[unit.status];
      htmlEl.style.transition = 'filter 0.15s';

      if (unit.status !== 'bloqueada') {
        htmlEl.style.cursor = 'pointer';
        const onEnter = () => {
          htmlEl.style.filter = 'brightness(1.12) drop-shadow(0 2px 6px rgba(0,0,0,0.3))';
        };
        const onLeave = () => {
          htmlEl.style.filter = '';
        };
        const onClick = () => onUnitSelect(unit);
        el.addEventListener('mouseenter', onEnter);
        el.addEventListener('mouseleave', onLeave);
        el.addEventListener('click', onClick);
        cleanups.push(() => {
          el.removeEventListener('mouseenter', onEnter);
          el.removeEventListener('mouseleave', onLeave);
          el.removeEventListener('click', onClick);
        });
      } else {
        htmlEl.style.cursor = 'not-allowed';
        htmlEl.style.opacity = '0.5';
      }
    });

    return () => cleanups.forEach((fn) => fn());
  }, [svgContent, units, onUnitSelect]);

  const filteredUnits = filter === 'todas' ? units : units.filter((u) => u.status === filter);
  const countByStatus = (s: UnitStatus) => units.filter((u) => u.status === s).length;

  return (
    <section className="bg-espelho-sand px-6 py-20 md:px-10" style={{ fontFamily: 'var(--font-espelho-sans)' }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold text-espelho-navy/50 uppercase" style={{ letterSpacing: '0.25em' }}>
              — 01 · Implantação
            </p>
            <h2
              className="text-4xl font-light text-espelho-navy md:text-5xl"
              style={{ fontFamily: 'var(--font-espelho-serif)', letterSpacing: '-0.02em' }}
            >
              Escolha sua casa
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {IMPLANTACAO_FILTERS.map((f) => {
              const count = f === 'todas' ? units.length : countByStatus(f);
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-espelho-navy text-white' : 'bg-espelho-navy/8 text-espelho-navy'
                  }`}
                >
                  {f === 'todas' ? 'Todas' : STATUS_LABELS[f]}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${isActive ? 'bg-white/20' : 'bg-espelho-navy/15'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative min-h-[400px] overflow-hidden rounded-2xl bg-espelho-navy shadow-xl">
          {svgContent ? (
            <div ref={svgContainerRef} className="min-h-[400px] w-full" dangerouslySetInnerHTML={{ __html: svgContent }} />
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {filteredUnits.map((unit) => (
                  <UnitCardSmall key={unit.id} unit={unit} onSelect={onUnitSelect} />
                ))}
              </div>
              {filteredUnits.length === 0 && (
                <div className="py-16 text-center text-white/50">Nenhuma unidade encontrada neste filtro.</div>
              )}
            </div>
          )}

          <div className="absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl bg-black/40 px-4 py-3 backdrop-blur-sm">
            {(Object.keys(STATUS_LABELS) as UnitStatus[]).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`h-3 w-3 flex-shrink-0 rounded-full ${STATUS_BG_CLASS[key]}`} />
                <span className="text-xs font-medium text-white/80">{STATUS_LABELS[key]}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-espelho-navy/50">Toque numa unidade disponível ou reservada para ver detalhes.</p>
      </div>
    </section>
  );
}

function UnitCardSmall({ unit, onSelect }: { unit: PublicUnit; onSelect: (unit: PublicUnit) => void }) {
  const isClickable = unit.status !== 'bloqueada';

  return (
    <button
      onClick={() => isClickable && onSelect(unit)}
      disabled={!isClickable}
      className="rounded-xl bg-white/7 text-left transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className={`h-1.5 w-full ${STATUS_BG_CLASS[unit.status]}`} />
      <div className="p-3">
        <p className="mb-1 text-sm font-bold text-white">{unit.sku}</p>
        <p className="text-xs text-white/60">
          {unit.tipologia}
          {unit.area_m2 ? ` · ${unit.area_m2}m²` : ''}
        </p>
        {unit.list_price != null && <p className="mt-1 text-xs font-semibold text-white/80">{formatCurrency(unit.list_price)}</p>}
        <div className="mt-2 flex gap-2">
          {unit.quartos != null && <span className="flex items-center gap-0.5 text-xs text-white/50">🛏 {unit.quartos}</span>}
          {unit.vagas != null && <span className="flex items-center gap-0.5 text-xs text-white/50">🚗 {unit.vagas}</span>}
        </div>
      </div>
    </button>
  );
}
