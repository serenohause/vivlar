/**
 * Dashboard Executivo — construído incrementalmente.
 *
 * Ao contrário do resto do módulo de auth/shell, esta página NÃO tenta
 * replicar de uma vez a Dashboard.jsx original (que junta KPIs, gráficos
 * de receita/funil, performance de equipe e 3 mini-dashboards
 * operacionais — todos dependentes de módulos de dados que ainda não
 * existem: projetos, unidades, deals, comissões, financeiro, vistorias,
 * manutenção).
 *
 * Decisão do usuário: cada módulo novo (`/new-feature`) que tiver um
 * bloco correspondente no Dashboard original deve, ao ser construído,
 * também adicionar aqui o bloco pertinente (ex: o módulo de
 * Projetos/Unidades adiciona os KPIs de unidades disponíveis; o módulo
 * de CRM adiciona o funil de vendas; o financeiro adiciona o gráfico de
 * receita; etc.) — em vez de tudo de uma vez agora, com dado nenhum por
 * trás.
 *
 * Convenção para quem for adicionar um bloco novo: cada bloco vira uma
 * seção própria dentro do <div className="space-y-8"> abaixo, na mesma
 * ordem em que aparece na Dashboard.jsx original (ver
 * original-project/src/pages/Dashboard.jsx) — cabeçalho, alertas
 * críticos, KPIs, ações rápidas, gráficos, performance de equipe,
 * operacional/pós-venda.
 */
export function Dashboard() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Dashboard Executivo</h1>
          <p className="mt-1 text-muted-foreground">Visão estratégica do negócio</p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum módulo de dados ativado ainda. Métricas e gráficos aparecem aqui conforme os módulos forem sendo
          construídos.
        </p>
      </div>
    </div>
  );
}
