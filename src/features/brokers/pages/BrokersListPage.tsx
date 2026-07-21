import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Edit2, Eye, Plus, Trash2, UserCog, XCircle } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { BrokerEditDialog } from '@/features/brokers/components/BrokerEditDialog';
import { formatCommissionRate } from '@/features/brokers/constants';
import { useBrokers, useSoftDeleteBroker } from '@/features/brokers/hooks';
import type { Broker } from '@/features/brokers/types';
import { useRealEstateAgencies } from '@/features/real-estate-agencies/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/Brokers.jsx`: cadastro/dialog
 * viram página própria (`/brokers/novo`, mesma convenção já usada no resto
 * do sistema), edição continua em dialog (`BrokerEditDialog`). Sem toggle
 * de admin para excluir (RLS já restringe select/insert/update a
 * admin/comercial/administrativo do tenant), mesmo critério de
 * `ClientsListPage`.
 */
export function BrokersListPage() {
  const { data: brokers, isLoading, isError, refetch } = useBrokers();
  const { data: agencies } = useRealEstateAgencies();

  const [search, setSearch] = useState('');
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Broker | null>(null);

  const deleteBroker = useSoftDeleteBroker();

  const all = brokers ?? [];
  const allAgencies = agencies ?? [];

  function getAgencyName(agencyId: string | null): string | null {
    if (!agencyId) return null;
    return allAgencies.find((a) => a.id === agencyId)?.name ?? null;
  }

  const filteredBrokers = all.filter((broker) => broker.name?.toLowerCase().includes(search.toLowerCase()));

  const totalBrokers = all.length;
  const activeBrokers = all.filter((b) => b.is_active).length;
  const inactiveBrokers = all.length - activeBrokers;

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    deleteBroker.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Corretor excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Erro ao excluir corretor.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Corretores"
        subtitle="Gestão de corretores e comissões"
        actions={
          <Link to={`${pageUrl('Brokers')}/novo`}>
            <Button variant="brand">
              <Plus className="mr-2 h-4 w-4" />
              Novo Corretor
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{totalBrokers}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold text-green-600">{activeBrokers}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Inativos</p>
            <p className="text-2xl font-bold text-muted-foreground">{inactiveBrokers}</p>
          </CardContent>
        </Card>
      </div>

      <Input
        placeholder="Buscar corretor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:max-w-md"
      />

      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredBrokers.length === 0 ? (
        <EmptyState icon={UserCog} title="Nenhum corretor encontrado" description="Comece cadastrando seu primeiro corretor" />
      ) : (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrokers.map((broker) => {
                  const agencyName = getAgencyName(broker.real_estate_agency_id);

                  return (
                    <TableRow key={broker.id}>
                      <TableCell className="font-medium">{broker.name}</TableCell>
                      <TableCell>
                        {broker.type === 'imobiliaria' && agencyName ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-blue-600" />
                            <div>
                              <p className="text-sm font-medium">{agencyName}</p>
                              <p className="text-xs text-muted-foreground">{broker.commission_split}% split</p>
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline">Autônomo</Badge>
                        )}
                      </TableCell>
                      <TableCell>{broker.phone || '—'}</TableCell>
                      <TableCell>{broker.email || '—'}</TableCell>
                      <TableCell>{formatCommissionRate(broker.commission_rate)}</TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`${pageUrl('Brokers')}/${broker.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => setEditingBroker(broker)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(broker)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {editingBroker && (
        <BrokerEditDialog broker={editingBroker} open={Boolean(editingBroker)} onOpenChange={(open) => !open && setEditingBroker(null)} />
      )}

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Corretor?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir este corretor?</p>
              <p className="font-medium text-foreground">{deleteConfirm?.name}</p>
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
