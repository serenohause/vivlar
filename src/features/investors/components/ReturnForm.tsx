import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RETURN_STATUS_CONFIG, RETURN_TYPE_CONFIG } from '@/features/investors/constants';
import {
  NO_INVESTOR,
  investmentReturnFormSchema,
  type InvestmentReturnFormInput,
  type InvestmentReturnMutationPayload,
} from '@/features/investors/schemas';
import type { InvestmentReturn, Investor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

type ReturnFormState = Record<Exclude<keyof InvestmentReturnFormInput, 'return_type' | 'status'>, string> & {
  return_type: InvestmentReturnFormInput['return_type'];
  status: InvestmentReturnFormInput['status'];
};

function emptyForm(lockedProjectId?: string): ReturnFormState {
  return {
    project_id: lockedProjectId ?? '',
    return_type: 'PRINCIPAL',
    investor_id: NO_INVESTOR,
    valor: '',
    data: new Date().toISOString().split('T')[0] ?? '',
    status: 'PREVISTO',
    observacoes: '',
  };
}

function stateFromReturn(ret: InvestmentReturn): ReturnFormState {
  return {
    project_id: ret.project_id,
    return_type: ret.return_type,
    investor_id: ret.investor_id ?? NO_INVESTOR,
    valor: String(ret.valor),
    data: ret.data,
    status: ret.status,
    observacoes: ret.observacoes ?? '',
  };
}

function nullifyEmpty(value: string): string | null {
  return value ? value : null;
}

interface ReturnFormProps {
  investmentReturn?: InvestmentReturn;
  investors: Investor[];
  projects: Project[];
  lockedProjectId?: string;
  onSubmit: (data: InvestmentReturnMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de retorno — tradução 1:1 de `ReturnForm`
 * (`original-project/src/pages/InvestmentReturns.jsx`), incluindo a regra de
 * negócio "investidor obrigatório para todo tipo exceto Dividendos Vivlar"
 * (`disabled` do botão de submit original) e o efeito colateral de zerar
 * `investor_id` ao trocar para "Dividendos Vivlar" (`onValueChange` do
 * `<Select>` de tipo original).
 */
export function ReturnForm({ investmentReturn, investors, projects, lockedProjectId, onSubmit, isSubmitting, submitLabel, onCancel }: ReturnFormProps) {
  const [formData, setFormData] = useState<ReturnFormState>(() => (investmentReturn ? stateFromReturn(investmentReturn) : emptyForm(lockedProjectId)));
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof ReturnFormState>(field: K, value: ReturnFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleReturnTypeChange(value: InvestmentReturnFormInput['return_type']) {
    setFormData((current) => ({
      ...current,
      return_type: value,
      investor_id: value === 'DIVIDENDO_VIVLAR' ? NO_INVESTOR : current.investor_id,
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = investmentReturnFormSchema.safeParse({
      ...formData,
      investor_id: formData.investor_id === NO_INVESTOR ? '' : formData.investor_id,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      project_id: parsed.data.project_id,
      investor_id: parsed.data.investor_id ? parsed.data.investor_id : null,
      valor: parsed.data.valor,
      data: parsed.data.data,
      return_type: parsed.data.return_type,
      status: parsed.data.status,
      observacoes: nullifyEmpty(parsed.data.observacoes ?? ''),
    });
  }

  const requiresInvestor = formData.return_type !== 'DIVIDENDO_VIVLAR';
  const canSubmit = !requiresInvestor || (formData.investor_id !== NO_INVESTOR && formData.investor_id !== '');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Projeto *</Label>
        <Select value={formData.project_id} onValueChange={(value) => setField('project_id', value)} disabled={Boolean(lockedProjectId)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um projeto" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>
          Tipo de Retorno * <span className="ml-2 text-xs text-muted-foreground">(Define quem recebe)</span>
        </Label>
        <Select value={formData.return_type} onValueChange={(value) => handleReturnTypeChange(value as InvestmentReturnFormInput['return_type'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RETURN_TYPE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div>
                  <p className="font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {requiresInvestor && (
        <div>
          <Label>Investidor *</Label>
          <Select value={formData.investor_id} onValueChange={(value) => setField('investor_id', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um investidor" />
            </SelectTrigger>
            <SelectContent>
              {investors.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formData.investor_id === NO_INVESTOR && <p className="mt-1 text-xs text-amber-600">Investidor obrigatório para este tipo</p>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="return-valor">Valor *</Label>
          <Input
            id="return-valor"
            type="number"
            step="0.01"
            value={formData.valor}
            onChange={(e) => setField('valor', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label htmlFor="return-data">Data *</Label>
          <Input id="return-data" type="date" value={formData.data} onChange={(e) => setField('data', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Status</Label>
        <Select value={formData.status} onValueChange={(value) => setField('status', value as InvestmentReturnFormInput['status'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RETURN_STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="return-observacoes">Observações</Label>
        <Textarea id="return-observacoes" value={formData.observacoes} onChange={(e) => setField('observacoes', e.target.value)} rows={2} />
      </div>

      <FormError message={error} />

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || !canSubmit} variant="brand">
          {isSubmitting ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
