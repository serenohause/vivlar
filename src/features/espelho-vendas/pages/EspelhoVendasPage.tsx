import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CaracteristicasSection } from '@/features/espelho-vendas/components/CaracteristicasSection';
import { CTASection } from '@/features/espelho-vendas/components/CTASection';
import { EspelhoFooter } from '@/features/espelho-vendas/components/EspelhoFooter';
import { EspelhoHeader } from '@/features/espelho-vendas/components/EspelhoHeader';
import { EspelhoHero } from '@/features/espelho-vendas/components/EspelhoHero';
import { EspelhoSkeleton } from '@/features/espelho-vendas/components/EspelhoSkeleton';
import { ImplantacaoInterativa } from '@/features/espelho-vendas/components/ImplantacaoInterativa';
import { UnitModal } from '@/features/espelho-vendas/components/UnitModal';
import { WhatsAppFAB } from '@/features/espelho-vendas/components/WhatsAppFAB';
import { useCaptureUtms, useEspelhoFonts, useEspelhoSeo, usePublicProject, usePublicUnits } from '@/features/espelho-vendas/hooks';
import type { PublicUnit } from '@/features/espelho-vendas/types';

/**
 * Tradução de `original-project/src/pages/EspelhoVendas.jsx` — site
 * público de vendas ("espelho de vendas"), rota `/e/:slug`, FORA de
 * `ProtectedRoute`/`AppShell` (ver `src/routes/AppRoutes.tsx`): visitante
 * anônimo da internet, sem sessão, sem sidebar do sistema.
 *
 * Diferenças estruturais em relação ao original (motivadas pelo Supabase
 * ter RLS por linha, ao contrário da API do Base44):
 * - Nenhuma chamada direta a `projects`/`units` — só as 4 RPCs
 *   `security definer` de `0059_rls_espelho_vendas.sql` (ver
 *   `features/espelho-vendas/hooks.ts`), já que `anon` não tem grant
 *   nenhum nessas tabelas.
 * - Sem busca de `broker` responsável: `UnitModal.jsx` recebia o dado mas
 *   nunca o lia (fetch morto no original) — não portado, ver
 *   `WhatsAppFAB.tsx`.
 *
 * DÉBITO DE SCHEMA já sinalizado em `0059_rls_espelho_vendas.sql`:
 * `projects.slug` só é único por `(tenant_id, slug)`, não globalmente —
 * hoje inofensivo (1 tenant real), mas é um bug de roteamento em potencial
 * assim que existir um segundo tenant com slug colidente.
 */
export function EspelhoVendasPage() {
  const { slug } = useParams<{ slug: string }>();

  useCaptureUtms();

  const { data: project, isLoading: isLoadingProject } = usePublicProject(slug);
  const { data: unitsData, isLoading: isLoadingUnits } = usePublicUnits(project?.id);

  useEspelhoFonts();
  useEspelhoSeo(project);

  const [units, setUnits] = useState<PublicUnit[]>([]);
  useEffect(() => {
    if (unitsData) setUnits(unitsData);
  }, [unitsData]);

  const [selectedUnit, setSelectedUnit] = useState<PublicUnit | null>(null);
  const implantacaoRef = useRef<HTMLDivElement>(null);

  const isLoading = isLoadingProject || (Boolean(project) && isLoadingUnits);
  const notFound = !isLoadingProject && project === null;

  function handleUnitSelect(unit: PublicUnit) {
    if (unit.status === 'bloqueada') return;
    setSelectedUnit(unit);
  }

  function handleUnitUpdated(updatedUnit: PublicUnit) {
    setUnits((prev) => prev.map((u) => (u.id === updatedUnit.id ? updatedUnit : u)));
  }

  function scrollToImplantacao() {
    implantacaoRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  if (isLoading) return <EspelhoSkeleton />;

  if (notFound || !project) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-espelho-bg px-6 text-center"
        style={{ fontFamily: 'var(--font-espelho-sans)' }}
      >
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-espelho-navy">
          <span className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
            V
          </span>
        </div>
        <h1 className="mb-3 text-3xl font-semibold text-espelho-navy" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
          Empreendimento não disponível
        </h1>
        <p className="mb-8 max-w-sm text-espelho-navy/60">Esta página pode ter sido desativada ou o endereço está incorreto.</p>
        <a
          href="https://www.instagram.com/vivlarconstrutora"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-espelho-orange px-6 py-3 font-semibold text-white transition hover:bg-espelho-orange-dark"
        >
          Ver outros empreendimentos Vivlar
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-espelho-bg" style={{ fontFamily: 'var(--font-espelho-sans)' }}>
      <EspelhoHeader project={project} />

      <EspelhoHero project={project} units={units} onScrollToImplantacao={scrollToImplantacao} />

      <div ref={implantacaoRef}>
        <ImplantacaoInterativa project={project} units={units} onUnitSelect={handleUnitSelect} />
      </div>

      {project.caracteristicas && project.caracteristicas.length > 0 && (
        <CaracteristicasSection caracteristicas={project.caracteristicas} />
      )}

      <CTASection project={project} onScrollToImplantacao={scrollToImplantacao} />

      <EspelhoFooter />

      <WhatsAppFAB project={project} />

      {selectedUnit && (
        <UnitModal unit={selectedUnit} project={project} onClose={() => setSelectedUnit(null)} onUnitUpdated={handleUnitUpdated} />
      )}
    </div>
  );
}
