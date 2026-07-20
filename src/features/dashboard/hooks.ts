export interface NavigationBadges {
  crm: number;
  finance: number;
  maintenance: number;
  inspections: number;
  /**
   * O original referenciava este badge no item "Unidades" da sidebar, mas
   * `useNavigationBadges` nunca o calculava de fato (sempre `undefined` ->
   * nunca exibido). Incluído aqui só para o tipo bater com o que a
   * navegação referencia — zerado, igual aos demais.
   */
  units: number;
}

/**
 * No app original (`components/shared/NavigationBadges.jsx`), este hook
 * contava registros reais via `base44.entities.X.list()` (deals parados
 * há mais de 7 dias, parcelas em atraso, manutenções abertas, vistorias
 * pendentes). Nenhuma dessas tabelas existe ainda no Supabase deste
 * projeto — os módulos de CRM, Financeiro, Vistorias e Manutenção ainda
 * não foram construídos.
 *
 * Por enquanto retorna a mesma estrutura, zerada. Quando cada módulo de
 * dados existir, substituir o corpo por uma query real (React Query,
 * como os demais hooks de `src/features/*\/hooks.ts`) sem precisar mexer
 * em quem consome este hook (sidebar, bottom nav).
 */
export function useNavigationBadges(): NavigationBadges {
  return {
    crm: 0,
    finance: 0,
    maintenance: 0,
    inspections: 0,
    units: 0,
  };
}
