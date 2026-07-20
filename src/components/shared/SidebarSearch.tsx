import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { pageUrl } from '@/lib/page-url';
import { cn } from '@/lib/utils';

/**
 * Lista estática de páginas buscáveis — igual ao original: não é uma busca
 * em dados (nenhuma entidade é consultada), é um filtro local sobre esta
 * lista fixa. Por isso continua funcional sem depender de nenhuma tabela
 * do Supabase.
 */
const SEARCHABLE_PAGES = [
  { name: 'Dashboard', keywords: ['dashboard', 'visão', 'geral', 'home'], icon: '📊', route: 'Dashboard' },
  { name: 'Terrenos', keywords: ['terreno', 'land', 'lote'], icon: '🏞️', route: 'Terrains' },
  { name: 'Projetos', keywords: ['projeto', 'project', 'empreendimento'], icon: '🏗️', route: 'Projects' },
  { name: 'Unidades', keywords: ['unidade', 'unit', 'imovel', 'casa'], icon: '🏠', route: 'Units' },
  { name: 'CRM', keywords: ['crm', 'funil', 'vendas', 'pipeline', 'deals'], icon: '💼', route: 'CRM' },
  { name: 'Clientes', keywords: ['cliente', 'client', 'comprador'], icon: '👤', route: 'Clients' },
  { name: 'Corretores', keywords: ['corretor', 'broker', 'vendedor'], icon: '👔', route: 'Brokers' },
  { name: 'Financeiro', keywords: ['financeiro', 'finance', 'parcela', 'pagamento'], icon: '💰', route: 'Finance' },
  { name: 'Inadimplência', keywords: ['inadimplencia', 'atraso', 'overdue'], icon: '⚠️', route: 'InadimplenciaManager' },
  { name: 'Comissões', keywords: ['comissao', 'commission'], icon: '💵', route: 'Commissions' },
  { name: 'Documentos', keywords: ['documento', 'document', 'arquivo'], icon: '📄', route: 'Documents' },
  { name: 'Vistorias', keywords: ['vistoria', 'inspection'], icon: '📋', route: 'Inspections' },
  { name: 'Manutenções', keywords: ['manutencao', 'maintenance', 'reparo'], icon: '🔧', route: 'AdminMaintenance' },
  { name: 'Investidores', keywords: ['investidor', 'investor'], icon: '📈', route: 'Investors' },
  { name: 'Aportes', keywords: ['aporte', 'contribution'], icon: '💰', route: 'InvestmentContributions' },
  { name: 'Retornos', keywords: ['retorno', 'return', 'lucro'], icon: '💸', route: 'InvestmentReturns' },
  { name: 'Templates', keywords: ['template', 'modelo'], icon: '📋', route: 'Templates' },
  { name: 'Configurações', keywords: ['config', 'settings', 'configuracoes'], icon: '⚙️', route: 'Settings' },
];

export function SidebarSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Atalho Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const filteredPages = SEARCHABLE_PAGES.filter((page) => {
    const searchLower = search.toLowerCase();
    return page.name.toLowerCase().includes(searchLower) || page.keywords.some((k) => k.includes(searchLower));
  });

  const handleSelect = (route: string) => {
    navigate(pageUrl(route));
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <div className="relative mb-3 px-3 cursor-pointer" onClick={() => setOpen(true)}>
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Buscar... (⌘K)" className="pl-9 bg-slate-50 dark:bg-slate-800 border-0 cursor-pointer" readOnly />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-2xl">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Digite para buscar páginas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 border-0 focus-visible:ring-0"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {filteredPages.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Nenhum resultado encontrado</div>
            ) : (
              <div className="space-y-1">
                {filteredPages.map((page) => (
                  <button
                    key={page.route}
                    onClick={() => handleSelect(page.route)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
                      'hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
                      'text-left'
                    )}
                  >
                    <span className="text-xl">{page.icon}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{page.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
