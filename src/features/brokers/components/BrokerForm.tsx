import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { brokerFormSchema, type BrokerFormInput, type BrokerMutationPayload } from '@/features/brokers/schemas';
import type { Broker } from '@/features/brokers/types';
import type { RealEstateAgency } from '@/features/real-estate-agencies/types';

type BrokerFormState = Omit<Record<keyof BrokerFormInput, string>, 'type' | 'is_active'> & {
  type: BrokerFormInput['type'];
  is_active: boolean;
};

const EMPTY_FORM_STATE: BrokerFormState = {
  name: '',
  cpf: '',
  phone: '',
  email: '',
  type: 'autonomo',
  real_estate_agency_id: '',
  commission_rate_percentage: '5.00',
  commission_split: '70',
  is_active: true,
};

function stateFromBroker(broker?: Broker): BrokerFormState {
  if (!broker) return EMPTY_FORM_STATE;

  return {
    name: broker.name ?? '',
    cpf: broker.cpf ?? '',
    phone: broker.phone ?? '',
    email: broker.email ?? '',
    type: broker.type,
    real_estate_agency_id: broker.real_estate_agency_id ?? '',
    commission_rate_percentage: (broker.commission_rate * 100).toFixed(2),
    commission_split: String(broker.commission_split ?? 70),
    is_active: broker.is_active,
  };
}

/**
 * Converte string vazia de campo opcional em `null` (em vez de mandar ""
 * para colunas nullable do banco).
 */
function nullifyEmpty<T extends string | undefined>(value: T): string | null {
  return value ? value : null;
}

interface BrokerFormProps {
  /** Corretor existente, quando o formulário edita em vez de criar. */
  broker?: Broker;
  /** Imobiliárias ativas do tenant, para o seletor exibido quando `type === 'imobiliaria'` — vem de `useRealEstateAgencies()` (ver `features/real-estate-agencies/hooks.ts`), buscado pela página/dialog que renderiza este form, mesmo padrão de `UnitForm`/`projects`: sem chamada ao Supabase dentro de componente. */
  agencies: RealEstateAgency[];
  onSubmit: (data: BrokerMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de corretor — fiel ao dialog de criar/editar de
 * `original-project/src/pages/Brokers.jsx` (identificação, vínculo com
 * imobiliária, comissão, status ativo).
 */
export function BrokerForm({ broker, agencies, onSubmit, isSubmitting, submitLabel, onCancel }: BrokerFormProps) {
  const [formData, setFormData] = useState<BrokerFormState>(() => stateFromBroker(broker));
  const [error, setError] = useState<string | null>(null);

  const activeAgencies = agencies.filter((a) => a.status === 'ativa');

  function setField<K extends keyof BrokerFormState>(field: K, value: BrokerFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = brokerFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      name: parsed.data.name,
      cpf: nullifyEmpty(parsed.data.cpf),
      phone: parsed.data.phone,
      email: nullifyEmpty(parsed.data.email),
      type: parsed.data.type,
      real_estate_agency_id: parsed.data.type === 'imobiliaria' ? (parsed.data.real_estate_agency_id ?? null) : null,
      commission_rate: parsed.data.commission_rate_percentage / 100,
      commission_split: parsed.data.commission_split,
      is_active: parsed.data.is_active,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Nome Completo *</Label>
        <Input id="name" value={formData.name} onChange={(e) => setField('name', e.target.value)} placeholder="João Silva" />
      </div>

      <div>
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" value={formData.cpf} onChange={(e) => setField('cpf', e.target.value)} placeholder="000.000.000-00" />
      </div>

      <div>
        <Label htmlFor="phone">Telefone *</Label>
        <Input id="phone" value={formData.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="(00) 00000-0000" />
      </div>

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="joao@exemplo.com"
        />
      </div>

      <div>
        <Label htmlFor="type">Tipo de Corretor</Label>
        <Select
          value={formData.type}
          onValueChange={(value) => setField('type', value as BrokerFormInput['type'])}
        >
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="autonomo">Autônomo</SelectItem>
            <SelectItem value="imobiliaria">Vinculado à Imobiliária</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.type === 'imobiliaria' && (
        <>
          <div>
            <Label htmlFor="real_estate_agency_id">Imobiliária *</Label>
            <Select
              value={formData.real_estate_agency_id}
              onValueChange={(value) => setField('real_estate_agency_id', value)}
            >
              <SelectTrigger id="real_estate_agency_id">
                <SelectValue placeholder="Selecione a imobiliária" />
              </SelectTrigger>
              <SelectContent>
                {activeAgencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="commission_split">% do Corretor (Split)</Label>
            <Input
              id="commission_split"
              type="number"
              min="0"
              max="100"
              value={formData.commission_split}
              onChange={(e) => setField('commission_split', e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Percentual que o corretor recebe da comissão total</p>
          </div>
        </>
      )}

      <div>
        <Label htmlFor="commission_rate_percentage">Taxa de Comissão (%)</Label>
        <Input
          id="commission_rate_percentage"
          type="number"
          step="0.01"
          value={formData.commission_rate_percentage}
          onChange={(e) => setField('commission_rate_percentage', e.target.value)}
          placeholder="5.00"
        />
        <p className="mt-1 text-xs text-muted-foreground">Padrão: 5% (0.05)</p>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="is_active">Corretor Ativo</Label>
        <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setField('is_active', checked)} />
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
