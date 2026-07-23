import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { useInspectionTemplateItemCounts, useInspectionTemplates } from '@/features/inspection-templates/hooks';
import { useCreateInspection, useInspections } from '@/features/inspections/hooks';
import type { Inspection, InspectionStatus } from '@/features/inspections/types';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

// Status considerados "vistoria ativa" para bloquear a criação de uma nova
// vistoria na mesma unidade -- fiel a `getActiveInspection` (`CreateInspection.jsx`).
// Sem constraint de banco para isso (ver comentário no topo de
// `0034_inspections.sql`), checagem inteiramente client-side.
const ACTIVE_INSPECTION_STATUSES: InspectionStatus[] = ['rascunho', 'em_vistoria', 'enviado_ao_cliente', 'reinspecao'];

type Step = 1 | 2 | 3;

/**
 * Wizard "Nova Vistoria" — tradução de `original-project/src/pages/CreateInspection.jsx`.
 * Sem a criação automática de um "template padrão"/modal de "Criar Template
 * Rápido" do original: mesma decisão já tomada em `TemplatesListPage`
 * (`features/inspection-templates/pages/TemplatesListPage.tsx`) — seed
 * automático de dado de exemplo não é comportamento esperado de um produto
 * multi-tenant real; sem template ativo, o passo 2 orienta o usuário a criar
 * um em "Templates" primeiro, em vez de reabrir essa decisão aqui.
 *
 * Também sem o `window.confirm(...)` do original para abrir a vistoria
 * ativa de uma unidade bloqueada — em vez de um dialog nativo do browser,
 * a unidade bloqueada fica desabilitada com um link inline para a vistoria
 * ativa (mesma linguagem visual do resto do app).
 */
