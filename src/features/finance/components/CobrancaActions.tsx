import { useState } from 'react';
import { Mail, MessageSquare, Phone } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { Client } from '@/features/clients/types';
import { useRegisterCobranca } from '@/features/finance/hooks';
import { RegisterCobrancaDialog } from '@/features/finance/components/RegisterCobrancaDialog';

interface CobrancaActionsProps {
  installmentId: string;
  client: Client | undefined;
}

/**
 * Ações de cobrança da tabela "Parcelas em Atraso" — tradução de
 * `AcoesCobranca` em `original-project/src/pages/InadimplenciaManager.jsx`.
 * Os 3 botões de atalho (e-mail/WhatsApp/ligação) abrem o app padrão do
 * usuário via deep link (`mailto:`/`wa.me`/`tel:`) — igual ao original, o
 * sistema nunca envia nada por conta própria, só abre o canal para o
 * usuário mandar manualmente — e registram a ação em `cobranca_historico`
 * na sequência (`canal` fiel ao botão clicado, diferente do original que
 * gravava sempre `'MANUAL'`). O botão "Registrar Cobrança" abre o diálogo
 * completo (`RegisterCobrancaDialog`) para escolher ação/canal/observações
 * à mão.
 */
export function CobrancaActions({ installmentId, client }: CobrancaActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const registerCobranca = useRegisterCobranca(installmentId);

  function logQuickAction(canal: 'EMAIL' | 'WHATSAPP' | 'LIGACAO') {
    registerCobranca.mutate(
      { acao: 'manual', canal, observacoes: null },
      { onError: (error) => toast.error('Não foi possível registrar a ação: ' + error.message) }
    );
  }

  function handleEmail() {
    if (!client?.email) return;
    window.open(`mailto:${client.email}?subject=Cobrança de Parcela em Atraso`);
    logQuickAction('EMAIL');
  }

  function handleWhatsApp() {
    if (!client?.phone) return;
    const phone = client.phone.replace(/\D/g, '');
    window.open(`https://wa.me/55${phone}`);
    logQuickAction('WHATSAPP');
  }

  function handleLigacao() {
    if (!client?.phone) return;
    window.open(`tel:${client.phone}`);
    logQuickAction('LIGACAO');
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={handleEmail} disabled={!client?.email} title="Enviar e-mail">
        <Mail className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={handleWhatsApp} disabled={!client?.phone} title="WhatsApp">
        <MessageSquare className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={handleLigacao} disabled={!client?.phone} title="Ligar">
        <Phone className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
        Registrar Cobrança
      </Button>
      <RegisterCobrancaDialog open={dialogOpen} onOpenChange={setDialogOpen} installmentId={installmentId} />
    </div>
  );
}
