import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, DollarSign, Download, Edit2, FileText, Home, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { Label } from '@/components/ui/label';
import { LoadingInline } from '@/components/ui/loading-inline';
import { DocumentFormDialog } from '@/features/documents/components/DocumentFormDialog';
import { DocumentStatusBadge } from '@/features/documents/components/DocumentStatusBadge';
import { DOC_TYPE_LABELS } from '@/features/documents/constants';
import { useDocumentsByUnit, getDocumentSignedUrl } from '@/features/documents/hooks';
import { CreateFinanceAccountDialog } from '@/features/finance/components/CreateFinanceAccountDialog';
import { useFinanceAccountsByUnit } from '@/features/finance/hooks';
import { useProject, useProjects } from '@/features/projects/hooks';
import { UnitAdminStatusPipeline } from '@/features/units/components/UnitAdminStatusPipeline';
import { UnitEditDialog } from '@/features/units/components/UnitEditDialog';
import { UnitStatusBadge } from '@/features/units/components/UnitStatusBadge';
import { formatCurrency } from '@/features/units/constants';
import { useUnit } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução simplificada de `original-project/src/pages/UnitDetail.jsx` —
 * escopo combinado com o usuário: sem as abas de Documentos, Vistorias e
 * Atividades (dependem de `documents`/`inspections`/`activities`, módulos
 * futuros), sem o card de "Negociação" (depende de `deals`, CRM futuro — a
 * unidade já linka para o negócio via `DealDetailPage`, não o contrário) e
 * sem `UnitAlerts` (a versão original cruza dados de módulos que ainda não
 * existem — ver relatório final). O que sobra: os campos próprios da
 * unidade (informações básicas + simulação MCMV pública), o fluxo
 * administrativo MCMV (`UnitAdminStatusPipeline`) e o card "Financeiro"
 * (link para a carteira financeira da unidade, ou botão para criar uma —
 * ver `CreateFinanceAccountDialog`, `features/finance/hooks.ts`). O card
 * "Documentos" (módulo `features/documents`, fechado numa leva posterior)
 * é só listagem/upload — sem a lógica de checklist de documentos
 * obrigatórios por `admin_status` do `DocumentChecklist.jsx` original, que
 * continua fora de escopo (ver `docs/ARCHITECTURE.md`).
 */
