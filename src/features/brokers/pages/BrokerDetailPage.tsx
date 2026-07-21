import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, Building2, CheckCircle2, Edit2, Mail, Phone, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { BrokerEditDialog } from '@/features/brokers/components/BrokerEditDialog';
import { formatCommissionRate, formatCPF } from '@/features/brokers/constants';
import { useBroker, useBrokerDealsCount, useSoftDeleteBroker } from '@/features/brokers/hooks';
import { useRealEstateAgencies } from '@/features/real-estate-agencies/hooks';
import { pageUrl } from '@/lib/page-url';

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Não existe `BrokerDetail` no original — `Brokers.jsx` é só lista + dialog.
 * Página de detalhe construída seguindo a mesma linguagem visual do resto
 * do sistema (`ClientDetailPage`), necessária para a rota `/brokers/:id`
 * (padrão de navegação já usado em todo o resto do app). A seção
 * "Negociações" mostra só uma contagem simples via `useBrokerDealsCount`
 * (deals filtrados por `broker_id`) — sem lista/preview e sem link para
 * detalhe de negócio, já que o Kanban de Deals ainda não tem UI própria
 * (próxima tarefa do CRM).
 */
export function BrokerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: broker, isLoading, isError, refetch } = useBroker(id);
  const { data: dealsCount } = useBrokerDealsCount(id);
  const { data: agencies } = useRealEstateAgencies();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteBroker = useSoftDeleteBroker();

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!broker) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Corretor não encontrado</p>
        <Button onClick={() => navigate(pageUrl('Brokers'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const agency = agencies?.find((a) => a.id === broker.real_estate_agency_id);

  function handleDeleteConfirm() {
    deleteBroker.mutate(broker!.id, {
      onSuccess: () => {
        toast.success('Corretor excluído com sucesso!');
        navigate(pageUrl('Brokers'));
      },
      onError: () => {
        toast.error('Erro ao excluir corretor.');
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={broker.name}
        subtitle="Detalhes do corretor"
        backTo="Brokers"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-6 text-center">
              <Avatar className="mx-auto mb-4 h-20 w-20">
                <AvatarFallback className="bg-brand text-2xl text-brand-foreground">{getInitials(broker.name)}</AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-bold text-foreground">{broker.name}</h2>
              <p className="text-muted-foreground">{formatCPF(broker.cpf)}</p>
            </div>

            <div className="mb-4 flex items-center justify-center gap-2">
              {broker.is_active ? (
                <Badge className="bg-green-600 text-white hover:bg-green-600/90">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Ativo
                </Badge>
              ) : (
                <Badge className="bg-muted-foreground text-white hover:bg-muted-foreground/90">
                  <XCircle className="mr-1 h-3 w-3" />
                  Inativo
                </Badge>
              )}
              {broker.type === 'imobiliaria' && agency ? (
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  <Building2 className="mr-1 h-3 w-3" />
                  {agency.name}
                </Badge>
              ) : (
                <Badge variant="outline">Autônomo</Badge>
              )}
            </div>

            <div className="space-y-4">
              {broker.phone && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium">{broker.phone}</p>
                  </div>
                </div>
              )}
              {broker.email && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="font-medium">{broker.email}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 text-xs text-muted-foreground">
              Cadastrado em {new Date(broker.created_at).toLocaleDateString('pt-BR')}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardContent className="grid grid-cols-2 gap-4 pt-6 md:grid-cols-3">
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 text-xs text-muted-foreground">Taxa de Comissão</p>
                <p className="text-xl font-bold text-foreground">{formatCommissionRate(broker.commission_rate)}</p>
              </div>
              {broker.type === 'imobiliaria' && (
                <div className="rounded-lg bg-muted p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Split do Corretor</p>
                  <p className="text-xl font-bold text-foreground">{broker.commission_split}%</p>
                </div>
              )}
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  Negociações
                </p>
                <p className="text-xl font-bold text-foreground">{dealsCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>

          {broker.type === 'imobiliaria' && agency && (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <p className="mb-3 text-sm font-semibold">Imobiliária</p>
                <Link
                  to={`${pageUrl('RealEstateAgencies')}/${agency.id}`}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{agency.name}</p>
                      {agency.phone && <p className="text-sm text-muted-foreground">{agency.phone}</p>}
                    </div>
                  </div>
                  <Badge variant="outline">{agency.commission_percentage}% comissão</Badge>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <BrokerEditDialog broker={broker} open={showEditDialog} onOpenChange={setShowEditDialog} />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Corretor?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir este corretor?</p>
              <p className="font-medium text-foreground">{broker.name}</p>
              <p className="text-sm text-muted-foreground">
                Esta ação remove o corretor do sistema, mas mantém o histórico nas negociações existentes.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
