import { Link } from 'react-router-dom';
import { AlertCircle, Home, MapPin, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { useMyClient } from '@/features/client-portal/hooks';
import { UnitAdminStatusBadge } from '@/features/units/components/UnitAdminStatusBadge';
import { useUnits } from '@/features/units/hooks';
import { useProjects } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/ClientUnit.jsx` — "Minha Unidade",
 * primeira tela do Portal do Cliente (`tenant_role = 'cliente'`).
 *
 * SIMPLIFICAÇÃO EM RELAÇÃO AO ORIGINAL: o original busca `Deal.filter({
 * client_id })` e filtra `sales_stage === "VENDIDO"` no client para
 * descobrir quais unidades são do cliente, porque a API do Base44 não tinha
 * RLS por linha. Aqui isso é desnecessário — `useUnits()` já usa a MESMA
 * query de `UnitsListPage` (lado admin), mas a RLS (`units_select_tenant_client_own`,
 * `0053_rls_client_portal_access.sql`, via `client_owns_unit()`) devolve
 * SOMENTE a(s) unidade(s) com negócio `vendido` para o usuário autenticado —
 * o filtro por `deals`/`sales_stage` já acontece no banco, não precisa ser
 * repetido aqui. `deals` nunca é lido pelo Portal do Cliente de propósito
 * (RLS não libera SELECT da tabela para `tenant_role = 'cliente'` — ver
 * racional completo no topo de `0053_rls_client_portal_access.sql`).
 */
export function ClientUnitPage() {
  const { data: client, isLoading: isLoadingClient, isError: isErrorClient, refetch: refetchClient } = useMyClient();
  const { data: units, isLoading: isLoadingUnits, isError: isErrorUnits, refetch: refetchUnits } = useUnits();
  const { data: projects } = useProjects();

  const isLoading = isLoadingClient || (Boolean(client) && isLoadingUnits);
  const isError = isErrorClient || isErrorUnits;

  const allProjects = projects ?? [];

  function projectOf(projectId: string) {
    return allProjects.find((p) => p.id === projectId);
  }

  if (isLoading) return <LoadingInline />;
  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          void refetchClient();
          void refetchUnits();
        }}
      />
    );
  }

  if (!client) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="max-w-md border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-600" />
            <h3 className="mb-2 text-lg font-semibold">Perfil não vinculado</h3>
            <p className="text-slate-600">
              Você ainda não possui um perfil de cliente vinculado. Entre em contato com a Vivlar para mais informações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const myUnits = units ?? [];

  if (myUnits.length === 0) {
    return (
      <div>
        <PageHeader title="Minha Unidade" subtitle="Informações sobre sua unidade" />
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <Home className="mx-auto mb-4 h-12 w-12 text-amber-600" />
            <h3 className="mb-2 text-lg font-semibold">Nenhuma unidade vinculada</h3>
            <p className="text-slate-600">Você ainda não possui uma unidade vinculada ao seu perfil. Entre em contato com a Vivlar.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Minha Unidade" subtitle="Informações sobre sua(s) unidade(s)" />

      <div className="grid gap-6">
        {myUnits.map((unit) => {
          const project = projectOf(unit.project_id);

          return (
            <Card key={unit.id} className="border-0 shadow-sm">
              <CardHeader className="border-b bg-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
                      <Home className="h-6 w-6 text-brand" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{unit.sku}</CardTitle>
                      <p className="text-sm text-slate-500">{project?.name ?? '—'}</p>
                    </div>
                  </div>
                  <Link to={`${pageUrl('ClientMaintenance')}?unit=${unit.id}`}>
                    <Button variant="brand">
                      <Plus className="mr-2 h-4 w-4" />
                      Solicitar Manutenção
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="mb-1 text-sm text-slate-500">Bloco</p>
                    <p className="font-medium text-slate-900">{unit.bloco || '—'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-slate-500">Tipologia</p>
                    <p className="font-medium text-slate-900">{unit.tipologia || '—'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-slate-500">Área</p>
                    <p className="font-medium text-slate-900">{unit.area_m2 ? `${unit.area_m2.toFixed(2)} m²` : '—'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-slate-500">Etapa Atual (MCMV)</p>
                    <UnitAdminStatusBadge status={unit.admin_status} />
                  </div>
                  {project?.address && (
                    <div className="md:col-span-2">
                      <p className="mb-1 flex items-center gap-2 text-sm text-slate-500">
                        <MapPin className="h-4 w-4" />
                        Endereço do Empreendimento
                      </p>
                      <p className="font-medium text-slate-900">{project.address}</p>
                    </div>
                  )}
                </div>

                {unit.notes && (
                  <div className="mt-6 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">{unit.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
