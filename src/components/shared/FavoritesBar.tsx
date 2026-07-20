import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Star, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { pageUrl } from '@/lib/page-url';

interface FavoritePage {
  name: string;
  route: string;
  icon: string;
}

const AVAILABLE_PAGES: FavoritePage[] = [
  { name: 'Dashboard', route: 'Dashboard', icon: '📊' },
  { name: 'Terrenos', route: 'Terrains', icon: '🏞️' },
  { name: 'Projetos', route: 'Projects', icon: '🏗️' },
  { name: 'Unidades', route: 'Units', icon: '🏠' },
  { name: 'CRM', route: 'CRM', icon: '💼' },
  { name: 'Clientes', route: 'Clients', icon: '👤' },
  { name: 'Corretores', route: 'Brokers', icon: '👔' },
  { name: 'Financeiro', route: 'Finance', icon: '💰' },
  { name: 'Inadimplência', route: 'InadimplenciaManager', icon: '⚠️' },
  { name: 'Comissões', route: 'Commissions', icon: '💵' },
  { name: 'Documentos', route: 'Documents', icon: '📄' },
  { name: 'Vistorias', route: 'Inspections', icon: '📋' },
  { name: 'Manutenções', route: 'AdminMaintenance', icon: '🔧' },
];

const STORAGE_KEY = 'vivlar_favorites';

/**
 * Baseado 100% em localStorage no original — nenhuma entidade do banco
 * envolvida, então portado com a lógica real, sem adaptação.
 */
export function FavoritesBar() {
  const [favorites, setFavorites] = useState<FavoritePage[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch {
        setFavorites([]);
      }
    } else {
      setFavorites([
        { name: 'CRM', route: 'CRM', icon: '💼' },
        { name: 'Financeiro', route: 'Finance', icon: '💰' },
      ]);
    }
  }, []);

  const saveFavorites = (newFavorites: FavoritePage[]) => {
    setFavorites(newFavorites);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
  };

  const addFavorite = (page: FavoritePage) => {
    if (favorites.length >= 5) return;
    if (!favorites.find((f) => f.route === page.route)) {
      saveFavorites([...favorites, page]);
    }
    setIsOpen(false);
  };

  const removeFavorite = (route: string) => {
    saveFavorites(favorites.filter((f) => f.route !== route));
  };

  const availableToAdd = AVAILABLE_PAGES.filter((page) => !favorites.find((f) => f.route === page.route));

  if (favorites.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Favoritos</span>
          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
        </div>

        <div className="flex flex-wrap gap-1">
          {favorites.map((fav) => (
            <Tooltip key={fav.route}>
              <TooltipTrigger asChild>
                <div className="relative group">
                  <Button variant="ghost" size="sm" className="h-8 px-2 pr-6" asChild>
                    <Link to={pageUrl(fav.route)}>
                      <span className="mr-1">{fav.icon}</span>
                      <span className="text-xs">{fav.name}</span>
                    </Link>
                  </Button>
                  <button
                    onClick={() => removeFavorite(fav.route)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ir para {fav.name}</p>
              </TooltipContent>
            </Tooltip>
          ))}

          {favorites.length < 5 && availableToAdd.length > 0 && (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
              <PopoverTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Adicionar favorito</p>
                  </TooltipContent>
                </Tooltip>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 px-2 py-1">Adicionar aos favoritos</p>
                  {availableToAdd.map((page) => (
                    <button
                      key={page.route}
                      onClick={() => addFavorite(page)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors"
                    >
                      <span>{page.icon}</span>
                      <span>{page.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {favorites.length >= 5 && <p className="text-xs text-slate-400 mt-1">Máximo de 5 favoritos</p>}
      </div>
    </TooltipProvider>
  );
}
