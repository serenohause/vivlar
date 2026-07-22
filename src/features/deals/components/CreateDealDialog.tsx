import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Broker } from '@/features/brokers/types';
import type { Client } from '@/features/clients/types';
import { CreateBrokerInline } from '@/features/deals/components/CreateBrokerInline';
import { CreateClientInline } from '@/features/deals/components/CreateClientInline';
import { KANBAN_STAGES, formatCurrency, DEAL_SALES_STAGE_LABELS } from '@/features/deals/constants';
import { useCreateDeal } from '@/features/deals/hooks';
import { dealFormSchema, type DealFormInput } from '@/features/deals/schemas';
import type { Deal } from '@/features/deals/types';
import type { Project } from '@/features/projects/types';
import type { Unit } from '@/features/units/types';

const NO_UNIT = '__no_unit__';

const EMPTY_FORM: DealFormInput = {
  client_id: '',
  broker_id: '',
  project_id: '',
  unit_id: undefined,
  sales_stage: 'lead',
  expected_sale_value: undefined,
};

interface CreateDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  brokers: Broker[];
  projects: Project[];
  units: Unit[];
  deals: Deal[];
}

/**
 * Tradução do dialog "Nova Oportunidade" de
 * `original-project/src/pages/CRM.jsx` — cliente/corretor/projeto
 * obrigatórios (botões "Novo Cliente"/"Novo Corretor" abrem
 * `CreateClientInline`/`CreateBrokerInline` sem fechar este dialog), unidade
 * opcional (lista já filtrada para "disponível e sem negócio ativo", mesmo
 * critério do original — por isso não há alerta de "unidade já tem negócio
 * ativo" aqui: a violação do índice único só pode acontecer por corrida
 * entre duas abas, e nesse caso `useCreateDeal` já traduz o erro do banco
 * para uma mensagem amigável).
 */
export function CreateDealDialog({ open, onOpenChange, clients, brokers, projects, units, deals }: CreateDealDialogProps) {
  const [formData, setFormData] = useState<DealFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [isCreateBrokerOpen, setIsCreateBrokerOpen] = useState(false);

  const createDeal = useCreateDeal();

  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [clients]);
  const sortedBrokers = useMemo(
    () => brokers.filter((b) => b.is_active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [brokers]
  );

  const availableUnits = useMemo(() => {
    if (!formData.project_id) return [];
    return units.filter((u) => {
      if (u.project_id !== formData.project_id) return false;
      if (u.status !== 'disponivel') return false;
      const hasActiveDeal = deals.some((d) => d.unit_id === u.id && d.is_active);
      return !hasActiveDeal;
    });
  }, [units, deals, formData.project_id]);

  const selectedUnit = units.find((u) => u.id === formData.unit_id);
  const selectedBroker = brokers.find((b) => b.id === formData.broker_id);
  const estimatedCommission =
    selectedUnit?.list_price && selectedBroker?.commission_rate
      ? selectedUnit.list_price * selectedBroker.commission_rate
      : null;

  function setField<K extends keyof DealFormInput>(field: K, value: DealFormInput[K]) {
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

    const parsed = dealFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createDeal.mutate(
      {
        client_id: parsed.data.client_id,
        broker_id: parsed.data.broker_id || null,
        project_id: parsed.data.project_id,
        unit_id: parsed.data.unit_id || null,
        sales_stage: parsed.data.sales_stage,
        expected_sale_value: parsed.data.expected_sale_value ?? null,
      },
      {
        onSuccess: () => {
          toast.success('Oportunidade criada com sucesso!');
          handleClose();
        },
        onError: (mutationError) => {
          setError(mutationError.message);
        },
      }
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Oportunidade</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Cliente *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreateClientOpen(true)}
                    className="h-auto px-2 py-1 text-brand hover:text-brand/80"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Novo Cliente
                  </Button>
                </div>
                <Select value={formData.client_id} onValueChange={(value) => setField('client_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Corretor *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCreateBrokerOpen(true)}
                    className="h-auto px-2 py-1 text-brand hover:text-brand/80"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Novo Corretor
                  </Button>
                </div>
                <Select value={formData.broker_id} onValueChange={(value) => setField('broker_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o corretor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedBrokers.map((broker) => (
                      <SelectItem key={broker.id} value={broker.id}>
                        {broker.name} ({(broker.commission_rate * 100).toFixed(1)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Projeto *</Label>
                <Select
                  value={formData.project_id}
                  onValueChange={(value) => setFormData((current) => ({ ...current, project_id: value, unit_id: undefined }))}
                  disabled={projects.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={projects.length === 0 ? 'Nenhum projeto ativo disponível' : 'Selecione o projeto'} />
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

              <div>
                <Label>Unidade (opcional)</Label>
                <Select
                  value={formData.unit_id || NO_UNIT}
                  onValueChange={(value) => {
                    const unit = units.find((u) => u.id === value);
                    setFormData((current) => ({
                      ...current,
                      unit_id: value === NO_UNIT ? undefined : value,
                      expected_sale_value: unit?.list_price ?? current.expected_sale_value,
                    }));
                  }}
                  disabled={!formData.project_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!formData.project_id ? 'Selecione um projeto primeiro' : 'Selecione a unidade'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_UNIT}>Nenhuma</SelectItem>
                    {availableUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.sku} — {formatCurrency(unit.list_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.project_id && availableUnits.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">Todas as unidades estão reservadas ou vendidas</p>
                )}
              </div>

              <div>
                <Label>Estágio Inicial</Label>
                <Select value={formData.sales_stage} onValueChange={(value) => setField('sales_stage', value as DealFormInput['sales_stage'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KANBAN_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {DEAL_SALES_STAGE_LABELS[stage]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor Esperado (R$)</Label>
                <Input
                  type="number"
                  value={formData.expected_sale_value ?? ''}
                  onChange={(e) => setField('expected_sale_value', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="150000"
                  readOnly={Boolean(formData.unit_id)}
                  className={formData.unit_id ? 'bg-muted' : ''}
                />
                {formData.unit_id && <p className="mt-1 text-xs text-muted-foreground">Valor da unidade (não editável)</p>}
              </div>

              {estimatedCommission != null && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm text-muted-foreground">Comissão Estimada</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(estimatedCommission)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Baseado no valor da unidade: {formatCurrency(selectedUnit?.list_price)}
                  </p>
                </div>
              )}

              <FormError message={error} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={createDeal.isPending}>
                {createDeal.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CreateClientInline
        open={isCreateClientOpen}
        onOpenChange={setIsCreateClientOpen}
        onSuccess={(client) => setField('client_id', client.id)}
      />
      <CreateBrokerInline
        open={isCreateBrokerOpen}
        onOpenChange={setIsCreateBrokerOpen}
        onSuccess={(broker) => setField('broker_id', broker.id)}
      />
    </>
  );
}
