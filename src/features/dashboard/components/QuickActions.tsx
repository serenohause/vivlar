import { Link } from 'react-router-dom';
import { DollarSign, FileText, Plus, Send, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { pageUrl } from '@/lib/page-url';

const QUICK_ACTIONS = [
  { label: 'Novo Deal', icon: Plus, page: pageUrl('CRM'), colorClass: 'bg-blue-600 hover:bg-blue-700' },
  { label: 'Novo Cliente', icon: Users, page: pageUrl('Clients'), colorClass: 'bg-green-600 hover:bg-green-700' },
  { label: 'Cobrança', icon: DollarSign, page: pageUrl('InadimplenciaManager'), colorClass: 'bg-orange-600 hover:bg-orange-700' },
  { label: 'Documentos', icon: FileText, page: pageUrl('Documents'), colorClass: 'bg-purple-600 hover:bg-purple-700' },
] as const;

/**
 * Tradução 1:1 de `original-project/src/components/dashboard/QuickActions.jsx`
 * — 4 atalhos estáticos, sem query nenhuma (só navegação).
 */
export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Ações Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.label} to={action.page}>
              <Button className={`h-auto w-full flex-col gap-2 py-4 text-white ${action.colorClass}`}>
                <action.icon className="h-5 w-5" />
                <span className="text-sm">{action.label}</span>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
