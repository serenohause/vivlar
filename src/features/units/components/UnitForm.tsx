import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TIPOLOGIA_OPTIONS, UNIT_STATUS_OPTIONS } from '@/features/units/constants';
import { unitFormSchema, type UnitFormInput, type UnitMutationPayload } from '@/features/units/schemas';
import type { Unit } from '@/features/units/types';
import type { Project } from '@/features/projects/types';

type UnitFormState = Record<keyof UnitFormInput, string>;

const EMPTY_FORM_STATE: UnitFormState = {
  sku: '',
  project_id: '',
  bloco: '',
  tipologia: '',
  area_m2: '',
  area_lote_m2: '',
  quartos: '',
  vagas: '',
  suites: '',
  pavimentos: '',
  posicao_solar: '',
  list_price: '',
  status: 'disponivel',
  notes: '',
  observacoes_publica: '',
  entrada_minima: '',
  subsidio_simulado: '',
  parcela_simulada: '',
};

function stateFromUnit(unit?: Unit, defaultProjectId?: string): UnitFormState {
  if (!unit) return { ...EMPTY_FORM_STATE, project_id: defaultProjectId ?? '' };

  return {
    sku: unit.sku ?? '',
    project_id: unit.project_id ?? '',
    bloco: unit.bloco ?? '',
    tipologia: unit.tipologia ?? '',
    area_m2: unit.area_m2 != null ? String(unit.area_m2) : '',
    area_lote_m2: unit.area_lote_m2 != null ? String(unit.area_lote_m2) : '',
    quartos: unit.quartos != null ? String(unit.quartos) : '',
    vagas: unit.vagas != null ? String(unit.vagas) : '',
    suites: unit.suites != null ? String(unit.suites) : '',
    pavimentos: unit.pavimentos != null ? String(unit.pavimentos) : '',
    posicao_solar: unit.posicao_solar ?? '',
    list_price: unit.list_price != null ? String(unit.list_price) : '',
    status: unit.status,
    notes: unit.notes ?? '',
    observacoes_publica: unit.observacoes_publica ?? '',
    entrada_minima: unit.entrada_minima != null ? String(unit.entrada_minima) : '',
    subsidio_simulado: unit.subsidio_simulado != null ? String(unit.subsidio_simulado) : '',
    parcela_simulada: unit.parcela_simulada != null ? String(unit.parcela_simulada) : '',
  };
}

/**
 * Converte string vazia de campo opcional em `null` (em vez de mandar ""
 * para colunas nullable do banco).
 */
function nullifyEmpty<T extends string | undefined>(value: T): string | null {
  return value ? value : null;
}

