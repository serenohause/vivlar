import { Draggable } from '@hello-pangea/dnd';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  MoreVertical,
  Phone,
  Trash2,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Broker } from '@/features/brokers/types';
import type { Client } from '@/features/clients/types';
import { DEAL_SALES_STAGE_LABELS, KANBAN_STAGES, formatCurrency } from '@/features/deals/constants';
import type { Deal, DealSalesStage } from '@/features/deals/types';
import type { Project } from '@/features/projects/types';
import type { Unit } from '@/features/units/types';
import { pageUrl } from '@/lib/page-url';

function getTimeElapsed(dateString: string): string {
  const created = new Date(dateString);
  const now = new Date();
  const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Hoje';
  if (days === 1) return '1 dia';
  if (days < 7) return `${days} dias`;
  if (days < 30) return `${Math.floor(days / 7)} semanas`;
  return `${Math.floor(days / 30)} meses`;
}

interface DealCardProps {
  deal: Deal;
  index: number;
  client: Client | undefined;
  project: Project | undefined;
  unit: Unit | undefined;
  broker: Broker | undefined;
  onMoveStage: (deal: Deal, stage: DealSalesStage) => void;
  onMarkLost: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onRegisterActivity: (deal: Deal) => void;
}

/**
 * Card arrastável de um negócio dentro de uma coluna do Kanban — tradução do
 * card de `original-project/src/pages/CRM.jsx` (dentro do `.map` de
 * `dealsByStage`). O menu "Mover para X"/"Marcar como Perdido" só aparece
 * fora dos estágios terminais (vendido/perdido/distratado), igual ao
 * original — arrastar entre colunas faz a mesma coisa (`onMoveStage`,
 * conectado a `useUpdateDealStage` na página).
 */
export function DealCard({ deal, index, client, project, unit, broker, onMoveStage, onMarkLost, onDelete, onRegisterActivity }: DealCardProps) {
  const isTerminal = deal.sales_stage === 'vendido' || deal.sales_stage === 'perdido' || deal.sales_stage === 'distratado';

  function handleQuickCall() {
    if (client?.phone) {
      window.open(`tel:${client.phone}`);
    } else {
      alert('Cliente não possui telefone cadastrado');
    }
  }

  function handleQuickWhatsApp() {
    if (client?.phone) {
      const phone = client.phone.replace(/\D/g, '');
      window.open(`https://wa.me/55${phone}`, '_blank');
    } else {
      alert('Cliente não possui telefone cadastrado');
    }
  }

  function handleQuickEmail() {
    if (client?.email) {
      window.open(`mailto:${client.email}`);
    } else {
      alert('Cliente não possui email cadastrado');
    }
  }

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`border-0 shadow-sm transition-all hover:shadow-md ${snapshot.isDragging ? 'shadow-lg' : ''}`}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10">
                  <User className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{client?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{project?.name ?? '—'}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`${pageUrl('CRM')}/${deal.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      Ver detalhes
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleQuickCall}>
                    <Phone className="mr-2 h-4 w-4" />
                    Ligar para cliente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleQuickWhatsApp}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Enviar WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleQuickEmail}>
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar Email
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRegisterActivity(deal)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Registrar atividade
                  </DropdownMenuItem>
                  {!isTerminal && (
                    <>
                      <DropdownMenuSeparator />
                      {KANBAN_STAGES.filter((stage) => stage !== deal.sales_stage).map((stage) => (
                        <DropdownMenuItem key={stage} onClick={() => onMoveStage(deal, stage)}>
                          Mover para {DEAL_SALES_STAGE_LABELS[stage]}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={() => onMarkLost(deal)} className="text-destructive">
                        Marcar como Perdido
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(deal)} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unidade</span>
                <span className="font-medium">{unit?.sku ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-semibold text-green-600">{formatCurrency(deal.expected_sale_value)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Corretor</span>
                <span className="text-xs">{broker?.name ?? '—'}</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 h-3 w-3" />
                {getTimeElapsed(deal.created_at)}
              </Badge>
              {deal.reserved_until && (
                <Badge variant="outline" className="border-amber-200 text-xs text-amber-600">
                  <Calendar className="mr-1 h-3 w-3" />
                  Até {new Date(deal.reserved_until).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </Draggable>
  );
}
