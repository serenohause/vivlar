import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { investorFormSchema, type InvestorFormInput, type InvestorMutationPayload } from '@/features/investors/schemas';
import type { Investor } from '@/features/investors/types';

type InvestorFormState = Record<Exclude<keyof InvestorFormInput, 'tipo' | 'status'>, string> & {
  tipo: InvestorFormInput['tipo'];
  status: InvestorFormInput['status'];
};

const EMPTY_FORM_STATE: InvestorFormState = {
  nome: '',
  documento: '',
  tipo: 'PF',
  email: '',
  telefone: '',
  status: 'ATIVO',
  observacoes: '',
};

function stateFromInvestor(investor?: Investor): InvestorFormState {
  if (!investor) return EMPTY_FORM_STATE;

  return {
    nome: investor.nome,
    documento: investor.documento ?? '',
    tipo: investor.tipo,
    email: investor.email ?? '',
    telefone: investor.telefone ?? '',
    status: investor.status,
    observacoes: investor.observacoes ?? '',
  };
}

/** Converte string vazia de campo opcional em `null` (em vez de mandar "" para colunas nullable do banco). */
function nullifyEmpty(value: string): string | null {
  return value ? value : null;
}

interface InvestorFormProps {
  /** Investidor existente, quando o formulário edita em vez de criar. */
  investor?: Investor;
  onSubmit: (data: InvestorMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de investidor — tradução 1:1 de `InvestorForm`
 * (`original-project/src/pages/Investors.jsx`), reutilizado tanto na
 * criação (`InvestorCreateDialog`) quanto na edição (`InvestorEditDialog`).
 */
export function InvestorForm({ investor, onSubmit, isSubmitting, submitLabel, onCancel }: InvestorFormProps) {
  const [formData, setFormData] = useState<InvestorFormState>(() => stateFromInvestor(investor));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof InvestorFormState>(field: K, value: InvestorFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = investorFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      nome: parsed.data.nome,
      documento: nullifyEmpty(parsed.data.documento ?? ''),
      tipo: parsed.data.tipo,
      email: nullifyEmpty(parsed.data.email ?? ''),
      telefone: nullifyEmpty(parsed.data.telefone ?? ''),
      status: parsed.data.status,
      observacoes: nullifyEmpty(parsed.data.observacoes ?? ''),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="investor-nome">Nome *</Label>
        <Input
          id="investor-nome"
          value={formData.nome}
          onChange={(e) => setField('nome', e.target.value)}
          placeholder="Nome completo ou razão social"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="investor-documento">Documento</Label>
          <Input
            id="investor-documento"
            value={formData.documento}
            onChange={(e) => setField('documento', e.target.value)}
            placeholder="CPF / CNPJ"
          />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={formData.tipo} onValueChange={(value) => setField('tipo', value as InvestorFormInput['tipo'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PF">Pessoa Física</SelectItem>
              <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="investor-email">Email</Label>
          <Input
            id="investor-email"
            type="email"
            value={formData.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <Label htmlFor="investor-telefone">Telefone</Label>
          <Input
            id="investor-telefone"
            value={formData.telefone}
            onChange={(e) => setField('telefone', e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>

      <div>
        <Label>Status</Label>
        <Select value={formData.status} onValueChange={(value) => setField('status', value as InvestorFormInput['status'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="INATIVO">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="investor-observacoes">Observações</Label>
        <Textarea
          id="investor-observacoes"
          value={formData.observacoes}
          onChange={(e) => setField('observacoes', e.target.value)}
          placeholder="Notas adicionais..."
          rows={3}
        />
      </div>

      <FormError message={error} />

      <div className="flex justify-end gap-3 pt-2">
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