export function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: unit, isLoading, isError, refetch } = useUnit(id);
  const { data: project } = useProject(unit?.project_id);
  const { data: projects } = useProjects();
  const { data: financeAccounts } = useFinanceAccountsByUnit(id);
  const { data: documents } = useDocumentsByUnit(id);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateFinanceDialog, setShowCreateFinanceDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Unidade não encontrada</p>
        <Button onClick={() => navigate(pageUrl('Units'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const hasSimulation =
    unit.entrada_minima != null || unit.subsidio_simulado != null || unit.parcela_simulada != null || unit.observacoes_publica;

  // Mesmo critério de `primaryAccount` em `original-project/src/pages/Finance.jsx`
  // (`accounts.find(a => a.status === "ativa") || accounts[0]`) — uma
  // unidade pode ter mais de uma carteira ao longo do tempo (distrato + nova
  // venda, ver comentário em `0019_finance_accounts.sql`).
  const primaryFinanceAccount =
    financeAccounts?.find((account) => account.status === 'ativa') ?? financeAccounts?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(pageUrl('Units'))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{unit.sku}</h1>
            {project ? (
              <Link
                to={`${pageUrl('Projects')}/${project.id}`}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
              >
                <Building2 className="h-3.5 w-3.5" />
                {project.name}
              </Link>
            ) : (
              <p className="text-muted-foreground">Carregando...</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <UnitStatusBadge status={unit.status} />
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>

      {/* Fluxo Administrativo MCMV */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Fluxo Administrativo MCMV</CardTitle>
        </CardHeader>
        <CardContent>
          <UnitAdminStatusPipeline unit={unit} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identificação */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">SKU</Label>
                <p className="font-medium">{unit.sku}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Bloco</Label>
                <p className="font-medium">{unit.bloco || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tipologia</Label>
                <p className="font-medium">{unit.tipologia || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Área (m²)</Label>
                <p className="font-medium">{unit.area_m2 != null ? `${unit.area_m2.toFixed(2)} m²` : '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Área do Lote (m²)</Label>
                <p className="font-medium">{unit.area_lote_m2 != null ? `${unit.area_lote_m2.toFixed(2)} m²` : '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Posição Solar</Label>
                <p className="font-medium">{unit.posicao_solar || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Quartos</Label>
                <p className="font-medium">{unit.quartos ?? '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vagas</Label>
                <p className="font-medium">{unit.vagas ?? '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Suítes</Label>
                <p className="font-medium">{unit.suites ?? '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Pavimentos</Label>
                <p className="font-medium">{unit.pavimentos ?? '—'}</p>
              </div>
            </div>

            {unit.notes && (
              <div className="rounded-lg bg-muted p-3">
                <Label className="mb-1 block text-xs text-muted-foreground">Observações</Label>
                <p className="text-sm text-foreground">{unit.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comercial */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <Label className="mb-1 block text-xs text-muted-foreground">Valor de Venda</Label>
              <p className="text-xl font-bold text-foreground">{formatCurrency(unit.list_price)}</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status Comercial</span>
              <UnitStatusBadge status={unit.status} />
            </div>
            <div className="border-t pt-4">
              <Label className="mb-2 block text-xs text-muted-foreground">Financeiro</Label>
              {primaryFinanceAccount ? (
                <Link to={`${pageUrl('Finance')}/${primaryFinanceAccount.id}`}>
                  <Button variant="outline" className="w-full">
                    <DollarSign className="mr-2 h-4 w-4" />
                    Ver Carteira Financeira
                  </Button>
                </Link>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setShowCreateFinanceDialog(true)}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Criar Carteira Financeira
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documentos */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Documentos</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowDocumentDialog(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Novo Documento
          </Button>
        </CardHeader>
        <CardContent>
          {!documents || documents.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm">Nenhum documento vinculado a esta unidade.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((document) => (
                <div key={document.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{document.title}</p>
                      <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[document.doc_type]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DocumentStatusBadge status={document.status} size="sm" />
                    {document.file_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Download"
                        onClick={async () => {
                          const signedUrl = await getDocumentSignedUrl(document.file_url as string);
                          window.open(signedUrl, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simulação MCMV Pública */}
      {hasSimulation && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Simulação MCMV Pública</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Valores exibidos no espelho de vendas público desta unidade (site público, módulo futuro).
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Entrada mínima</p>
                <p className="font-semibold text-blue-900">{formatCurrency(unit.entrada_minima)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Subsídio simulado</p>
                <p className="font-semibold text-blue-900">{formatCurrency(unit.subsidio_simulado)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Parcela simulada</p>
                <p className="font-semibold text-blue-900">{formatCurrency(unit.parcela_simulada)}</p>
              </div>
            </div>
            {unit.observacoes_publica && (
              <div className="rounded-lg bg-muted p-3">
                <Label className="mb-1 block text-xs text-muted-foreground">Observações públicas</Label>
                <p className="text-sm text-foreground">{unit.observacoes_publica}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!hasSimulation && !unit.notes && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Home className="mb-2 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">Nenhuma observação ou simulação cadastrada para esta unidade.</p>
          </CardContent>
        </Card>
      )}

      <UnitEditDialog unit={unit} projects={projects ?? []} open={showEditDialog} onOpenChange={setShowEditDialog} />

      <CreateFinanceAccountDialog
        open={showCreateFinanceDialog}
        onOpenChange={setShowCreateFinanceDialog}
        unit={unit}
        onCreated={(account) => navigate(`${pageUrl('Finance')}/${account.id}`)}
      />

      <DocumentFormDialog
        open={showDocumentDialog}
        onOpenChange={setShowDocumentDialog}
        lockedContext={{
          project_id: unit.project_id,
          unit_id: unit.id,
          label: `Vinculado à unidade ${unit.sku}`,
        }}
      />
    </div>
  );
}
