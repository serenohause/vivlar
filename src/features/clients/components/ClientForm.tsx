import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clientFormSchema, type ClientFormInput, type ClientMutationPayload } from '@/features/clients/schemas';
import type { Client } from '@/features/clients/types';

type ClientFormState = Record<keyof ClientFormInput, string>;

const EMPTY_FORM_STATE: ClientFormState = {
  name: '',
  cpf: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

function stateFromClient(client?: Client): ClientFormState {
  if (!client) return EMPTY_FORM_STATE;

  return {
    name: client.name ?? '',
    cpf: client.cpf ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    notes: client.notes ?? '',
  };
}

/**
 * Converte string vazia de campo opcional em `null` (em vez de mandar ""
 * para colunas nullable do banco).
 */
function nullifyEmpty<T extends string | undefined>(value: T): string | null {
  return value ? value : null;
}

interface ClientFormProps {
  /** Cliente existente, quando o formulário edita em vez de criar. */
  client?: Client;
  onSubmit: (data: ClientMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de cliente — fiel ao dialog de criar/editar de
 * `original-project/src/pages/Clients.jsx`, usado tanto na criação
 * (`ClientFormPage`) quanto na edição (`ClientEditDialog`, acionado a
 * partir da lista e do detalhe).
 */
export function ClientForm({ client, onSubmit, isSubmitting, submitLabel, onCancel }: ClientFormProps) {
  const [formData, setFormData] = useState<ClientFormState>(() => stateFromClient(client));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof ClientFormState>(field: K, value: ClientFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = clientFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      ...parsed.data,
      phone: nullifyEmpty(parsed.data.phone),
      email: nullifyEmpty(parsed.data.email),
      address: nullifyEmpty(parsed.data.address),
      notes: nullifyEmpty(parsed.data.notes),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Nome Completo *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setField('name', e.target.value)}
          placeholder="João da Silva"
        />
      </div>

      <div>
        <Label htmlFor="cpf">CPF *</Label>
        <Input
          id="cpf"
          value={formData.cpf}
          onChange={(e) => setField('cpf', e.target.value)}
          placeholder="000.000.000-00"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="joao@email.com"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Endereço</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => setField('address', e.target.value)}
          placeholder="Rua das Flores, 123"
        />
      </div>

      <div>
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Observações sobre o cliente..."
          rows={3}
        />
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
