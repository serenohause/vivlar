import { useState } from 'react';
import { CheckCircle, Download, FileText, Pencil, Plus, Search, Trash2, XCircle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { DocumentEditDialog } from '@/features/documents/components/DocumentEditDialog';
import { DocumentFormDialog } from '@/features/documents/components/DocumentFormDialog';
import { DocumentStatusBadge } from '@/features/documents/components/DocumentStatusBadge';
import { DocumentTypeIcon } from '@/features/documents/components/DocumentTypeIcon';
import { DOC_TYPE_LABELS, DOCUMENT_STATUS_CONFIG } from '@/features/documents/constants';
import { useDocuments, useSoftDeleteDocument, useUpdateDocumentStatus, getDocumentSignedUrl } from '@/features/documents/hooks';
import { DOCUMENT_STATUS_VALUES } from '@/features/documents/types';
import type { Document, DocumentStatus, DocumentType } from '@/features/documents/types';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Tradução de `original-project/src/pages/Documents.jsx` — lista/gestão
 * documental MCMV, com upload real via Supabase Storage. Sem a checagem
 * `canEdit`/`canDelete` do original (baseada em `app_profile`): RLS já
 * restringe `documents` a admin/comercial/administrativo
 * (0032_rls_documents.sql) — o frontend trata erro de acesso via
 * `ErrorState`, não reimplementa autorização (CLAUDE.md).
 */
export function DocumentsListPage() {
  const { data: documents, isLoading, isError, refetch } = useDocuments();
  const { data: projects } = useProjects();
  const { data: units } = useUnits();

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Document | null>(null);

  const updateStatus = useUpdateDocumentStatus();
  const softDelete = useSoftDeleteDocument();

  const allProjects = projects ?? [];
  const allUnits = units ?? [];
  const allDocuments = documents ?? [];

  function projectName(projectId: string | null): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function unitSku(unitId: string | null): string {
    return allUnits.find((u) => u.id === unitId)?.sku ?? '—';
  }

  const filteredDocuments = allDocuments.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(search.toLowerCase());
    const matchesProject = projectFilter === 'all' || doc.project_id === projectFilter;
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    const matchesType = typeFilter === 'all' || doc.doc_type === typeFilter;
    return matchesSearch && matchesProject && matchesStatus && matchesType;
  });

  async function handleDownload(doc: Document) {
    if (!doc.file_url) return;
    try {
      const signedUrl = await getDocumentSignedUrl(doc.file_url);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Não foi possível gerar o link de download.');
    }
  }

  function handleApprove(doc: Document) {
    updateStatus.mutate(
      { id: doc.id, status: 'aprovado' },
      {
        onSuccess: () => toast.success('Documento aprovado.'),
        onError: () => toast.error('Erro ao aprovar documento.'),
      }
    );
  }

  function handleReject(doc: Document) {
    updateStatus.mutate(
      { id: doc.id, status: 'rejeitado' },
      {
        onSuccess: () => toast.success('Documento rejeitado.'),
        onError: () => toast.error('Erro ao rejeitar documento.'),
      }
    );
  }

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm, {
      onSuccess: () => {
        toast.success('Documento excluído com sucesso.');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir documento.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        subtitle="Gestão documental MCMV"
        actions={
          <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Documento
          </Button>
        }
      />

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar documentos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Projetos</SelectItem>
            {allProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocumentStatus | 'all')}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {DOCUMENT_STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {DOCUMENT_STATUS_CONFIG[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as DocumentType | 'all')}>
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Tipos</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredDocuments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento encontrado"
          description="Comece enviando seu primeiro documento"
          action={() => setIsCreateOpen(true)}
          actionLabel="Enviar Documento"
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <DocumentTypeIcon docType={doc.doc_type} />
                        <div>
                          <p className="font-medium text-foreground">{doc.title}</p>
                          {doc.file_name && <p className="text-xs text-muted-foreground">{doc.file_name}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{DOC_TYPE_LABELS[doc.doc_type]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{projectName(doc.project_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{doc.unit_id ? unitSku(doc.unit_id) : '—'}</TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={doc.status} size="sm" />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.received_at ? new Date(doc.received_at).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {doc.file_url && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Download" onClick={() => handleDownload(doc)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {doc.status === 'recebido' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                              title="Aprovar"
                              onClick={() => handleApprove(doc)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Rejeitar"
                              onClick={() => handleReject(doc)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setEditingDoc(doc)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Excluir"
                          onClick={() => setDeleteConfirm(doc)}
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

      <DocumentFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} projects={allProjects} units={allUnits} />

      <DocumentEditDialog document={editingDoc} open={Boolean(editingDoc)} onOpenChange={(open) => !open && setEditingDoc(null)} />

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteConfirm?.title}"? Esta ação remove o documento das listagens (o arquivo
              permanece armazenado).
            </AlertDialogDescription>
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
