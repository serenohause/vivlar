import { AlertCircle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

/**
 * Estado "perfil não vinculado" — usuário autenticado com `tenant_role =
 * 'investidor'`, mas nenhum `investors.user_id` aponta pra ele ainda (ver
 * `useMyInvestor`). Compartilhado pelas 4 telas do Portal do Investidor
 * (Dashboard/Meus Projetos/Meus Aportes/Meus Retornos) para não duplicar o
 * mesmo card 4 vezes — mesma linguagem visual do card equivalente do Portal
 * do Cliente (`ClientUnitPage`/`ClientMaintenancePage`).
 */
export function InvestorNotLinkedState() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Card className="max-w-md border-amber-200 bg-amber-50">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-600" />
          <h3 className="mb-2 text-lg font-semibold">Perfil não vinculado</h3>
          <p className="text-slate-600">
            Você ainda não possui um perfil de investidor vinculado. Entre em contato com a Vivlar para mais informações.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
