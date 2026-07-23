import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CONTRIBUTION_STATUS_CONFIG, CONTRIBUTION_TYPE_LABELS } from '@/features/investors/constants';
import {
  NO_INVESTOR,
  investmentContributionFormSchema,
  type InvestmentContributionFormInput,
  type InvestmentContributionMutationPayload,
} from '@/features/investors/schemas';
import type { InvestmentContribution, Investor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

type ContributionFormState = Record<Exclude<keyof InvestmentContributionFormInput, 'tipo' | 'status'>, string> & {
  tipo: InvestmentContributionFormInput['tipo'];
  status: InvestmentContributionFormInput['status'];
};

function emptyForm(lockedProjectId?: string): ContributionFormState {
  return {
    project_id: lockedProjectId ?? '',
    investor_id: NO_INVESTOR,
    valor: '',
    data: new Date().toISOString().split('T')[0] ?? '',
    tipo: 'APORTE',
    status: 'PREVISTO',
    observacoes: '',
    comprovante_url: '',
    comprovante_nome: '',
  };
}

function stateFromContribution(contribution: InvestmentContribution): ContributionFormState {
  return {
    project_id: contribution.project_id,
    investor_id: contribution.investor_id ?? NO_INVESTOR,
    valor: String(contribution.valor),
    data: contribution.data,
    tipo: contribution.tipo,
    status: contribution.status,
    observacoes: contribution.observacoes ?? '',
    comprovante_url: contribution.comprovante_url ?? '',
    comprovante_nome: contribution.comprovante_nome ?? '',
  };
}

function nullifyEmpty(value: string): string | null {
  return value ? value : null;
}

interface ContributionFormProps {
  contribution?: InvestmentContribution;
  investors: Investor[];
  projects: Project[];
  /** Trava o projeto (a partir de `InvestorDetailPage`/`ProjectDetailPage`, quando existir) — sem equivalente direto no original, só usado se um contexto de página fixar o projeto. */
  lockedProjectId?: string;
  onSubmit: (data: InvestmentContributionMutationPayload) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}

/**
 * Campos do formulário de aporte — tradução 1:1 de `ContributionForm`
 * (`original-project/src/pages/InvestmentContributions.jsx`), reutilizado
 * na criação e na edição.
 */
export function ContributionForm({
  contribution,
  investors,
  projects,
  lockedProjectId,
  onSubmit,
  isSubmitting,
  submitLabel,
  onCancel,
}: ContributionFormProps) {
  const [formData, setFormData] = useState<ContributionFormState>(() =>
    contribution ? stateFromContribution(contribution) : emptyForm(lockedProjectId)
  );
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof ContributionFormState>(field: K, value: ContributionFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = investmentContributionFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    onSubmit({
      project_id: parsed.data.project_id,
      investor_id: parsed.data.investor_id && parsed.data.investor_id !== NO_INVESTOR ? parsed.data.investor_id : null,
      valor: parsed.data.valor,
      data: parsed.data.data,
      tipo: parsed.data.tipo,
      status: parsed.data.status,
      observacoes: nullifyEmpty(parsed.data.observacoes ?? ''),
      comprovante_url: nullifyEmpty(parsed.data.comprovante_url ?? ''),
      comprovante_nome: nullifyEmpty(parsed.data.comprovante_nome ?? ''),
    });
  }

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
        <Label>Investidor</Label>
        <Select value={formData.investor_id} onValueChange={(value) => setField('investor_id', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um investidor (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_INVESTOR}>Sem investidor (capital próprio)</SelectItem>
            {investors.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="contribution-valor">Valor *</Label>
          <Input
            id="contribution-valor"
            type="number"
            step="0.01"
            value={formData.valor}
            onChange={(e) => setField('valor', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label htmlFor="contribution-data">Data *</Label>
          <Input id="contribution-data" type="date" value={formData.data} onChange={(e) => setField('data', e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select value={formData.tipo} onValueChange={(value) => setField('tipo', value as InvestmentContributionFormInput['tipo'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRIBUTION_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(value) => setField('status', value as InvestmentContributionFormInput['status'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRIBUTION_STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="contribution-observacoes">Observações</Label>
        <Textarea id="contribution-observacoes" value={formData.observacoes} onChange={(e) => setField('observacoes', e.target.value)} rows={2} />
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