interface UnitFormProps {
  /** Unidade existente, quando o formulário edita em vez de criar. */
  unit?: Unit;
  /** Projetos do tenant, para o seletor de empreendimento — vem de `useProjects()` (ver `features/projects/hooks.ts`), buscado pela página/dialog que renderiza este form, não por ele mesmo (mesmo padrão dos outros forms do catálogo: sem chamada ao Supabase dentro de componente). */
  projects: Project[];
  /** Projeto pré-selecionado na criação (ex: unidade criada a partir do detalhe de um projeto). Ignorado na edição. */
  defaultProjectId?: string;
  onSubmit: (data: UnitMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de unidade — fiel ao dialog de criar/editar de
 * `original-project/src/pages/Units.jsx` (identificação, tipologia, área,
 * valor, status, observações), mais os campos "próprios da unidade" de
 * `UnitDetail.jsx`/`espelho/UnitModal.jsx` que o dialog original não
 * editava, mas que fazem parte do escopo combinado: área do lote, quartos,
 * vagas, suítes, pavimentos, posição solar, observações públicas e
 * simulação MCMV pública (entrada mínima/subsídio/parcela).
 *
 * `admin_status` (pipeline MCMV) NÃO está aqui — igual ao original, a
 * criação/edição de unidade não define o pipeline administrativo; ele é
 * editado à parte, no detalhe (`UnitAdminStatusPipeline`), sem a validação
 * de documentos obrigatórios do original (módulo futuro).
 *
 * Sem a validação de capacidade do projeto (`total_units` vs. unidades
 * ativas) que o dialog original fazia ao criar — fora do escopo combinado
 * para esta leva (sinalizado no relatório final).
 */
export function UnitForm({ unit, projects, defaultProjectId, onSubmit, isSubmitting, submitLabel, onCancel }: UnitFormProps) {
  const [formData, setFormData] = useState<UnitFormState>(() => stateFromUnit(unit, defaultProjectId));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof UnitFormState>(field: K, value: UnitFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = unitFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      sku: parsed.data.sku,
      project_id: parsed.data.project_id,
      bloco: nullifyEmpty(parsed.data.bloco),
      tipologia: nullifyEmpty(parsed.data.tipologia),
      area_m2: parsed.data.area_m2 ?? null,
      area_lote_m2: parsed.data.area_lote_m2 ?? null,
      quartos: parsed.data.quartos ?? null,
      vagas: parsed.data.vagas ?? null,
      suites: parsed.data.suites ?? null,
      pavimentos: parsed.data.pavimentos ?? null,
      posicao_solar: nullifyEmpty(parsed.data.posicao_solar),
      list_price: parsed.data.list_price,
      status: parsed.data.status,
      notes: nullifyEmpty(parsed.data.notes),
      observacoes_publica: nullifyEmpty(parsed.data.observacoes_publica),
      entrada_minima: parsed.data.entrada_minima ?? null,
      subsidio_simulado: parsed.data.subsidio_simulado ?? null,
      parcela_simulada: parsed.data.parcela_simulada ?? null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Identificação */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>SKU *</Label>
          <Input value={formData.sku} onChange={(e) => setField('sku', e.target.value)} placeholder="ex: EMA-101" />
        </div>
        <div>
          <Label>Empreendimento *</Label>
          <Select value={formData.project_id} onValueChange={(value) => setField('project_id', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o projeto" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Bloco</Label>
          <Input value={formData.bloco} onChange={(e) => setField('bloco', e.target.value)} placeholder="ex: Bloco A" />
        </div>
        <div>
          <Label>Tipologia</Label>
          <Select value={formData.tipologia} onValueChange={(value) => setField('tipologia', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {TIPOLOGIA_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Características */}
      <div className="border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Características</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Área (m²)</Label>
            <Input type="number" step="0.01" value={formData.area_m2} onChange={(e) => setField('area_m2', e.target.value)} placeholder="ex: 45.50" />
          </div>
          <div>
            <Label className="text-xs">Área do Lote (m²)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.area_lote_m2}
              onChange={(e) => setField('area_lote_m2', e.target.value)}
              placeholder="ex: 180.00"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Quartos</Label>
            <Input type="number" value={formData.quartos} onChange={(e) => setField('quartos', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Vagas</Label>
            <Input type="number" value={formData.vagas} onChange={(e) => setField('vagas', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Suítes</Label>
            <Input type="number" value={formData.suites} onChange={(e) => setField('suites', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Pavimentos</Label>
            <Input type="number" value={formData.pavimentos} onChange={(e) => setField('pavimentos', e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs">Posição Solar</Label>
          <Input value={formData.posicao_solar} onChange={(e) => setField('posicao_solar', e.target.value)} placeholder="ex: Norte" />
        </div>
      </div>

      {/* Comercial */}
      <div className="border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Comercial</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Valor de Venda (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.list_price}
              onChange={(e) => setField('list_price', e.target.value)}
              placeholder="ex: 150000.00"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(value) => setField('status', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_STATUS_OPTIONS.map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label>Observações (internas)</Label>
          <Textarea value={formData.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Observações..." rows={3} />
        </div>
      </div>

      {/* Simulação MCMV pública (Espelho de Vendas) */}
      <div className="border-t pt-4">
        <h3 className="mb-1 text-sm font-semibold">Simulação MCMV Pública</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Usados no espelho de vendas público desta unidade; quando em branco, o site usa os valores do projeto.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Entrada mínima</Label>
            <Input type="number" step="0.01" value={formData.entrada_minima} onChange={(e) => setField('entrada_minima', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Subsídio simulado</Label>
            <Input type="number" step="0.01" value={formData.subsidio_simulado} onChange={(e) => setField('subsidio_simulado', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Parcela simulada</Label>
            <Input type="number" step="0.01" value={formData.parcela_simulada} onChange={(e) => setField('parcela_simulada', e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs">Observações públicas</Label>
          <Textarea
            value={formData.observacoes_publica}
            onChange={(e) => setField('observacoes_publica', e.target.value)}
            placeholder="Texto visível para o cliente no espelho de vendas..."
            rows={2}
          />
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
