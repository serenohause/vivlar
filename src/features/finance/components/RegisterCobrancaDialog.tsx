import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COBRANCA_ACAO_LABELS, COBRANCA_CANAL_OPTIONS } from '@/features/finance/constants';
import { useCobrancaHistorico, useRegisterCobranca } from '@/features/finance/hooks';
import { registerCobrancaFormSchema, type RegisterCobrancaFormInput } from '@/features/finance/schemas';
import type { CobrancaAcao } from '@/features/finance/types';

const EMPTY_FORM: RegisterCobrancaFormInput = { acao: 'manual', canal: 'LIGACAO', observacoes: '' };

interface RegisterCobrancaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentId: string;
}

/**
 * Diálogo "Registrar Cobrança" de `InadimplenciaManagerPage` — tradução do
 * dialog "Registrar Ação de Cobrança" (`AcoesCobranca`,
 * `InadimplenciaManager.jsx`), que só pedia `observacoes` (ação/canal eram
 * sempre `'MANUAL'`/`'MANUAL'`, fixos no código). Aqui `ação`/`canal` viram
 * campos explícitos, como pedido nesta leva — mais fiel ao schema real
 * (`cobranca_acao` tem 5 valores, `canal` é texto livre). Abaixo do
 * formulário, lista o histórico de ações já registradas para a parcela
 * (`useCobrancaHistorico`) — não existe como tela própria no original (só a
 * "Última Ação" na tabela), incluído aqui para não perder o rastro das
 * ações anteriores ao abrir o diálogo de novo.
 */
export function RegisterCobrancaDialog({ open, onOpenChange, installmentId }: RegisterCobrancaDialogProps) {
  const [formData, setFormData] = useState<RegisterCobrancaFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data: historico } = useCobrancaHistorico(open ? installmentId : undefined);
  const registerCobranca = useRegisterCobranca(installmentId);

  function setField<K extends keyof RegisterCobrancaFormInput>(field: K, value: RegisterCobrancaFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    setFormData(EMPTY_FORM);
    setError(null);
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = registerCobrancaFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    registerCobranca.mutate(
      {
        acao: parsed.data.acao,
        canal: parsed.data.canal,
        observacoes: parsed.data.observacoes || null,
      },
      {
        onSuccess: () => {
          toast.success('Ação de cobrança registrada com sucesso.');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Ação de Cobrança</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Ação</Label>
              <Select value={formData.acao} onValueChange={(value) => setField('acao', value as CobrancaAcao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COBRANCA_ACAO_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal</Label>
              <Select value={formData.canal} onValueChange={(value) => setField('canal', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COBRANCA_CANAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações sobre o contato realizado..."
                value={formData.observacoes ?? ''}
                onChange={(e) => setField('observacoes', e.target.value)}
                rows={4}
              />
            </div>
            <FormError message={error} />

            {historico && historico.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Histórico</p>
                <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                  {historico.map((item) => (
                    <li key={item.id} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{COBRANCA_ACAO_LABELS[item.acao]}</span>
                        <span className="text-muted-foreground">{new Date(item.data_execucao).toLocaleString('pt-BR')}</span>
                      </div>
                      {item.observacoes && <p className="mt-0.5 text-muted-foreground">{item.observacoes}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={registerCobranca.isPending}>
              {registerCobranca.isPending ? 'Salvando...' : 'Salvar Ação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
