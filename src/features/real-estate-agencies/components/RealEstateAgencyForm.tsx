import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  realEstateAgencyFormSchema,
  type RealEstateAgencyFormInput,
  type RealEstateAgencyMutationPayload,
} from '@/features/real-estate-agencies/schemas';
import type { RealEstateAgency } from '@/features/real-estate-agencies/types';

type RealEstateAgencyFormState = Omit<Record<keyof RealEstateAgencyFormInput, string>, 'status'> & {
  status: RealEstateAgencyFormInput['status'];
};

const EMPTY_FORM_STATE: RealEstateAgencyFormState = {
  name: '',
  cnpj: '',
  email: '',
  phone: '',
  address: '',
  contact_person: '',
  commission_percentage: '30',
  status: 'ativa',
};

function stateFromAgency(agency?: RealEstateAgency): RealEstateAgencyFormState {
  if (!agency) return EMPTY_FORM_STATE;

  return {
    name: agency.name ?? '',
    cnpj: agency.cnpj ?? '',
    email: agency.email ?? '',
    phone: agency.phone ?? '',
    address: agency.address ?? '',
    contact_person: agency.contact_person ?? '',
    commission_percentage: String(agency.commission_percentage ?? 30),
    status: agency.status,
  };
}

/**
 * Converte string vazia de campo opcional em `null` (em vez de mandar ""
 * para colunas nullable do banco).
 */
function nullifyEmpty<T extends string | undefined>(value: T): string | null {
  return value ? value : null;
}

interface RealEstateAgencyFormProps {
  /** Imobiliária existente, quando o formulário edita em vez de criar. */
  agency?: RealEstateAgency;
  onSubmit: (data: RealEstateAgencyMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de imobiliária — fiel ao dialog de criar/editar de
 * `original-project/src/pages/RealEstateAgencies.jsx`, usado tanto na
 * criação (`RealEstateAgencyFormPage`) quanto na edição
 * (`RealEstateAgencyEditDialog`).
 */
export function RealEstateAgencyForm({ agency, onSubmit, isSubmitting, submitLabel, onCancel }: RealEstateAgencyFormProps) {
  const [formData, setFormData] = useState<RealEstateAgencyFormState>(() => stateFromAgency(agency));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof RealEstateAgencyFormState>(field: K, value: RealEstateAgencyFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = realEstateAgencyFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      ...parsed.data,
      cnpj: nullifyEmpty(parsed.data.cnpj),
      email: nullifyEmpty(parsed.data.email),
      phone: nullifyEmpty(parsed.data.phone),
      address: nullifyEmpty(parsed.data.address),
      contact_person: nullifyEmpty(parsed.data.contact_person),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Nome da Imobiliária *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Imobiliária Exemplo Ltda."
          />
        </div>

        <div>
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input id="cnpj" value={formData.cnpj} onChange={(e) => setField('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
        </div>

        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="contato@imobiliaria.com"
          />
        </div>

        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" value={formData.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="(00) 00000-0000" />
        </div>

        <div>
          <Label htmlFor="contact_person">Responsável</Label>
          <Input
            id="contact_person"
            value={formData.contact_person}
            onChange={(e) => setField('contact_person', e.target.value)}
            placeholder="Nome do responsável"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="address">Endereço</Label>
          <Input id="address" value={formData.address} onChange={(e) => setField('address', e.target.value)} placeholder="Rua das Flores, 123" />
        </div>

        <div>
          <Label htmlFor="commission_percentage">% Comissão da Imobiliária *</Label>
          <Input
            id="commission_percentage"
            type="number"
            min="0"
            max="100"
            value={formData.commission_percentage}
            onChange={(e) => setField('commission_percentage', e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">Ex: 30% = Imobiliária fica com 30%, Corretor com 70%</p>
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={(value) => setField('status', value as RealEstateAgencyFormInput['status'])}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="inativa">Inativa</SelectItem>
            </SelectContent>
          </Select>
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
