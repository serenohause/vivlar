import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ChevronDown, ChevronUp, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/PageHeader';
import { SeverityBadge } from '@/features/inspection-templates/components/SeverityBadge';
import { TemplateEditDialog } from '@/features/inspection-templates/components/TemplateEditDialog';
import { TemplateItemFormDialog } from '@/features/inspection-templates/components/TemplateItemFormDialog';
import { CATEGORY_SUGGESTIONS } from '@/features/inspection-templates/constants';
import {
  useInspectionTemplate,
  useReorderTemplateItem,
  useSoftDeleteInspectionTemplate,
  useSoftDeleteTemplateItem,
  useTemplateItems,
  useUpdateInspectionTemplate,
} from '@/features/inspection-templates/hooks';
import { templateSettingsFormSchema, type TemplateSettingsFormInput } from '@/features/inspection-templates/schemas';
import type { InspectionTemplateItem } from '@/features/inspection-templates/types';
import { pageUrl } from '@/lib/page-url';

function TemplateSettingsTab({ template }: { template: NonNullable<ReturnType<typeof useInspectionTemplate>['data']> }) {
  const [formData, setFormData] = useState<TemplateSettingsFormInput>({
    name: template.name,
    description: template.description ?? '',
    is_active: template.is_active,
  });
  const [error, setError] = useState<string | null>(null);

  const updateTemplate = useUpdateInspectionTemplate(template.id);

  function setField<K extends keyof TemplateSettingsFormInput>(field: K, value: TemplateSettingsFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = templateSettingsFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    updateTemplate.mutate(
      { name: parsed.data.name, description: parsed.data.description || null, is_active: parsed.data.is_active },
      {
        onSuccess: () => toast.success('Template atualizado!'),
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações do Template</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="settings-name">Nome *</Label>
            <Input id="settings-name" value={formData.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="settings-description">Descrição</Label>
            <Textarea
              id="settings-description"
              value={formData.description ?? ''}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
              placeholder="Descrição do template..."
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label>Template Ativo</Label>
              <p className="text-sm text-muted-foreground">Templates inativos não aparecem na criação de novas vistorias</p>
            </div>
            <Switch checked={formData.is_active} onCheckedChange={(checked) => setField('is_active', checked)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="brand" disabled={updateTemplate.isPending}>
            {updateTemplate.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Tradução de `original-project/src/pages/TemplateDetail.jsx` — detalhe de
 * um template de checklist, com a aba "Itens" (busca/filtro de
 * categoria, criar/editar/excluir/reordenar item) e a aba "Configurações"
 * (nome/descrição/`is_active`). Sem a checagem `hasAccess`/"Acesso Negado"
 * do original: RLS já restringe `inspection_templates`/
 * `inspection_template_items` a admin/comercial/administrativo
 * (0036_rls_inspections.sql) — o frontend trata o erro de acesso via
 * `ErrorState`, não reimplementa a autorização (CLAUDE.md).
 */
export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: template, isLoading, isError, refetch } = useInspectionTemplate(id);
  const { data: items } = useTemplateItems(id);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InspectionTemplateItem | null>(null);
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<InspectionTemplateItem | null>(null);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState(false);

  const updateTemplate = useUpdateInspectionTemplate(id ?? '');
  const softDeleteTemplate = useSoftDeleteInspectionTemplate();
  const softDeleteItem = useSoftDeleteTemplateItem(id ?? '');
  const reorderItem = useReorderTemplateItem(id ?? '');

  const allItems = items ?? [];

  const filteredItems = allItems.filter((item) => {
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  function handleToggleActive() {
    if (!template) return;
    updateTemplate.mutate(
      { is_active: !template.is_active },
      {
        onSuccess: () => toast.success('Status atualizado!'),
        onError: () => toast.error('Erro ao atualizar status.'),
      }
    );
  }

  function handleConfirmDeleteTemplate() {
    if (!template) return;
    softDeleteTemplate.mutate(template.id, {
      onSuccess: () => {
        toast.success('Template excluído!');
        navigate(pageUrl('Templates'));
      },
      onError: () => toast.error('Erro ao excluir template.'),
    });
  }

  function handleConfirmDeleteItem() {
    if (!deleteItemConfirm) return;
    softDeleteItem.mutate(deleteItemConfirm.id, {
      onSuccess: () => {
        toast.success('Item excluído!');
        setDeleteItemConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir item.'),
    });
  }

  function handleReorder(itemId: string, direction: 'up' | 'down') {
    reorderItem.mutate({ itemId, direction }, { onError: () => toast.error('Erro ao reordenar item.') });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!template) {
    return (
      <EmptyState
        title="Template não encontrado"
        description="O template que você está procurando não existe ou foi excluído."
        action={() => navigate(pageUrl('Templates'))}
        actionLabel="Voltar para Templates"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={template.name}
        subtitle={template.description ?? undefined}
        backTo="Templates"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={template.is_active ? 'default' : 'secondary'}>{template.is_active ? 'Ativo' : 'Inativo'}</Badge>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button variant="outline" onClick={handleToggleActive} disabled={updateTemplate.isPending}>
              <Power className="mr-2 h-4 w-4" />
              {template.is_active ? 'Desativar' : 'Ativar'}
            </Button>
            <Button variant="outline" onClick={() => setDeleteTemplateConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Itens do Checklist ({allItems.length})</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <CardTitle>Itens</CardTitle>
                <Button
                  variant="brand"
                  onClick={() => {
                    setEditingItem(null);
                    setIsItemDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar itens..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Categorias</SelectItem>
                    {CATEGORY_SUGGESTIONS.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filteredItems.length === 0 ? (
                <EmptyState
                  title="Nenhum item encontrado"
                  description="Adicione itens ao checklist deste template"
                  action={() => {
                    setEditingItem(null);
                    setIsItemDialogOpen(true);
                  }}
                  actionLabel="Adicionar Item"
                />
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item, index) => (
                    <Card key={item.id} className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReorder(item.id, 'up')}
                            disabled={index === 0 || reorderItem.isPending}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReorder(item.id, 'down')}
                            disabled={index === filteredItems.length - 1 || reorderItem.isPending}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{item.category}</Badge>
                                <SeverityBadge severity={item.severity_default} />
                                {item.requires_photo && (
                                  <Badge variant="outline">
                                    <Camera className="mr-1 h-3 w-3" />
                                    Foto obrigatória
                                  </Badge>
                                )}
                              </div>
                              <h4 className="font-medium text-foreground">{item.title}</h4>
                              {item.instructions && <p className="mt-1 text-sm text-muted-foreground">{item.instructions}</p>}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingItem(item);
                                  setIsItemDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteItemConfirm(item)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <TemplateSettingsTab template={template} />
        </TabsContent>
      </Tabs>

      <TemplateEditDialog template={template} open={isEditOpen} onOpenChange={setIsEditOpen} />

      <TemplateItemFormDialog
        templateId={template.id}
        item={editingItem}
        open={isItemDialogOpen}
        onOpenChange={(open) => {
          setIsItemDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
      />

      <AlertDialog open={Boolean(deleteItemConfirm)} onOpenChange={(open) => !open && setDeleteItemConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Item</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteItem} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTemplateConfirm} onOpenChange={setDeleteTemplateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteTemplate} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
