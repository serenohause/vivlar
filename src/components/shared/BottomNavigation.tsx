import { Link } from 'react-router-dom';
import {
  Briefcase,
  DollarSign,
  Building2,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/AuthContext';
import { useNavigationBadges, type NavigationBadges } from '@/features/dashboard/hooks';
import { cn } from '@/lib/utils';
import { pageUrl } from '@/lib/page-url';

interface BottomNavItem {
  name: string;
  icon: LucideIcon;
  path: string;
  badge?: keyof NavigationBadges;
}

const NAV_ITEMS: { admin: BottomNavItem[]; cliente: BottomNavItem[] } = {
  admin: [
    { name: 'Dashboard', icon: LayoutDashboard, path: 'Dashboard' },
    { name: 'CRM', icon: Briefcase, path: 'CRM', badge: 'crm' },
    { name: 'Financeiro', icon: DollarSign, path: 'Finance', badge: 'finance' },
    { name: 'Projetos', icon: Building2, path: 'Projects' },
  ],
  cliente: [
    { name: 'Minha Unidade', icon: Home, path: 'ClientUnit' },
    { name: 'Financeiro', icon: DollarSign, path: 'ClientFinance' },
    { name: 'Manutenções', icon: Wrench, path: 'ClientMaintenance' },
  ],
};

interface BottomNavigationProps {
  currentPageName: string;
}

export function BottomNavigation({ currentPageName }: BottomNavigationProps) {
  const { user, tenantRole, signOut } = useAuth();
  const badges = useNavigationBadges();

  // Lacuna conhecida: ainda não existe nome próprio cadastrado (só e-mail
  // do Supabase Auth) — ver comentário equivalente em AppShell.
  const navItems = tenantRole === 'cliente' ? NAV_ITEMS.cliente : NAV_ITEMS.admin;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPageName === item.path;
          const badgeCount = item.badge ? badges[item.badge] : 0;

          return (
            <Link
              key={item.path}
              to={pageUrl(item.path)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative',
                isActive ? 'text-brand dark:text-brand-dark' : 'text-slate-500 dark:text-slate-400'
              )}
            >
              <div className="relative">
                <Icon className={cn('w-5 h-5', isActive && 'fill-current')} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          );
        })}

        {/* Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors hover:text-brand dark:hover:text-brand-dark',
                'text-slate-500 dark:text-slate-400'
              )}
            >
              <User className="w-5 h-5" />
              <span className="text-xs font-medium">Perfil</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {user && (
              <>
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            {tenantRole !== 'cliente' && (
              <>
                <DropdownMenuItem asChild>
                  <Link to={pageUrl('Settings')} className="cursor-pointer">
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => void signOut()} className="text-red-600 cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
