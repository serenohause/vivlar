import { Bell } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/**
 * No original busca notificações reais (`base44.entities.Notification`,
 * com refetch a cada 30s). A tabela de notificações ainda não existe no
 * Supabase deste projeto, então o sino fica visualmente idêntico, sempre
 * sem contagem e com estado vazio ao abrir — sem tentar buscar um dado que
 * não existe. Religar quando o módulo de notificações for construído.
 */
export function NotificationBell() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-slate-100 dark:hover:bg-slate-800">
          <Bell className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[500px] overflow-y-auto p-0">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 z-10">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Notificações</h3>
        </div>

        <div className="px-4 py-8 text-center text-slate-500">
          <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Nenhuma notificação por enquanto</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
