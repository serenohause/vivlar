import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { ClientFinanceAccountCard } from '@/features/client-portal/components/ClientFinanceAccountCard';
import { useMyClient } from '@/features/client-portal/hooks';
import { useFinanceAccounts } from '@/features/finance/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Tradução de `original-project/src/pages/ClientFinance.jsx` — "Financeiro",
 * segunda tela do Portal do Cliente.
 *
 * NÃO PORTADO DE PROPÓSITO: `VendaFinanceira`/`ParcelasEntrada` — modelo
 * financeiro legado do original (`vendas-financeiras-client`/`parcelas-entrada-client`
 * em `ClientFinance.jsx`), já substituído por `finance_accounts`/
 * `payment_installments` no restante do app (ver `docs/DOMAIN_MAP.md`,
 * "modelo legado morto"). Só o modelo novo é usado aqui, mesmo critério do
 * lado admin (`FinanceListPage`/`FinanceAccountDetailPage`).
 *
 * `useFinanceAccounts()` é a MESMA query do lado admin (`FinanceListPage`) —
 * a RLS (`finance_accounts_select_tenant_client_own`,
 * `0053_rls_client_portal_access.sql`, via `client_owns_unit()`) já devolve
 * só a(s) carteira(s) da(s) unidade(s) do cliente autenticado, sem precisar
 * de nenhum filtro adicional aqui (mesma simplificação de `ClientUnitPage`).
 */
export function ClientFinancePage() {
  const { data: client, isLoading: isLoadingClient, isError: isErrorClient, refetch: refetchClient } = useMyClient();
  const { data: accounts, isLoading: isLoadingAccounts, isError: isErrorAccounts, refetch: refetchAccounts } = useFinanceAccounts();
  const { data: units } = useUnits();

  const isLoading = isLoadingClient || (Boolean(client) && isLoadingAccounts);
  const isError = isErrorClient || isErrorAccounts;

  if (isLoading) return <LoadingInline />;
  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          void refetchClient();
          void refetchAccounts();
        }}
      />
    );
  }

  if (!client) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">Seu perfil não está vinculado a um cliente.</p>
      </div>
    );
  }

  const myAccounts = accounts ?? [];

  if (myAccounts.length === 0) {
    return (
      <div>
        <PageHeader title="Financeiro" subtitle="Acompanhe seus pagamentos" />
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">Nenhuma carteira financeira encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" subtitle="Acompanhamento de pagamentos e financiamento" />

      {myAccounts.map((account) => (
        <ClientFinanceAccountCard key={account.id} account={account} unit={units?.find((u) => u.id === account.unit_id)} />
      ))}
    </div>
  );
}
