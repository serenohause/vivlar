import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, Building2, Calendar, DollarSign, Edit2, Home, Mail, MapPin, Phone } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { ClientEditDialog } from '@/features/clients/components/ClientEditDialog';
import { DEAL_SALES_STAGE_LABELS, formatCPF, formatCurrency } from '@/features/clients/constants';
import { useClient, useClientDeals } from '@/features/clients/hooks';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Tradução de `original-project/src/pages/ClientDetail.jsx`. A seção
 * "Negociações" reaproveita `useProjects`/`useUnits` (já existem) só para
 * resolver nome do projeto e SKU da unidade — sem corretor (o campo
 * `broker_id` do original não é exibido: o módulo de Corretores ainda não
 * tem hook/UI própria, é uma tarefa separada) e sem link para uma tela de
 * detalhe de negócio (Kanban do CRM, também tarefa separada).
 */
export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading, isError, refetch } = useClient(id);
  const { data: deals } = useClientDeals(id);
  const { data: projects } = useProjects();
  const { data: units } = useUnits();

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Cliente não encontrado</p>
        <Button onClick={() => navigate(pageUrl('Clients'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const clientDeals = deals ?? [];

  function getProjectName(projectId: string): string {
    return projects?.find((p) => p.id === projectId)?.name || '—';
  }

  function getUnitCode(unitId: string): string {
    return units?.find((u) => u.id === unitId)?.sku || '—';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.name}
        subtitle="Detalhes do cliente"
        backTo="Clients"
        actions={
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Editar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Client Info Card */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-6 text-center">
              <Avatar className="mx-auto mb-4 h-20 w-20">
                <AvatarFallback className="bg-brand text-2xl text-brand-foreground">
                  {getInitials(client.name)}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-bold text-foreground">{client.name}</h2>
              <p className="text-muted-foreground">{formatCPF(client.cpf)}</p>
            </div>

            <div className="space-y-4">
              {client.phone && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium">{client.phone}</p>
                  </div>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="font-medium">{client.email}</p>
                  </div>
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Endereço</p>
                    <p className="font-medium">{client.address}</p>
                  </div>
                </div>
              )}
            </div>

            {client.notes && (
              <div className="mt-6 rounded-lg bg-amber-50 p-4">
                <p className="text-sm text-slate-600">{client.notes}</p>
              </div>
            )}

            <div className="mt-6 text-xs text-muted-foreground">
              Cadastrado em {new Date(client.created_at).toLocaleDateString('pt-BR')}
            </div>
          </CardContent>
        </Card>

        {/* Deals Card */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
              Negociações ({clientDeals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientDeals.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Briefcase className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
                <p>Nenhuma negociação encontrada</p>
              </div>
            ) : (
              <div className="space-y-4">
                {clientDeals.map((deal) => (
                  <div key={deal.id} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{getProjectName(deal.project_id)}</span>
                        </div>
                        {deal.unit_id && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Home className="h-4 w-4" />
                            <span>{getUnitCode(deal.unit_id)}</span>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline">{DEAL_SALES_STAGE_LABELS[deal.sales_stage]}</Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        {deal.expected_sale_value != null && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            {formatCurrency(deal.expected_sale_value)}
                          </div>
                        )}
                        {deal.sold_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Vendido: {new Date(deal.sold_at).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                      {deal.commission_value != null && (
                        <p className="text-sm font-medium text-green-600">
                          Comissão: {formatCurrency(deal.commission_value)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ClientEditDialog client={client} open={showEditDialog} onOpenChange={setShowEditDialog} />
    </div>
  );
}
