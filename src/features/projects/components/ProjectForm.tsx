import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/AuthContext';
import { PROJECT_STATUS_OPTIONS } from '@/features/projects/constants';
import { projectFormSchema, type ProjectFormInput, type ProjectMutationPayload } from '@/features/projects/schemas';
import type { Project } from '@/features/projects/types';

type ProjectFormState = Omit<ProjectFormInput, 'total_units' | 'is_public' | 'total_construction_cost' | 'total_indirect_costs'> & {
  total_units: string;
  is_public: boolean;
  total_construction_cost: string;
  total_indirect_costs: string;
};

const EMPTY_FORM_STATE: ProjectFormState = {
  code: '',
  name: '',
  address: '',
  total_units: '',
  status: 'planejamento',
  start_sales_at: '',
  notes: '',
  slug: '',
  is_public: false,
  total_construction_cost: '0',
  total_indirect_costs: '0',
};

function stateFromProject(project?: Project): ProjectFormState {
  if (!project) return EMPTY_FORM_STATE;

  return {
    code: project.code ?? '',
    name: project.name ?? '',
    address: project.address ?? '',
    total_units: project.total_units != null ? String(project.total_units) : '',
    status: project.status,
    start_sales_at: project.start_sales_at ?? '',
    notes: project.notes ?? '',
    slug: project.slug ?? '',
    is_public: project.is_public ?? false,
    total_construction_cost: String(project.total_construction_cost ?? 0),
    total_indirect_costs: String(project.total_indirect_costs ?? 0),
  };
}

/**
 * Converte string vazia de campo opcional em `null` (em vez de mandar ""
 * para colunas nullable do banco).
 */
function nullifyEmpty<T extends string | undefined>(value: T): string | null {
  return value ? value : null;
}

interface ProjectFormProps {
  /** Projeto existente, quando o formulário edita em vez de criar. */
  project?: Project;
  onSubmit: (data: ProjectMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de projeto — fiel ao dialog de criar/editar de
 * `original-project/src/pages/Projects.jsx`, usado tanto na criação
 * (`ProjectFormPage`) quanto na edição (`ProjectEditDialog`, acionado a
 * partir da lista e do detalhe).
 *
 * Sem `city`/`state`/`closed_at`/`cycle_start_date`/`cycle_end_date` (o
 * original nunca os edita aqui) e sem os campos de marketing público além
 * de `slug`/`is_public` (os únicos dois que o dialog original edita — ver
 * comentário em `types.ts`). Sem `broker_responsavel_id` (fora de escopo,
 * depende do módulo de corretores/CRM, ainda não existe).
 *
 * `total_construction_cost`/`total_indirect_costs` (Resultado Operacional):
 * no original esses dois campos são editados em cards dedicados dentro da
 * aba "Resultado Operacional" do projeto (`CustoObra.jsx`/`CustosIndiretos.jsx`,
 * salvos individualmente ao sair do campo), não neste dialog. Aqui optamos
 * por trazê-los para o formulário de criação/edição — decisão explícita do
 * módulo 10 (Investidores), que precisa desses valores para o cálculo do
 * Resultado Operacional e ainda não tem uma aba própria de projeto para
 * hospedar os cards originais.
 *
 * `total_construction_cost`/`total_indirect_costs` só ficam editáveis para
 * `admin` — mesma decisão de RLS do módulo de Investidores (ver
 * `0045_rls_investors.sql`/RLS de `projects`): são dados de custo/dinheiro de
 * terceiros usados no Resultado Operacional, e o banco já rejeita a escrita
 * de quem não é admin. Aqui só refletimos isso na UI, desabilitando os
 * campos em vez de deixar o usuário editar algo que vai falhar ao salvar.
 */
export function ProjectForm({ project, onSubmit, isSubmitting, submitLabel, onCancel }: ProjectFormProps) {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';
  const [formData, setFormData] = useState<ProjectFormState>(() => stateFromProject(project));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof ProjectFormState>(field: K, value: ProjectFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = projectFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      code: parsed.data.code,
      name: parsed.data.name,
      address: nullifyEmpty(parsed.data.address),
      total_units: parsed.data.total_units ?? null,
      status: parsed.data.status,
      start_sales_at: nullifyEmpty(parsed.data.start_sales_at),
      notes: nullifyEmpty(parsed.data.notes),
      slug: nullifyEmpty(parsed.data.slug),
      is_public: parsed.data.is_public,
      total_construction_cost: parsed.data.total_construction_cost,
      total_indirect_costs: parsed.data.total_indirect_costs,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Código *</Label>
          <Input value={formData.code} onChange={(e) => setField('code', e.target.value)} placeholder="EMP-001" />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(value) => setField('status', value as ProjectFormState['status'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_OPTIONS.map(([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Nome *</Label>
        <Input value={formData.name} onChange={(e) => setField('name', e.target.value)} placeholder="Residencial Vivlar" />
      </div>

      <div>
        <Label>Endereço</Label>
        <Input value={formData.address} onChange={(e) => setField('address', e.target.value)} placeholder="Rua das Flores, 123" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Total de Unidades</Label>
          <Input
            type="number"
            value={formData.total_units}
            onChange={(e) => setField('total_units', e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <Label>Início das Vendas</Label>
          <Input type="date" value={formData.start_sales_at} onChange={(e) => setField('start_sales_at', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Observações</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Observações sobre o projeto..."
          rows={3}
        />
      </div>

      {/* Resultado Operacional */}
      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Resultado Operacional</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Custo Total da Obra</Label>
            <Input
              type="number"
              value={formData.total_construction_cost}
              onChange={(e) => setField('total_construction_cost', e.target.value)}
              placeholder="0,00"
              disabled={!isAdmin}
            />
          </div>
          <div>
            <Label>Custos Indiretos</Label>
            <Input
              type="number"
              value={formData.total_indirect_costs}
              onChange={(e) => setField('total_indirect_costs', e.target.value)}
              placeholder="0,00"
              disabled={!isAdmin}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAdmin
            ? 'Valores digitados manualmente, usados no cálculo do Resultado Operacional (Dashboard de Investidores).'
            : 'Somente administradores podem editar estes campos.'}
        </p>
      </div>

      {/* Espelho de Vendas */}
      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Espelho de Vendas (Página Pública)</p>
        <div className="space-y-3">
          <div>
            <Label>Slug (URL)</Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">/p/</span>
              <Input
                value={formData.slug}
                onChange={(e) => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="reserva-dos-ipes"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Apenas letras minúsculas, números e hífens</p>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Página pública ativa</p>
              <p className="text-xs text-muted-foreground">Permite acesso público ao espelho de vendas</p>
            </div>
            <Switch checked={formData.is_public} onCheckedChange={(checked) => setField('is_public', checked)} />
          </div>
        </div>
      </div>

      <FormError message={error} />

      <div className="flex justify-end gap-3 border-t pt-6">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} variant="brand">
          {isSubmitting ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
