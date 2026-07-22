import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ACTIVITY_TYPE_LABELS } from '@/features/deals/constants';
import { useCreateActivity } from '@/features/deals/activities-hooks';
import { activityFormSchema, type ActivityFormInput } from '@/features/deals/schemas';

const EMPTY_FORM: ActivityFormInput = { title: '', type: 'outro', due_date: '', description: '' };

interface CreateActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  clientId: string | null;
  unitId: string | null;
}

/**
 * Diálogo "Nova Atividade" — tradução unificada do formato canônico (`title`,
 * `type`, `due_date`, `description`) usado por
 * `original-project/src/pages/DealDetail.jsx`. Também substitui o dialog
 * legado "Registrar Atividade" de `CRM.jsx` (que usava campos diferentes —
 * `activity_type`/`next_action_date`/`completed`/prioridade — e tipos fora
 * do enum `activity_type` do banco: Email/Reunião/Proposta): usado aqui a
 * partir do menu de cada card do Kanban também, com o mesmo formato — a
 * unificação já era esperada, ver comentário em
 * `supabase/migrations/0015_activities.sql`.
 */
export function CreateActivityDialog({ open, onOpenChange, dealId, clientId, unitId }: CreateActivityDialogProps) {
  const [formData, setFormData] = useState<ActivityFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const createActivity = useCreateActivity(dealId);

  function setField<K extends keyof ActivityFormInput>(field: K, value: ActivityFormInput[K]) {
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

    const parsed = activityFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createActivity.mutate(
      {
        title: parsed.data.title,
        type: parsed.data.type,
        due_date: parsed.data.due_date || null,
        description: parsed.data.description || null,
        client_id: clientId,
        unit_id: unitId,
      },
      {
        onSuccess: handleClose,
        onError: () => setError('Erro ao salvar atividade. Tente novamente.'),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Atividade</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="activity-title">Título *</Label>
              <Input
                id="activity-title"
                value={formData.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Título da atividade"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={formData.type} onValueChange={(value) => setField('type', value as ActivityFormInput['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="activity-due">Data de Vencimento</Label>
              <Input
                id="activity-due"
                type="date"
                value={formData.due_date}
                onChange={(e) => setField('due_date', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="activity-desc">Descrição</Label>
              <Textarea
                id="activity-desc"
                value={formData.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Descrição da atividade..."
              />
            </div>

            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createActivity.isPending}>
              {createActivity.isPending ? 'Salvando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
