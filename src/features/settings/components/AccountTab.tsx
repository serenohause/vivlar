import { useState } from 'react';
import { toast } from 'sonner';
import { Settings as SettingsIcon, UserX } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { TENANT_ROLE_LABELS } from '@/features/settings/constants';
import { useRequestAccountDeletion } from '@/features/settings/hooks';

/**
 * Aba "Conta" — tradução de `Settings.jsx`. Sem nome estruturado de usuário
 * (mesma lacuna já documentada em `AppShell.tsx`/`getInitials`): mostra só
 * o e-mail em vez de "nome + e-mail" do original.
 */
export function AccountTab() {
  const { user, tenantRole } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestDeletion = useRequestAccountDeletion();

  function handleConfirmDeletion() {
    requestDeletion.mutate(undefined, {
      onSuccess: () => {
        toast.success('Solicitação registrada com sucesso!', {
          description: 'Nossa equipe entrará em contato em até 48 horas.',
          duration: 5000,
        });
        setConfirmOpen(false);
      },
      onError: (error) => {
        toast.error('Erro ao registrar solicitação', {
          description: error.message || 'Tente novamente mais tarde.',
        });
      },
    });
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          Configurações da Conta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="rounded-lg bg-muted p-4">
            <p className="font-medium text-foreground">{user?.email}</p>
            {tenantRole && <Badge className="mt-2">{TENANT_ROLE_LABELS[tenantRole]}</Badge>}
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="mb-2 font-semibold text-foreground">Zona de Perigo</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Solicite a exclusão permanente da sua conta. Esta ação não pode ser desfeita.
            </p>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <UserX className="mr-2 h-4 w-4" />
              Excluir Conta
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação solicitará a exclusão permanente da sua conta e todos os dados associados.</p>
              <p className="font-medium text-foreground">Esta ação não pode ser desfeita.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeletion}
              className="bg-destructive hover:bg-destructive/90"
              disabled={requestDeletion.isPending}
            >
              {requestDeletion.isPending ? 'Registrando...' : 'Solicitar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
