import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface MarkDealLostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}

/**
 * Motivo da perda — mesmo campo condicional de
 * `original-project/src/pages/DealDetail.jsx` ("Alterar Estágio" ->
 * `selectedStage === "PERDIDO"`), extraído em dialog próprio para ser usado
 * também a partir do menu "Marcar como Perdido" do Kanban (`CRM.jsx`), que
 * no original pulava direto para a mutation sem pedir motivo — aqui pedimos
 * sempre, mesma UX nos dois pontos de entrada.
 */
export function MarkDealLostDialog({ open, onOpenChange, onConfirm, isPending }: MarkDealLostDialogProps) {
  const [reason, setReason] = useState('');

  function handleClose() {
    setReason('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar Negócio como Perdido</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Motivo da Perda</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo..." />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              onConfirm(reason);
              setReason('');
            }}
          >
            {isPending ? 'Salvando...' : 'Marcar como Perdido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
