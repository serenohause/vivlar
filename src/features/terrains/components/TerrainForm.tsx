import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FORMA_AQUISICAO_OPTIONS, TERRAIN_STATUS_OPTIONS } from '@/features/terrains/constants';
import { terrainFormSchema, type TerrainFormInput, type TerrainMutationPayload } from '@/features/terrains/schemas';
import type { Terrain } from '@/features/terrains/types';

type TerrainFormState = Record<keyof TerrainFormInput, string>;

const EMPTY_FORM_STATE: TerrainFormState = {
  code: '',
  name: '',
  address: '',
  city: '',
  state: '',
  area_m2: '',
  status: 'em_prospeccao',
  matricula: '',
  proprietario_atual: '',
  observacoes_legais: '',
  forma_aquisicao: '',
  valor_aquisicao: '',
  custos_itbi: '',
  custos_cartorio: '',
  custos_estudos: '',
  custos_corretagem: '',
  custos_outros: '',
  notas: '',
};

function stateFromTerrain(terrain?: Terrain): TerrainFormState {
  if (!terrain) return EMPTY_FORM_STATE;

  return {
    code: terrain.code ?? '',
    name: terrain.name ?? '',
    address: terrain.address ?? '',
    city: terrain.city ?? '',
    state: terrain.state ?? '',
    area_m2: terrain.area_m2 != null ? String(terrain.area_m2) : '',
    status: terrain.status,
    matricula: terrain.matricula ?? '',
    proprietario_atual: terrain.proprietario_atual ?? '',
    observacoes_legais: terrain.observacoes_legais ?? '',
    forma_aquisicao: terrain.forma_aquisicao ?? '',
    valor_aquisicao: terrain.valor_aquisicao != null ? String(terrain.valor_aquisicao) : '',
    custos_itbi: terrain.custos_itbi != null ? String(terrain.custos_itbi) : '',
    custos_cartorio: terrain.custos_cartorio != null ? String(terrain.custos_cartorio) : '',
    custos_estudos: terrain.custos_estudos != null ? String(terrain.custos_estudos) : '',
    custos_corretagem: terrain.custos_corretagem != null ? String(terrain.custos_corretagem) : '',
    custos_outros: terrain.custos_outros != null ? String(terrain.custos_outros) : '',
    notas: terrain.notas ?? '',
  };
}

/**
 * Converte string vazia de campo opcional em `null` (em vez de mandar ""
 * para colunas nullable do banco).
 */
function nullifyEmpty<T extends string | undefined>(value: T): string | null {
  return value ? value : null;
}

interface TerrainFormProps {
  /** Terreno existente, quando o formulário edita em vez de criar. */
  terrain?: Terrain;
  onSubmit: (data: TerrainMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de terreno — fiel a `original-project/src/pages/Terrains.jsx`
 * (dialog de criar/editar), usado tanto na criação (`TerrainFormPage`) quanto
 * na edição (dialog acionado a partir da lista e do detalhe).
 *
 * Sem campos de latitude/longitude aqui: no original a localização não faz
 * parte deste formulário — é definida à parte, via mapa, em `TerrainDetail.jsx`
 * (substituído por inputs simples de lat/lng em `TerrainLocationCard`, fora
 * do mapa interativo — escopo combinado).
 */
export function TerrainForm({ terrain, onSubmit, isSubmitting, submitLabel, onCancel }: TerrainFormProps) {
  const [formData, setFormData] = useState<TerrainFormState>(() => stateFromTerrain(terrain));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof TerrainFormState>(field: K, value: TerrainFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = terrainFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      ...parsed.data,
      matricula: nullifyEmpty(parsed.data.matricula),
      proprietario_atual: nullifyEmpty(parsed.data.proprietario_atual),
      observacoes_legais: nullifyEmpty(parsed.data.observacoes_legais),
      forma_aquisicao: nullifyEmpty(parsed.data.forma_aquisicao),
      notas: nullifyEmpty(parsed.data.notas),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Identificação */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Código *</Label>
          <Input value={formData.code} onChange={(e) => setField('code', e.target.value)} placeholder="TR-001" />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(value) => setField('status', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERRAIN_STATUS_OPTIONS.map(([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Nome/Identificação *</Label>
        <Input value={formData.name} onChange={(e) => setField('name', e.target.value)} placeholder="Ex: Terreno Centro" />
      </div>

      <div>
        <Label>Endereço *</Label>
        <Input value={formData.address} onChange={(e) => setField('address', e.target.value)} placeholder="Rua/Av, número" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Cidade *</Label>
          <Input value={formData.city} onChange={(e) => setField('city', e.target.value)} />
        </div>
        <div>
          <Label>Estado *</Label>
          <Input value={formData.state} onChange={(e) => setField('state', e.target.value)} maxLength={2} />
        </div>
        <div>
          <Label>Área (m²) *</Label>
          <Input type="number" value={formData.area_m2} onChange={(e) => setField('area_m2', e.target.value)} />
        </div>
      </div>

      {/* Dados Jurídicos */}
      <div className="pt-4 border-t">
        <h3 className="font-semibold mb-3 text-sm">Dados Jurídicos</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input value={formData.matricula} onChange={(e) => setField('matricula', e.target.value)} placeholder="Matrícula" />
          <Input
            value={formData.proprietario_atual}
            onChange={(e) => setField('proprietario_atual', e.target.value)}
            placeholder="Proprietário atual"
          />
        </div>
        <div className="mt-3">
          <Input
            value={formData.observacoes_legais}
            onChange={(e) => setField('observacoes_legais', e.target.value)}
            placeholder="Observações legais"
          />
        </div>
      </div>

      {/* Dados Financeiros */}
      <div className="pt-4 border-t">
        <h3 className="font-semibold mb-3 text-sm">Dados Financeiros</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Valor de Aquisição</Label>
            <Input type="number" value={formData.valor_aquisicao} onChange={(e) => setField('valor_aquisicao', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Forma de Aquisição</Label>
            <Select value={formData.forma_aquisicao} onValueChange={(value) => setField('forma_aquisicao', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {FORMA_AQUISICAO_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Input type="number" value={formData.custos_itbi} onChange={(e) => setField('custos_itbi', e.target.value)} placeholder="ITBI" />
          <Input
            type="number"
            value={formData.custos_cartorio}
            onChange={(e) => setField('custos_cartorio', e.target.value)}
            placeholder="Cartório"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <Input
            type="number"
            value={formData.custos_estudos}
            onChange={(e) => setField('custos_estudos', e.target.value)}
            placeholder="Estudos"
          />
          <Input
            type="number"
            value={formData.custos_corretagem}
            onChange={(e) => setField('custos_corretagem', e.target.value)}
            placeholder="Corretagem"
          />
          <Input
            type="number"
            value={formData.custos_outros}
            onChange={(e) => setField('custos_outros', e.target.value)}
            placeholder="Outros custos"
          />
        </div>
      </div>

      <div>
        <Label>Notas</Label>
        <Input value={formData.notas} onChange={(e) => setField('notas', e.target.value)} placeholder="Observações gerais" />
      </div>

      <FormError message={error} />

      <div className="flex justify-end gap-3 pt-6 border-t">
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
