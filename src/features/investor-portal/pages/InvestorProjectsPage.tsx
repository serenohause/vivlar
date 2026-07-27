import { Building2 } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { InvestorNotLinkedState } from '@/features/investor-portal/components/InvestorNotLinkedState';
import { InvestorProjectCard } from '@/features/investor-portal/components/InvestorProjectCard';
import { useMyInvestor } from '@/features/investor-portal/hooks';
import { useInvestmentContributions, useProjectInvestors } from '@/features/investors/hooks';
import { useProjects } from '@/features/projects/hooks';

/**
 * Tradução de `original-project/src/pages/InvestorProjects.jsx` — "Meus
 * Projetos", primeira tela real do Portal do Investidor (`tenant_role =
 * 'investidor'`).
 *
 * SIMPLIFICAÇÃO EM RELAÇÃO AO ORIGINAL: o original busca TODOS os
 * `ProjectInvestor`/`Project`/`Deal`/`Commission`/`FinanceEvent` e filtra
 * `investor_id === currentUser.id` no client (bug já documentado em
 * `0055_rls_investor_portal.sql`). Aqui isso é desnecessário —
 * `useProjects()`/`useProjectInvestors()`/`useInvestmentContributions()` são
 * as MESMAS queries do lado admin, mas a RLS (`0055`) já devolve só os
 * projetos/vínculos/aportes do investidor autenticado, sem precisar
 * repetir o filtro aqui (mesma simplificação já aplicada ao Portal do
 * Cliente, módulo 11). O Resultado Operacional de cada projeto (Lucro
 * Esperado/Margem) vem da RPC `get_project_operational_result` — ver
 * `InvestorProjectCard`, que dispara essa busca por projeto.
 */
export function InvestorProjectsPage() {
  const { data: investor, isLoading: isLoadingInvestor, isError: isErrorInvestor, refetch: refetchInvestor } = useMyInvestor();
  const { data: projects, isLoading: isLoadingProjects, isError: isErrorProjects, refetch: refetchProjects } = useProjects();
  const { data: links, isLoading: isLoadingLinks, isError: isErrorLinks, refetch: refetchLinks } = useProjectInvestors();
  const {
    data: contributions,
    isLoading: isLoadingContributions,
    isError: isErrorContributions,
    refetch: refetchContributions,
  } = useInvestmentContributions();

  const isLoading = isLoadingInvestor || (Boolean(investor) && (isLoadingProjects || isLoadingLinks || isLoadingContributions));
  const isError = isErrorInvestor || isErrorProjects || isErrorLinks || isErrorContributions;

  function refetchAll() {
    void refetchInvestor();
    void refetchProjects();
    void refetchLinks();
    void refetchContributions();
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={refetchAll} />;
  if (!investor) return <InvestorNotLinkedState />;

  const allProjects = projects ?? [];
  const activeLinks = (links ?? []).filter((link) => !link.is_deleted);
  const confirmedContributions = (contributions ?? []).filter((c) => !c.is_deleted && c.status === 'CONFIRMADO');

  const myProjects = activeLinks
    .map((link) => {
      const project = allProjects.find((p) => p.id === link.project_id && !p.is_deleted);
      if (!project) return null;

      const aportado = confirmedContributions.filter((c) => c.project_id === project.id).reduce((sum, c) => sum + c.valor, 0);

      return { project, link, aportado };
    })
    .filter((entry): entry is { project: (typeof allProjects)[number]; link: (typeof activeLinks)[number]; aportado: number } => entry !== null);

  return (
    <div className="space-y-6">
      <PageHeader title="Meus Projetos" subtitle="Projetos em que você possui participação" />

      {myProjects.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum projeto vinculado" description="Você não possui participação em nenhum projeto no momento" />
      ) : (
        <div className="grid gap-4">
          {myProjects.map(({ project, link, aportado }) => (
            <InvestorProjectCard key={project.id} project={project} link={link} aportado={aportado} />
          ))}
        </div>
      )}
    </div>
  );
}
