import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProjectOperationalResult } from '@/features/investor-portal/hooks';
import { formatCurrency } from '@/features/investors/constants';
import { calculateInvestorShare, projectResultsFromOperationalResult } from '@/features/investors/resultHelpers';
import type { ProjectInvestor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';
import { pageUrl } from '@/lib/page-url';

interface InvestorProjectCardProps {
  project: Project;
  /** Vínculo (`project_investors`) do investidor logado com este projeto. */
  link: ProjectInvestor;
  /** Soma dos próprios `investment_contributions.valor` `CONFIRMADO` neste projeto — já calculada pela página, para não repetir o filtro em cada card. */
  aportado: number;
}

/**
 * Card de um projeto na lista "Meus Projetos" — tradução de
 * `InvestorProjects.jsx` (original), adaptado para buscar o Resultado
 * Operacional via `useProjectOperationalResult` (RPC `get_project_operational_result`,
 * `0056_investor_operational_result.sql`) em vez de cruzar `deals`/
 * `commissions` no client (RLS não libera SELECT dessas 2 tabelas para
 * `tenant_role = 'investidor'`, ver racional na migration).
 *
 * Um componente por card (em vez de uma única chamada de hook na página,
 * em loop) é proposital: cada card dispara SUA PRÓPRIA query React Query
 * (`useProjectOperationalResult(project.id)`) — chamar hooks dentro de um
 * `.map()` na página-mãe violaria as regras de hooks do React (número de
 * hooks variável entre renders conforme a quantidade de projetos).
 */
export function InvestorProjectCard({ project, link, aportado }: InvestorProjectCardProps) {
  const { data: operationalResult, isLoading, isError } = useProjectOperationalResult(project.id);

  const projectResults = operationalResult ? projectResultsFromOperationalResult(operationalResult) : null;
  const investorShare = projectResults ? calculateInvestorShare(projectResults, link.percentual_participacao) : null;

  const resultLabel = isLoading ? 'Carregando...' : isError || !projectResults ? '—' : undefined;

  return (
    <Link to={`${pageUrl('InvestorProjects')}/${project.id}`} className="block no-underline">
      <Card className="border-0 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>{project.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{project.code}</p>
            </div>
            <Badge className="bg-slate-500 text-white">{project.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg bg-muted p-3 lg:grid-cols-4">
            <div>
              <p className="mb-0.5 text-xs text-muted-foreground">Sua Participação</p>
              <p className="font-semibold text-foreground">{link.percentual_participacao.toFixed(2)}%</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-muted-foreground">Aportado</p>
              <p className="font-semibold text-foreground">{formatCurrency(aportado)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-muted-foreground">Lucro Esperado</p>
              <p className="font-semibold text-green-600">{resultLabel ?? formatCurrency(investorShare!.netResult)}</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-muted-foreground">Margem do Projeto</p>
              <p className="font-semibold text-foreground">{resultLabel ?? `${projectResults!.margin.toFixed(2)}%`}</p>
            </div>
          </div>

          <div className="flex items-center pt-2 text-sm text-muted-foreground">
            Ver Detalhes <ChevronRight className="ml-1 h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
