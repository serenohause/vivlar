import { COBRANCA_ACAO_LABELS } from '@/features/finance/constants';
import { useCobrancaHistorico } from '@/features/finance/hooks';

/**
 * Tradução de `UltimaAcaoCobranca` em `original-project/src/pages/InadimplenciaManager.jsx`
 * — última ação de cobrança registrada para a parcela, coluna "Última Ação"
 * de `InadimplenciaManagerPage`. O original recebia o histórico inteiro já
 * carregado por prop e filtrava/ordenava no cliente; aqui usa
 * `useCobrancaHistorico(installmentId)` (já ordenado por `data_execucao`
 * desc pela query), um hook por linha — número de parcelas em atraso
 * costuma ser pequeno o bastante pra isso não pesar, e mantém a assinatura
 * de hook pedida (`useCobrancaHistorico(installmentId)`, um único id).
 */
export function UltimaAcaoCobranca({ installmentId }: { installmentId: string }) {
  const { data: historico, isLoading } = useCobrancaHistorico(installmentId);
  const ultimaAcao = historico?.[0];

  if (isLoading) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }

  if (!ultimaAcao) {
    return <span className="text-xs text-muted-foreground">Nenhuma ação</span>;
  }

  return (
    <div className="text-xs">
      <div className="font-medium text-foreground">{COBRANCA_ACAO_LABELS[ultimaAcao.acao]}</div>
      <div className="text-muted-foreground">{new Date(ultimaAcao.data_execucao).toLocaleDateString('pt-BR')}</div>
    </div>
  );
}
