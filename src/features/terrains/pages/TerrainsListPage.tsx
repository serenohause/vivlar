import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Edit2, Eye, MapPin, Plus, Trash2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { TerrainEditDialog } from '@/features/terrains/components/TerrainEditDialog';
import { TerrainForm } from '@/features/terrains/components/TerrainForm';
import { TerrainStatusBadge } from '@/features/terrains/components/TerrainStatusBadge';
import { formatCurrency, TERRAIN_STATUS_OPTIONS } from '@/features/terrains/constants';
import { useCreateTerrain, useSoftDeleteTerrain, useTerrains } from '@/features/terrains/hooks';
import type { TerrainMutationPayload } from '@/features/terrains/schemas';
import type { Terrain, TerrainStatus } from '@/features/terrains/types';
import { pageUrl } from '@/lib/page-url';

type LocationFilter = 'all' | 'with' | 'without';

/**
 * Tradução de `original-project/src/pages/Terrains.jsx`, sem o toggle
 * Lista/Mapa (`TerrainSimpleMapView`, Leaflet — fora de escopo combinado
 * com o usuário): a lista é a única visão.
 */
export function TerrainsListPage() {
  const { data: terrains, isLoading, isError, refetch } = useTerrains();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TerrainStatus | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTerrain, setEditingTerrain] = useState<Terrain | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Terrain | null>(null);

  const createTerrain = useCreateTerrain();
  const deleteTerrain = useSoftDeleteTerrain();

  const all = terrains ?? [];

  const filteredTerrains = all.filter((terrain) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      terrain.code?.toLowerCase().includes(term) ||
      terrain.name?.toLowerCase().includes(term) ||
      terrain.city?.toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'all' || terrain.status === statusFilter;

    const matchesLocation =
      locationFilter === 'all' ||
      (locationFilter === 'with' && terrain.latitude != null && terrain.longitude != null) ||
      (locationFilter === 'without' && (terrain.latitude == null || terrain.longitude == null));

    return matchesSearch && matchesStatus && matchesLocation;
  });

  const totalTerrains = all.length;
  const emProspeccao = all.filter((t) => t.status === 'em_prospeccao').length;
  const emNegociacao = all.filter((t) => t.status === 'em_negociacao').length;
  const adquiridos = all.filter((t) => t.status === 'adquirido').length;
  const transformados = all.filter((t) => t.status === 'transformado_projeto').length;
  const descartados = all.filter((t) => t.status === 'descartado').length;

  function handleCreateSubmit(data: TerrainMutationPayload) {
    createTerrain.mutate(data, {
      onSuccess: () => {
        toast.success('Terreno criado com sucesso!');
        setShowCreateDialog(false);
      },
      onError: () => {
        toast.error('Erro ao criar terreno.');
      },
    });
  }

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    deleteTerrain.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Terreno excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Erro ao excluir terreno.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Terrenos"
        subtitle="Gestão de terrenos e pré-projetos"
        actions={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="brand">
                <Plus className="mr-2 h-4 w-4" />
                Novo Terreno
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Terreno</DialogTitle>
              </DialogHeader>
              <TerrainForm
                onSubmit={handleCreateSubmit}
                isSubmitting={createTerrain.isPending}
                submitLabel="Criar Terreno"
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-brand">{totalTerrains}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Prospecção</p>
            <p className="text-2xl font-bold text-blue-600">{emProspeccao}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Negociação</p>
            <p className="text-2xl font-bold text-amber-600">{emNegociacao}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Adquiridos</p>
            <p className="text-2xl font-bold text-green-600">{adquiridos}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">→ Projetos</p>
            <p className="text-2xl font-bold text-purple-600">{transformados}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-xs text-muted-foreground">Descartados</p>
            <p className="text-2xl font-bold text-red-600">{descartados}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Input
          placeholder="Buscar por código, nome ou cidade..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-80"
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TerrainStatus | 'all')}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {TERRAIN_STATUS_OPTIONS.map(([value, config]) => (
              <SelectItem key={value} value={value}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={(value) => setLocationFilter(value as LocationFilter)}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="with">Com Localização</SelectItem>
            <SelectItem value="without">Sem Localização</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Estados: carregando / erro / vazio / lista */}
      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredTerrains.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nenhum terreno encontrado"
          description="Crie um novo terreno para começar a gestão de pré-projetos"
        />
      ) : (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cidade/Estado</TableHead>
                  <TableHead>Área (m²)</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTerrains.map((terrain) => (
                  <TableRow key={terrain.id}>
                    <TableCell className="font-medium">{terrain.code}</TableCell>
                    <TableCell>{terrain.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {terrain.city}, {terrain.state}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{terrain.area_m2?.toLocaleString('pt-BR')}</TableCell>
                    <TableCell>
                      {terrain.latitude != null && terrain.longitude != null ? (
                        <Badge className="bg-green-100 text-green-800">
                          <MapPin className="mr-1 h-3 w-3" />
                          Definida
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não definida
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <TerrainStatusBadge status={terrain.status} />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <DollarSign className="h-4 w-4" />
                        {formatCurrency(terrain.valor_aquisicao)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`${pageUrl('Terrains')}/${terrain.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {terrain.status !== 'transformado_projeto' && (
                          <Button variant="ghost" size="sm" onClick={() => setEditingTerrain(terrain)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(terrain)}
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

      {editingTerrain && (
        <TerrainEditDialog
          terrain={editingTerrain}
          open={Boolean(editingTerrain)}
          onOpenChange={(open) => !open && setEditingTerrain(null)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Terreno</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &quot;{deleteConfirm?.name}&quot;? Esta ação não pode ser desfeita.
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
