import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit2, Eye, Plus, Trash2, Users } from 'lucide-react';
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
import { ClientEditDialog } from '@/features/clients/components/ClientEditDialog';
import { formatCPF } from '@/features/clients/constants';
import { useClients, useClientsDealsSummary, useSoftDeleteClient } from '@/features/clients/hooks';
import type { Client } from '@/features/clients/types';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/Clients.jsx`: cadastro/dialog
 * viram página própria (`ClientFormPage`, `/clients/novo` — mesma
 * convenção já usada em Terrenos/Projetos/Unidades), edição continua em
 * dialog (`ClientEditDialog`). Sem toggle de admin para excluir (RLS já
 * restringe select/insert/update a admin/comercial/administrativo do
 * tenant — não há um papel "não-admin" com acesso a esta tela para
 * diferenciar, então o botão de excluir fica disponível para quem chega
 * até aqui).
 */
export function ClientsListPage() {
  const { data: clients, isLoading, isError, refetch } = useClients();
  const { data: dealsSummary } = useClientsDealsSummary();
  const { data: units } = useUnits();

  const [search, setSearch] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null);

  const deleteClient = useSoftDeleteClient();

  const all = clients ?? [];
  const deals = dealsSummary ?? [];
  const allUnits = units ?? [];

  function getDealsCount(clientId: string): number {
    return deals.filter((d) => d.client_id === clientId).length;
  }

  function getClientUnit(clientId: string): string {
    const clientDeals = deals.filter((d) => d.client_id === clientId);
    if (clientDeals.length === 0) return '—';
    const deal = clientDeals[0];
    if (!deal.unit_id) return '—';
    const unit = allUnits.find((u) => u.id === deal.unit_id);
    return unit?.sku || '—';
  }

  const filteredClients = all.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.cpf?.includes(search) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(term)
    );
  });

  const totalClients = all.length;
  const withDeals = all.filter((c) => getDealsCount(c.id) > 0).length;
  const withoutDeals = all.length - withDeals;

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    deleteClient.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Cliente excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Erro ao excluir cliente.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Clientes"
        subtitle="Cadastro de compradores"
        actions={
          <Link to={`${pageUrl('Clients')}/novo`}>
            <Button variant="brand">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </Link>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{totalClients}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Com Negociações</p>
            <p className="text-2xl font-bold text-blue-600">{withDeals}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Sem Negociações</p>
            <p className="text-2xl font-bold text-muted-foreground">{withoutDeals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar por nome, CPF, telefone ou e-mail..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:max-w-md"
      />

      {/* Estados: carregando / erro / vazio / lista */}
      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description="Comece cadastrando seu primeiro cliente"
        />
      ) : (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Negociações</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{formatCPF(client.cpf)}</TableCell>
                    <TableCell>{client.phone || '—'}</TableCell>
                    <TableCell>{client.email || '—'}</TableCell>
                    <TableCell>{getClientUnit(client.id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        {getDealsCount(client.id)}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(client.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`${pageUrl('Clients')}/${client.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => setEditingClient(client)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(client)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {editingClient && (
        <ClientEditDialog
          client={editingClient}
          open={Boolean(editingClient)}
          onOpenChange={(open) => !open && setEditingClient(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cliente?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir este cliente?</p>
              <p className="font-medium text-foreground">{deleteConfirm?.name}</p>
              <p className="text-sm text-muted-foreground">
                Esta ação remove o cliente das listagens (exclusão lógica). As negociações existentes serão
                mantidas.
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
