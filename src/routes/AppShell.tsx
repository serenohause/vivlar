import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Settings, X } from 'lucide-react';
import { Toaster } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BottomNavigation } from '@/components/shared/BottomNavigation';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { FavoritesBar } from '@/components/shared/FavoritesBar';
import { MobileMenuFAB } from '@/components/shared/MobileMenuFAB';
import { NavigationBadge } from '@/components/shared/NavigationBadge';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { PageTransition } from '@/components/shared/PageTransition';
import { SidebarSearch } from '@/components/shared/SidebarSearch';
import { useSwipeGesture } from '@/components/shared/useSwipeGesture';
import { useAuth } from '@/features/auth/AuthContext';
import type { TenantRole } from '@/features/auth/types';
import {
  CLIENT_ALLOWED_PAGES,
  INVESTOR_ALLOWED_PAGES,
  getAllNavPageNames,
  getDefaultExpandedAccordion,
  getNavigationStructure,
} from '@/features/dashboard/navigation';
import { useNavigationBadges } from '@/features/dashboard/hooks';
import { pageUrl } from '@/lib/page-url';
import { cn } from '@/lib/utils';

// Mapa reverso "/rota" -> "NomeDaPágina", derivado da mesma lista de
// navegação usada para gerar as rotas em `AppRoutes` — assim o shell sabe
// qual item destacar/expandir sem duplicar a lista de páginas.
const PAGE_NAME_BY_PATH: Record<string, string> = Object.fromEntries(
  ['Dashboard', ...getAllNavPageNames()].map((name) => [pageUrl(name), name])
);

/**
 * Lacuna conhecida: o perfil de usuário do Supabase Auth ainda não tem
 * nome próprio cadastrado (só `user.email`) — perfil com nome é feature
 * futura. As iniciais do avatar usam a parte antes do "@" do e-mail.
 */
function getInitials(email: string | null | undefined): string {
  if (!email) return 'U';
  const localPart = email.split('@')[0] ?? '';
  const segments = localPart.split(/[._-]+/).filter(Boolean);
  if (segments.length === 0) return 'U';
  return segments
    .map((segment) => segment[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function roleLabel(tenantRole: TenantRole | null): string {
  switch (tenantRole) {
    case 'admin':
      return 'Administrador';
    case 'comercial':
      return 'Comercial';
    case 'administrativo':
      return 'Administrativo';
    case 'cliente':
      return 'Cliente';
    case 'investidor':
      return 'Investidor';
    default:
      return 'Usuário';
  }
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedAccordion, setExpandedAccordion] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenantRole, signOut } = useAuth();
  const badges = useNavigationBadges();

  const currentPageName = PAGE_NAME_BY_PATH[location.pathname] ?? '';

  useEffect(() => {
    setExpandedAccordion(getDefaultExpandedAccordion(currentPageName));
  }, [currentPageName]);

  // Redireciona investidor/cliente para fora de rotas que não são deles —
  // equivalente ao original, adaptado de `user.app_profile` para `tenantRole`.
  useEffect(() => {
    if (!currentPageName) return;

    if (tenantRole === 'investidor' && !INVESTOR_ALLOWED_PAGES.includes(currentPageName)) {
      navigate(pageUrl('InvestorDashboard'), { replace: true });
    } else if (tenantRole === 'cliente' && !CLIENT_ALLOWED_PAGES.includes(currentPageName)) {
      navigate(pageUrl('ClientUnit'), { replace: true });
    }
  }, [tenantRole, currentPageName, navigate]);

  const isActive = (href: string) => currentPageName === href;

  // Swipe gesture para abrir/fechar menu
  useSwipeGesture({
    enabled: true,
    isOpen: sidebarOpen,
    onSwipeRight: () => setSidebarOpen(true),
    onSwipeLeft: () => setSidebarOpen(false),
  });

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--color-background)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          },
          className: 'font-sans',
        }}
        richColors
      />

      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <Link to={pageUrl('Dashboard')} className="flex items-center justify-center w-full">
                <h1 className="text-2xl font-bold text-brand dark:text-brand-dark">Vivlar</h1>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden absolute right-4 top-4"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Busca Rápida */}
            <SidebarSearch />

            {/* Favoritos */}
            <FavoritesBar />

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 overflow-y-auto">
              <Accordion type="single" value={expandedAccordion} onValueChange={setExpandedAccordion} collapsible>
                {getNavigationStructure(tenantRole).map((section) => (
                  <AccordionItem
                    key={section.id}
                    value={section.id}
                    className={cn('border-none', section.highlight && 'bg-green-50 dark:bg-green-950/20 rounded-lg my-1')}
                  >
                    <AccordionTrigger className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:no-underline hover:text-slate-600 dark:hover:text-slate-300 [&[data-state=open]]:text-slate-900 dark:[&[data-state=open]]:text-slate-100">
                      <div className="flex items-center gap-2">
                        {section.number && (
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand dark:bg-brand-dark text-white text-xs font-bold">
                            {section.number}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 transition-transform" />
                        {section.section}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-1">
                      <div className="space-y-1 pl-2">
                        {section.items.map((item) => {
                          const active = isActive(item.href);
                          const badgeCount = item.badge ? badges[item.badge] : 0;

                          return (
                            <Link
                              key={item.name}
                              to={pageUrl(item.href)}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                                active
                                  ? 'bg-brand text-white shadow-lg shadow-brand/20 dark:bg-brand-dark'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              )}
                            >
                              <item.icon className={cn('w-5 h-5 flex-shrink-0', active ? 'text-white' : 'text-slate-400')} />
                              <span className="flex-1">{item.name}</span>
                              {badgeCount > 0 && <NavigationBadge count={badgeCount} variant={item.badgeVariant ?? 'default'} />}
                            </Link>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </nav>

            {/* User Section */}
            {user && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <Avatar className="w-10 h-10 bg-brand">
                        <AvatarFallback className="bg-brand text-brand-foreground text-sm">
                          {getInitials(user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.email}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{roleLabel(tenantRole)}</p>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {tenantRole !== 'investidor' && (
                      <DropdownMenuItem asChild>
                        <Link to={pageUrl('Settings')} className="cursor-pointer">
                          <Settings className="w-4 h-4 mr-2" />
                          Configurações
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void signOut()} className="text-red-600 cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="lg:pl-72 pb-20 lg:pb-0">
          {/* Mobile spacing for fixed header */}
          <div className="lg:hidden" style={{ height: 'calc(env(safe-area-inset-top, 20px) + 56px)' }} />

          {/* Mobile header - Simplified without menu button */}
          <header
            className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 lg:hidden"
            style={{
              paddingTop: 'env(safe-area-inset-top, 20px)',
              paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
              paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
            }}
          >
            <div className="flex items-center justify-between h-14 px-4">
              <h1 className="text-lg font-bold text-brand dark:text-brand-dark">Vivlar</h1>
              <NotificationBell />
            </div>
          </header>

          {/* Page content */}
          <main className="p-4 md:p-8">
            <Breadcrumbs currentPage={currentPageName} />
            <PageTransition pageKey={currentPageName}>
              <Outlet />
            </PageTransition>
          </main>
        </div>

        {/* Mobile Menu FAB */}
        <MobileMenuFAB onClick={() => setSidebarOpen(true)} />

        {/* Bottom Navigation (Mobile Only) */}
        <BottomNavigation currentPageName={currentPageName} />
      </div>
    </>
  );
}