export function CreateInspectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedUnitId = searchParams.get('unit');

  const { data: units, isLoading: isLoadingUnits, isError: isErrorUnits, refetch: refetchUnits } = useUnits();
  const { data: projects } = useProjects();
  const { data: templates, isLoading: isLoadingTemplates } = useInspectionTemplates();
  const { data: itemCounts } = useInspectionTemplateItemCounts();
  const { data: inspections } = useInspections();

  const [step, setStep] = useState<Step>(1);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('all');

  const createInspection = useCreateInspection();

  const allUnits = (units ?? []).filter((u) => !u.is_deleted);
  const allProjects = projects ?? [];
  const allInspections = inspections ?? [];
  const activeTemplates = (templates ?? []).filter((t) => t.is_active);
  const counts = itemCounts ?? {};

  function getActiveInspection(unitId: string): Inspection | undefined {
    return allInspections.find((i) => i.unit_id === unitId && ACTIVE_INSPECTION_STATUSES.includes(i.status));
  }

  // Auto-seleciona a unidade se vier na URL (`?unit=<id>`, link a partir de
  // `UnitDetailPage`) -- fiel ao original.
  useEffect(() => {
    if (preSelectedUnitId && allUnits.length > 0 && !selectedUnitId) {
      const unit = allUnits.find((u) => u.id === preSelectedUnitId);
      if (unit) {
        setSelectedUnitId(unit.id);
        setStep(2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedUnitId, units]);

  // Auto-avança se houver só um template ativo -- fiel ao original.
  useEffect(() => {
    if (step === 2 && activeTemplates.length === 1 && !selectedTemplateId) {
      setSelectedTemplateId(activeTemplates[0].id);
      const timer = setTimeout(() => setStep(3), 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeTemplates.length]);

  const projectUnits = allUnits.filter((u) => projectFilter === 'all' || u.project_id === projectFilter);

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function handleCreate() {
    if (!selectedUnitId || !selectedTemplateId) {
      toast.error('Selecione uma unidade e um template');
      return;
    }

    const activeInspection = getActiveInspection(selectedUnitId);
    if (activeInspection) {
      toast.error('Já existe uma vistoria ativa para esta unidade.');
      navigate(`${pageUrl('Inspections')}/${activeInspection.id}`);
      return;
    }

    createInspection.mutate(
      { unit_id: selectedUnitId, template_id: selectedTemplateId },
      {
        onSuccess: (inspection) => {
          toast.success('Vistoria criada com sucesso!');
          navigate(`${pageUrl('Inspections')}/${inspection.id}`);
        },
        onError: (error) => toast.error(`Erro ao criar vistoria: ${error.message}`),
      }
    );
  }

  if (isLoadingUnits || isLoadingTemplates) return <LoadingInline />;
  if (isErrorUnits) return <ErrorState onRetry={() => refetchUnits()} />;

  const selectedUnit = allUnits.find((u) => u.id === selectedUnitId);
  const selectedTemplate = activeTemplates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="space-y-6">
      <PageHeader title="Nova Vistoria" subtitle="Wizard de criação de vistoria" backTo="Inspections" />

      <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${step >= 1 ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {step > 1 ? <CheckCircle2 className="h-5 w-5" /> : '1'}
          </div>
          <span className="text-sm font-medium">Selecionar Unidade</span>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${step >= 2 ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {step > 2 ? <CheckCircle2 className="h-5 w-5" /> : '2'}
          </div>
          <span className="text-sm font-medium">Selecionar Template</span>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${step >= 3 ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            3
          </div>
          <span className="text-sm font-medium">Confirmar</span>
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <CardTitle>Selecione a Unidade</CardTitle>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Filtrar por projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Projetos</SelectItem>
                  {allProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {projectUnits.length === 0 ? (
              <EmptyState title="Nenhuma unidade encontrada" description="Ajuste o filtro de projeto" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {projectUnits.map((unit) => {
                  const activeInspection = getActiveInspection(unit.id);
                  const isBlocked = Boolean(activeInspection);

                  return (
                    <div
                      key={unit.id}
                      onClick={() => !isBlocked && setSelectedUnitId(unit.id)}
                      className={`rounded-lg border-2 p-4 transition-all ${
                        isBlocked
                          ? 'cursor-not-allowed border-amber-300 bg-amber-50 opacity-75'
                          : selectedUnitId === unit.id
                            ? 'cursor-pointer border-brand bg-brand/5'
                            : 'cursor-pointer border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <p className="text-lg font-semibold text-foreground">{unit.sku}</p>
                        {isBlocked && <Badge className="bg-amber-500 text-xs text-white">Vistoria Ativa</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{projectName(unit.project_id)}</p>
                      {isBlocked && activeInspection && (
                        <p className="mt-1 text-xs text-amber-700">
                          Status: {activeInspection.status} —{' '}
                          <Link to={`${pageUrl('Inspections')}/${activeInspection.id}`} className="underline">
                            ver vistoria ativa
                          </Link>
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        {unit.tipologia && <Badge variant="outline">{unit.tipologia}</Badge>}
                        <Badge className="bg-slate-500 text-white">{unit.status}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!selectedUnitId} variant="brand">
                Próximo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Selecione o Template de Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            {activeTemplates.length === 0 ? (
              <EmptyState
                title="Nenhum template disponível"
                description="Crie um template de checklist em Templates de Vistoria para continuar."
                action={() => navigate(pageUrl('Templates'))}
                actionLabel="Ir para Templates"
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {activeTemplates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                      selectedTemplateId === template.id ? 'border-brand bg-brand/5' : 'border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    <p className="text-lg font-semibold text-foreground">{template.name}</p>
                    {template.description && <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>}
                    <Badge variant="outline" className="mt-2">
                      {counts[template.id] ?? 0} itens
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button onClick={() => setStep(3)} disabled={!selectedTemplateId} variant="brand">
                Próximo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar Criação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Unidade Selecionada</p>
                <p className="font-semibold text-foreground">{selectedUnit?.sku}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Template Selecionado</p>
                <p className="font-semibold text-foreground">{selectedTemplate?.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Itens do Checklist</p>
                <p className="font-semibold text-foreground">{selectedTemplateId ? (counts[selectedTemplateId] ?? 0) : 0} itens</p>
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button onClick={handleCreate} disabled={createInspection.isPending} variant="brand">
                {createInspection.isPending ? 'Criando...' : 'Criar Vistoria'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
