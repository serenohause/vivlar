/**
 * Tradução de "nome de página" (mesma convenção PascalCase do app Base44
 * original, ex: "RealEstateAgencies", "InvestorDashboard") para a URL da
 * SPA nova.
 *
 * Convenção adotada (documentar aqui para os módulos futuros do
 * `/new-feature` baterem com as mesmas rotas quando as páginas reais forem
 * construídas): kebab-case mecânico do nome original —
 * "RealEstateAgencies" -> "/real-estate-agencies" — exceto "Dashboard",
 * que é a rota raiz "/". Isso garante correspondência 1:1 e previsível com
 * os nomes de página do Base44, sem precisar manter uma tabela de tradução
 * manual em paralelo.
 */
export function pageUrl(pageName: string): string {
  if (pageName === 'Dashboard') return '/';
  return `/${toKebabCase(pageName)}`;
}

export function toKebabCase(pascalCase: string): string {
  return pascalCase
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
