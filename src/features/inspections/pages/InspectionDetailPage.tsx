import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, Image } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/AuthContext';
import { useClient } from '@/features/clients/hooks';
import { SeverityBadge } from '@/features/inspection-templates/components/SeverityBadge';
import { useTemplateItems } from '@/features/inspection-templates/hooks';
import type { InspectionTemplateItem } from '@/features/inspection-templates/types';
import { ChecklistItemCard } from '@/features/inspections/components/ChecklistItemCard';
import { InspectionStatusBadge } from '@/features/inspections/components/InspectionStatusBadge';
import { MediaThumbnail } from '@/features/inspections/components/MediaThumbnail';
import { SignaturesSection } from '@/features/inspections/components/SignaturesSection';
import {
  useInspection,
  useInspectionItemResults,
  useInspectionMediaByInspection,
  useInspectionSignatures,
  useUpdateInspection,
} from '@/features/inspections/hooks';
import { hasMissingRequiredPhotos, isInspection100Compliant, isInspectionEditable } from '@/features/inspections/utils';
import { useProject } from '@/features/projects/hooks';
import { useUnit } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InspectionDetail.jsx` — checklist
 * completo de uma vistoria, com fotos e assinaturas. Diferenças
 * documentadas em relação ao original:
 *
 * - Sem geração de PDF (`generateInspectionPDF`/botão "Gerar PDF") — fora
 *   de escopo desta leva (ver relatório final).
 * - Sem o botão "Solicitar Assinatura" no topo: no original ele só exibia
 *   um toast "função será implementada em breve" (nunca teve comportamento
 *   real); a assinatura de fato acontece na aba "Assinaturas"
 *   (`SignaturesSection`), que já funciona de ponta a ponta aqui.
 * - Sem `normalizeResults` (o `useEffect` do original que criava
 *   `inspection_item_results` faltantes e apagava duplicatas ao montar a
 *   página): a criação já garante 1 resultado por item ativo do template
 *   (`useCreateInspection`), e o índice único parcial
 *   (`inspection_item_results_tenant_id_inspection_id_item_uidx`,
 *   `0034_inspections.sql`) torna duplicata impossível na origem. Um item
 *   de template criado DEPOIS da vistoria não ganha resultado retroativo
 *   automaticamente (simplificação: o original também não tinha um jeito
 *   de "adicionar item a uma vistoria em andamento" fora desse efeito).
 */
export function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: inspection, isLoading, isError, refetch } = useInspection(id);
  const { data: unit } = useUnit(inspection?.unit_id);
  const { data: project } = useProject(inspection?.project_id);
  const { data: client } = useClient(inspection?.client_id ?? undefined);
  const { data: templateItems } = useTemplateItems(inspection?.template_id);
  const { data: itemResults } = useInspectionItemResults(id);
  const { data: media } = useInspectionMediaByInspection(id);
  const { data: signatures } = useInspectionSignatures(id);

  const updateInspection = useUpdateInspection(id ?? '');

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!inspection) {
    return (
      <EmptyState
        title="Vistoria não encontrada"
        description="A vistoria que você está procurando não existe ou foi excluída."
        action={() => navigate(pageUrl('Inspections'))}
        actionLabel="Voltar para Vistorias"
      />
    );
  }

  const allTemplateItems = templateItems ?? [];
  const allItemResults = itemResults ?? [];
  const allMedia = media ?? [];
  const allSignatures = signatures ?? [];

  const isEditable = isInspectionEditable(inspection.status);
  const is100Compliant = isInspection100Compliant(inspection);
  const missingPhotos = hasMissingRequiredPhotos(allTemplateItems, allItemResults, allMedia);

  const canRequestSignature = inspection.status === 'enviado_ao_cliente' && is100Compliant;
  const hasClientSignature = allSignatures.some((s) => s.signer_type === 'cliente' && s.signed_at);
  const hasInspectorSignature = allSignatures.some((s) => s.signer_type === 'vistoriador' && s.signed_at);
  const canConclude = hasClientSignature && hasInspectorSignature && is100Compliant;
  const canInspectorSign = isEditable || inspection.status === 'enviado_ao_cliente';

  const groupedItems = allTemplateItems.reduce<Record<string, InspectionTemplateItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  function sortedCategoryItems(items: InspectionTemplateItem[]): InspectionTemplateItem[] {
    if (inspection!.status === 'reinspecao') {
      return [...items].sort((a, b) => {
        const resultA = allItemResults.find((r) => r.template_item_id === a.id);
        const resultB = allItemResults.find((r) => r.template_item_id === b.id);
        const priorityA = resultA && ['nao_conforme', 'pendente'].includes(resultA.result) ? 0 : 1;
        const priorityB = resultB && ['nao_conforme', 'pendente'].includes(resultB.result) ? 0 : 1;
        return priorityA - priorityB;
      });
    }
    return [...items].sort((a, b) => a.order_index - b.order_index);
  }

  // Fiel a `pendingItems` (`InspectionDetail.jsx`), sem a condição
  // `!i.resolved_at` (coluna não existe no schema, ver `types.ts`).
  const pendingItems = allItemResults.filter((item) => item.result === 'nao_conforme' && item.requires_fix);

  function handleStartReinspection() {
    const hasNonConformItems = allItemResults.some((item) => item.result === 'nao_conforme' || item.result === 'pendente');
    if (!hasNonConformItems) {
      toast.error('Não há não conformidades. Você pode enviar ao cliente ou coletar assinatura.');
      return;
    }
    updateInspection.mutate(
      { status: 'reinspecao' },
      {
        onSuccess: () => toast.success('ReVistoria iniciada! Foque nos itens não conformes.'),
        onError: () => toast.error('Erro ao iniciar reinspeção.'),
      }
    );
  }

  function handleFinalizeInspection() {
    const hasPendingItems = allItemResults.some((item) => item.result === 'pendente');
    if (hasPendingItems) {
      toast.error('Existem itens pendentes. Marque todos como Conforme, Não Conforme ou Não se Aplica.');
      return;
    }
    if (missingPhotos) {
      toast.error('Fotos obrigatórias faltando. Anexe as fotos necessárias.');
      return;
    }
    updateInspection.mutate(
      { status: 'enviado_ao_cliente' },
      {
        onSuccess: () => toast.success('Status atualizado'),
        onError: () => toast.error('Erro ao enviar ao cliente.'),
      }
    );
  }

  function handleConclude() {
    if (!canConclude) {
      toast.error('Assinaturas pendentes ou vistoria não está 100% conforme');
      return;
    }
    updateInspection.mutate(
      { status: 'concluido' },
      {
        onSuccess: () => toast.success('Status atualizado'),
        onError: () => toast.error('Erro ao concluir vistoria.'),
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
        <div className="flex items-center gap-3">
          <Link to={pageUrl('Inspections')}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Vistoria - {unit?.sku ?? '...'}</h1>
              <InspectionStatusBadge status={inspection.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{project?.name}</span>
              <span>•</span>
              <span>{client?.name ?? '—'}</span>
              <span>•</span>
              <span>{inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString('pt-BR') : 'Data não definida'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isEditable && (
            <>
              {!is100Compliant && (
                <Button
                  variant="outline"
                  onClick={handleStartReinspection}
                  disabled={updateInspection.isPending}
                  className="border-orange-600 text-orange-600 hover:bg-orange-50"
                  title="Inicia ciclo de reinspeção na mesma vistoria (sem criar nova)"
                >
                  <AlertCircle className="mr-2 h-4 w-4" />
                  Gerar ReVistoria
                </Button>
              )}
              <Button onClick={handleFinalizeInspection} disabled={updateInspection.isPending} variant="brand">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Enviar ao Cliente
              </Button>
            </>
          )}

          {canConclude && (
            <Button onClick={handleConclude} disabled={updateInspection.isPending} className="bg-green-600 text-white hover:bg-green-700">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Concluir Vistoria
            </Button>
          )}
        </div>
      </div>

      {inspection.status === 'enviado_ao_cliente' && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900">Vistoria Enviada ao Cliente</h3>
                <p className="mt-1 text-sm text-blue-700">Aguardando assinatura e aprovação do cliente.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {inspection.status === 'reprovado' && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
                <div>
                  <h3 className="font-semibold text-red-900">Vistoria Reprovada</h3>
                  <p className="mt-1 text-sm text-red-700">Cliente reprovou a vistoria. Inicie uma reinspeção para corrigir as pendências.</p>
                </div>
              </div>
              <Button onClick={handleStartReinspection} size="sm" className="shrink-0 bg-red-600 text-white hover:bg-red-700" disabled={updateInspection.isPending}>
                Iniciar Reinspeção
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {inspection.status === 'reinspecao' && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-orange-600" />
              <div>
                <h3 className="font-semibold text-orange-900">Modo ReVistoria Ativo</h3>
                <p className="mt-1 text-sm text-orange-700">Foque nos itens não conformes e pendentes. Corrija-os e envie novamente ao cliente.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {inspection.status === 'concluido' && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-900">Vistoria Concluída</h3>
                <p className="mt-1 text-sm text-green-700">Vistoria concluída com sucesso! Todas as assinaturas foram coletadas.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!is100Compliant && isEditable && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">Atenção: Vistoria com Pendências</h3>
                <p className="mt-1 text-sm text-amber-700">
                  Existem {inspection.totals_pending} itens pendentes e {inspection.totals_nonconform} não conformes. Resolva todas as
                  pendências e marque todos os itens como "Conforme" ou "Não se Aplica" para poder enviar ao cliente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {missingPhotos && isEditable && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Camera className="mt-0.5 h-5 w-5 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Fotos Obrigatórias Faltando</h3>
                <p className="mt-1 text-sm text-red-700">
                  Alguns itens marcados como "Não Conforme" ou "Pendente" exigem fotos obrigatórias. Anexe as fotos necessárias antes de
                  enviar ao cliente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {is100Compliant && !missingPhotos && isEditable && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-900">Vistoria 100% Conforme</h3>
                <p className="mt-1 text-sm text-green-700">Todos os itens foram avaliados e estão conformes. Você pode enviar a vistoria ao cliente.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{inspection.totals_conform}</div>
              <div className="mt-1 text-sm text-muted-foreground">Conformes</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{inspection.totals_nonconform}</div>
              <div className="mt-1 text-sm text-muted-foreground">Não Conformes</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-600">{inspection.totals_pending}</div>
              <div className="mt-1 text-sm text-muted-foreground">Pendentes</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-brand">{inspection.score_conformity_percent.toFixed(1)}%</div>
              <div className="mt-1 text-sm text-muted-foreground">Conformidade</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist">Checklist ({allItemResults.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendências ({pendingItems.length})</TabsTrigger>
          <TabsTrigger value="media">Mídias ({allMedia.length})</TabsTrigger>
          <TabsTrigger value="signatures">Assinaturas ({allSignatures.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Itens do Checklist</CardTitle>
                {!isEditable && (
                  <Badge variant="outline" className="text-amber-600">
                    Somente Leitura
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {allItemResults.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingInline />
                </div>
              ) : (
                <Accordion type="multiple" className="space-y-4">
                  {Object.entries(groupedItems).map(([category, categoryItems]) => (
                    <AccordionItem key={category} value={category} className="rounded-lg border">
                      <AccordionTrigger className="px-4 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{category}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="mt-4 space-y-4">
                          {sortedCategoryItems(categoryItems).map((templateItem) => {
                            const itemResult = allItemResults.find((item) => item.template_item_id === templateItem.id);
                            if (!itemResult) return null;

                            const itemMedia = allMedia.filter((item) => item.item_result_id === itemResult.id);

                            return (
                              <ChecklistItemCard
                                key={templateItem.id}
                                inspectionId={inspection.id}
                                templateItem={templateItem}
                                itemResult={itemResult}
                                media={itemMedia}
                                isEditable={isEditable}
                                inspectionStatus={inspection.status}
                              />
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Itens a Revisar (ReVistoria)</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingItems.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nenhuma pendência" description="Todas as não conformidades foram resolvidas" />
              ) : (
                <div className="space-y-3">
                  {pendingItems.map((item) => {
                    const templateItem = allTemplateItems.find((t) => t.id === item.template_item_id);
                    return (
                      <Card key={item.id} className="border-l-4 border-l-red-500 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="outline">{templateItem?.category}</Badge>
                              <SeverityBadge severity={item.severity} />
                            </div>
                            <h4 className="font-medium text-foreground">{templateItem?.title}</h4>
                            {item.comment && <p className="mt-2 text-sm text-muted-foreground">{item.comment}</p>}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle>Galeria de Mídias ({allMedia.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {allMedia.length === 0 ? (
                <EmptyState icon={Image} title="Nenhuma mídia" description="Nenhuma foto ou arquivo foi anexado a esta vistoria" />
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedItems).map(([category, categoryItems]) => {
                    const categoryMedia = allMedia.filter((m) => {
                      const itemResult = allItemResults.find((item) => item.id === m.item_result_id);
                      return categoryItems.some((ti) => ti.id === itemResult?.template_item_id);
                    });

                    if (categoryMedia.length === 0) return null;

                    return (
                      <div key={category}>
                        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                          <Badge variant="outline">{category}</Badge>
                          <span className="text-sm text-muted-foreground">({categoryMedia.length})</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                          {categoryMedia.map((m) => {
                            const itemResult = allItemResults.find((item) => item.id === m.item_result_id);
                            const templateItem = allTemplateItems.find((ti) => ti.id === itemResult?.template_item_id);

                            return (
                              <MediaThumbnail
                                key={m.id}
                                media={m}
                                caption={`${templateItem?.title ?? ''} — ${new Date(m.taken_at).toLocaleString('pt-BR')}`}
                                openOnClick
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signatures">
          <Card>
            <CardHeader>
              <CardTitle>Assinaturas</CardTitle>
            </CardHeader>
            <CardContent>
              <SignaturesSection
                inspectionId={inspection.id}
                signatures={allSignatures}
                client={client}
                currentUserEmail={user?.email ?? null}
                canRequestSignature={canRequestSignature}
                canInspectorSign={canInspectorSign}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {inspection.notes_general && (
        <Card>
          <CardHeader>
            <CardTitle>Observações Gerais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-foreground">{inspection.notes_general}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
