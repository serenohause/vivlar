import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Eye, Filter, Plus, Power, Search, Trash2 } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { TemplateFormDialog } from '@/features/inspection-templates/components/TemplateFormDialog';
import {
  useDuplicateInspectionTemplate,
  useInspectionTemplateItemCounts,
  useInspectionTemplates,
  useSoftDeleteInspectionTemplate,
  useToggleInspectionTemplateActive,
} from '@/features/inspection-templates/hooks';
import type { InspectionTemplate } from '@/features/inspection-templates/types';
import { pageUrl } from '@/lib/page-url';

type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * Tradução de `original-project/src/pages/Templates.jsx` — lista de
 * templates de checklist de vistoria, com busca/filtro de status, e ações
 * de linha (ver/duplicar/ativar-desativar/excluir). Sem a criação
 * automática de um "template padrão" quando não há nenhum ativo
 * (`createDefaultTemplate`/`useEffect` do original): seed automático de
 * dado de exemplo não é comportamento esperado de um produto multi-tenant
 * real — cada tenant cria seu primeiro template explicitamente pelo botão
 * "Novo Template".
 */
export function TemplatesListPage() {
  const { data: templates, isLoading, isError, refetch } = useInspectionTemplates();
  const { data: itemCounts } = useInspectionTemplateItemCounts();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<InspectionTemplate | null>(null);

  const duplicateTemplate = useDuplicateInspectionTemplate();
  const toggleActive = useToggleInspectionTemplateActive();
  const softDelete = useSoftDeleteInspectionTemplate();

  const allTemplates = templates ?? [];
  const counts = itemCounts ?? {};

  const filteredTemplates = allTemplates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? template.is_active : !template.is_active);
    return matchesSearch && matchesStatus;
  });

  function handleDuplicate(template: InspectionTemplate) {
    setDuplicatingId(template.id);
    duplicateTemplate.mutate(template.id, {
      onSuccess: () => toast.success('Template duplicado!'),
      onError: () => toast.error('Erro ao duplicar template.'),
      onSettled: () => setDuplicatingId(null),
    });
  }

  function handleToggleActive(template: InspectionTemplate) {
    toggleActive.mutate(
      { id: template.id, is_active: !template.is_active },
      {
        onSuccess: () => toast.success('Status atualizado!'),
        onError: () => toast.error('Erro ao atualizar status.'),
      }
    );
  }

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Template excluído!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir template.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates de Vistoria"
        subtitle="Gerencie checklists de vistoria"
        actions={
          <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Template
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {filteredTemplates.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Nenhum template encontrado"
          description={search || statusFilter !== 'all' ? 'Tente ajustar os filtros' : 'Crie seu primeiro template'}
          action={!search && statusFilter === 'all' ? () => setIsCreateOpen(true) : undefined}
          actionLabel="Criar Template"
        />
      ) : (
        <div className="grid gap-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="p-6 transition-shadow hover:shadow-lg">
              <div className="flex flex-col justify-between gap-4 md:flex-row">
                <div className="flex-1">
                  <Link to={`${pageUrl('Templates')}/${template.id}`} className="text-lg font-semibold text-foreground hover:text-brand">
                    {template.name}
                  </Link>
                  {template.description && <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Badge variant={template.is_active ? 'default' : 'secondary'}>{template.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    <span className="text-sm text-muted-foreground">{counts[template.id] ?? 0} itens</span>
                    <span className="text-sm text-muted-foreground/70">Atualizado em {new Date(template.updated_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`${pageUrl('Templates')}/${template.id}`}>
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      Ver
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => handleDuplicate(template)} disabled={duplicatingId === template.id}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggleActive(template)} disabled={toggleActive.isPending}>
                    <Power className="mr-2 h-4 w-4" />
                    {template.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(template)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir "{deleteConfirm?.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
