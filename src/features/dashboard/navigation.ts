import {
  AlertTriangle,
  Bell,
  Briefcase,
  Building2,
  ClipboardCheck,
  DollarSign,
  FileText,
  Home,
  Layers,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { TenantRole } from '@/features/auth/types';
import type { NavigationBadges } from '@/features/dashboard/hooks';

export interface NavItem {
  name: string;
  /** Nome de página original (PascalCase) — ver `src/lib/page-url.ts`. */
  href: string;
  icon: LucideIcon;
  badge?: keyof NavigationBadges;
  badgeVariant?: 'default' | 'warning' | 'danger';
}

export interface NavSection {
  id: string;
  section: string;
  number?: string | null;
  highlight?: boolean;
  items: NavItem[];
}

/**
 * Estrutura de navegação da sidebar — tradução 1:1 de `getNavigationStructure`
 * em original-project/src/Layout.jsx.
 *
 * Diferença de fonte de autorização: o original decide pela combinação
 * `user.app_profile` / `user.role` do Base44. Aqui usamos `tenantRole`,
 * decodificado como custom claim do JWT (ver `useAuth()`), com este
 * mapeamento:
 *   - "investidor"                       -> igual a appProfile INVESTIDOR
 *   - "cliente"                          -> igual a appProfile CLIENTE
 *   - "admin"                            -> nav completa (baseNav +
 *                                           INVESTIMENTOS + SISTEMA completo)
 *   - "comercial" | "administrativo"     -> baseNav + SISTEMA reduzido
 *                                           (Notificações + Templates)
 */
export function getNavigationStructure(tenantRole: TenantRole | null): NavSection[] {
  if (tenantRole === 'investidor') {
    return [
      {
        section: 'INVESTIMENTOS',
        id: 'investimentos',
        items: [
          { name: 'Dashboard', href: 'InvestorDashboard', icon: LayoutDashboard },
          { name: 'Meus Projetos', href: 'InvestorProjects', icon: Building2 },
          { name: 'Meus Aportes', href: 'InvestorContributions', icon: DollarSign },
          { name: 'Meus Retornos', href: 'InvestorReturns', icon: DollarSign },
        ],
      },
    ];
  }

  if (tenantRole === 'cliente') {
    return [
      {
        section: 'PORTAL DO CLIENTE',
        id: 'cliente',
        items: [
          { name: 'Minha Unidade', href: 'ClientUnit', icon: Home },
          { name: 'Financeiro', href: 'ClientFinance', icon: DollarSign },
          { name: 'Manutenções', href: 'ClientMaintenance', icon: Wrench },
        ],
      },
    ];
  }

  const baseNav: NavSection[] = [
    {
      section: 'DASHBOARD EXECUTIVO',
      id: 'dashboard',
      number: null,
      items: [{ name: 'Visão Geral', href: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      section: 'DESENVOLVIMENTO',
      id: 'desenvolvimento',
      number: '1',
      items: [
        { name: 'Terrenos', href: 'Terrains', icon: MapPin },
        { name: 'Projetos', href: 'Projects', icon: Building2 },
        { name: 'Unidades', href: 'Units', icon: Home, badge: 'units' },
      ],
    },
    {
      section: 'VENDAS',
      id: 'vendas',
      number: '2',
      items: [
        { name: 'CRM (Funil)', href: 'CRM', icon: Briefcase, badge: 'crm' },
        { name: 'Clientes', href: 'Clients', icon: Users },
        { name: 'Corretores', href: 'Brokers', icon: Users },
        { name: 'Imobiliárias', href: 'RealEstateAgencies', icon: Building2 },
      ],
    },
    {
      section: 'FINANCEIRO',
      id: 'financeiro',
      number: '3',
      highlight: true,
      items: [
        { name: 'Contas a Receber', href: 'Finance', icon: DollarSign, badge: 'finance' },
        {
          name: 'Inadimplência',
          href: 'InadimplenciaManager',
          icon: AlertTriangle,
          badge: 'finance',
          badgeVariant: 'danger',
        },
        { name: 'Comissões', href: 'Commissions', icon: DollarSign },
        { name: 'Documentos', href: 'Documents', icon: FileText },
      ],
    },
    {
      section: 'PÓS-VENDA',
      id: 'pos-venda',
      number: '4',
      items: [
        { name: 'Vistorias', href: 'Inspections', icon: ClipboardCheck, badge: 'inspections' },
        { name: 'Manutenções', href: 'AdminMaintenance', icon: Settings, badge: 'maintenance' },
      ],
    },
  ];

  if (tenantRole === 'admin') {
    baseNav.push({
      section: 'INVESTIMENTOS',
      id: 'investimentos',
      number: '5',
      items: [
        { name: 'Dashboard', href: 'InvestorDashboard', icon: LayoutDashboard },
        { name: 'Investidores', href: 'Investors', icon: Users },
        { name: 'Aportes', href: 'InvestmentContributions', icon: DollarSign },
        { name: 'Retornos', href: 'InvestmentReturns', icon: DollarSign },
      ],
    });
  }

  if (tenantRole === 'admin' || tenantRole === 'comercial' || tenantRole === 'administrativo') {
    const systemItems: NavItem[] = [{ name: 'Notificações', href: 'Notifications', icon: Bell }];

    if (tenantRole === 'admin') {
      systemItems.push(
        { name: 'Checkup Financeiro', href: 'FinanceCheckup', icon: Settings },
        { name: 'Checkup Distratos', href: 'DistratoCheckup', icon: Settings },
        { name: 'Sessões WhatsApp', href: 'WhatsAppSessions', icon: MessageCircle },
        { name: 'Configurações', href: 'Settings', icon: Settings }
      );
    }

    systemItems.push({ name: 'Templates', href: 'Templates', icon: Layers });

    baseNav.push({ section: 'SISTEMA', id: 'sistema', items: systemItems });
  }

  return baseNav;
}

/**
 * O original mapeia `currentPageName` -> id do accordion a expandir por
 * padrão, mas usava ids desatualizados ("visao-geral", "operacao",
 * "comercial") que não batiam com nenhum id de `getNavigationStructure`
 * ("dashboard", "desenvolvimento", "vendas") — resquício de um refactor
 * anterior no app original, sem efeito visual (só o accordion não abria
 * sozinho). Corrigido aqui para os ids reais; não muda nada no layout.
 */
const ACCORDION_BY_PAGE: Record<string, string> = {
  Dashboard: 'dashboard',
  Terrains: 'desenvolvimento',
  Projects: 'desenvolvimento',
  Units: 'desenvolvimento',
  CRM: 'vendas',
  Clients: 'vendas',
  Brokers: 'vendas',
  RealEstateAgencies: 'vendas',
  Finance: 'financeiro',
  InadimplenciaManager: 'financeiro',
  Commissions: 'financeiro',
  Documents: 'financeiro',
  Inspections: 'pos-venda',
  AdminMaintenance: 'pos-venda',
  InvestorDashboard: 'investimentos',
  Investors: 'investimentos',
  InvestmentContributions: 'investimentos',
  InvestmentReturns: 'investimentos',
  Templates: 'sistema',
  FinanceCheckup: 'sistema',
  DistratoCheckup: 'sistema',
  WhatsAppSessions: 'sistema',
  Settings: 'sistema',
  Notifications: 'sistema',
};

export function getDefaultExpandedAccordion(currentPageName: string): string {
  return ACCORDION_BY_PAGE[currentPageName] ?? '';
}

/** Rotas liberadas para o perfil "investidor" — usado no redirect de acesso. */
export const INVESTOR_ALLOWED_PAGES = [
  'InvestorDashboard',
  'InvestorProjects',
  'InvestorContributions',
  'InvestorReturns',
];

/** Rotas liberadas para o perfil "cliente" — usado no redirect de acesso. */
export const CLIENT_ALLOWED_PAGES = ['ClientUnit', 'ClientFinance', 'ClientMaintenance'];

/**
 * Todos os "nomes de página" referenciados pela navegação, para qualquer
 * perfil — usado por `AppRoutes` para gerar as rotas "em construção"
 * programaticamente (uma por página ainda não implementada), sem
 * hardcodar cada uma à mão.
 */
/**
 * Rótulo (e página-pai, para breadcrumbs) de cada página conhecida pela
 * navegação — fonte única usada por `Breadcrumbs` e por `ComingSoonPage`,
 * para não duplicar texto em português em dois lugares.
 *
 * O original tinha uma tabela de pai/filho maior (incluindo páginas de
 * detalhe como "ProjectDetail", que ainda não existem aqui). Como nenhuma
 * dessas sub-rotas foi criada nesta etapa, todo item tem "Dashboard" como
 * pai por padrão — quando páginas de detalhe forem construídas, adicionar
 * o par aqui.
 */
export interface PageLabelEntry {
  label: string;
  parent: string | null;
}

export const PAGE_LABELS: Record<string, PageLabelEntry> = {
  Dashboard: { label: 'Dashboard', parent: null },
  Terrains: { label: 'Terrenos', parent: 'Dashboard' },
  Projects: { label: 'Projetos', parent: 'Dashboard' },
  Units: { label: 'Unidades', parent: 'Dashboard' },
  CRM: { label: 'CRM', parent: 'Dashboard' },
  Clients: { label: 'Clientes', parent: 'Dashboard' },
  Brokers: { label: 'Corretores', parent: 'Dashboard' },
  RealEstateAgencies: { label: 'Imobiliárias', parent: 'Dashboard' },
  Finance: { label: 'Financeiro', parent: 'Dashboard' },
  InadimplenciaManager: { label: 'Inadimplência', parent: 'Dashboard' },
  Commissions: { label: 'Comissões', parent: 'Dashboard' },
  Documents: { label: 'Documentos', parent: 'Dashboard' },
  Inspections: { label: 'Vistorias', parent: 'Dashboard' },
  AdminMaintenance: { label: 'Manutenções', parent: 'Dashboard' },
  InvestorDashboard: { label: 'Dashboard Investidor', parent: 'Dashboard' },
  Investors: { label: 'Investidores', parent: 'Dashboard' },
  InvestmentContributions: { label: 'Aportes', parent: 'Dashboard' },
  InvestmentReturns: { label: 'Retornos', parent: 'Dashboard' },
  Templates: { label: 'Templates', parent: 'Dashboard' },
  Settings: { label: 'Configurações', parent: 'Dashboard' },
  FinanceCheckup: { label: 'Checkup Financeiro', parent: 'Dashboard' },
  DistratoCheckup: { label: 'Checkup Distratos', parent: 'Dashboard' },
  WhatsAppSessions: { label: 'Sessões WhatsApp', parent: 'Dashboard' },
  Notifications: { label: 'Notificações', parent: 'Dashboard' },
  InvestorProjects: { label: 'Meus Projetos', parent: 'InvestorDashboard' },
  InvestorContributions: { label: 'Meus Aportes', parent: 'InvestorDashboard' },
  InvestorReturns: { label: 'Meus Retornos', parent: 'InvestorDashboard' },
  ClientUnit: { label: 'Minha Unidade', parent: null },
  ClientFinance: { label: 'Financeiro', parent: 'ClientUnit' },
  ClientMaintenance: { label: 'Manutenções', parent: 'ClientUnit' },
};

export function getAllNavPageNames(): string[] {
  const roles: TenantRole[] = ['admin', 'comercial', 'administrativo', 'cliente', 'investidor'];
  const names = new Set<string>();

  for (const role of roles) {
    for (const section of getNavigationStructure(role)) {
      for (const item of section.items) {
        names.add(item.href);
      }
    }
  }

  return Array.from(names);
}
