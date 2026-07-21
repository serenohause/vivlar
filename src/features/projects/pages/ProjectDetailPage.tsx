import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Copy, Edit2, ExternalLink, Globe, Home, MapPin } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProjectEditDialog } from '@/features/projects/components/ProjectEditDialog';
import { ProjectStatusBadge } from '@/features/projects/components/ProjectStatusBadge';
import { ADMIN_STATUS_LABELS, ADMIN_STATUS_ORDER } from '@/features/projects/constants';
import { useProject, useProjectUnits } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

const UNIT_STATUS_LABELS: Record<string, string> = {
  disponivel: 'Disponível',
  reservada: 'Reservada',
  vendida: 'Vendida',
  bloqueada: 'Bloqueada',
};

/**
 * Tradução de `original-project/src/pages/ProjectDetail.jsx`, sem a aba
 * "Resultado Operacional" (fora de escopo combinado — como só sobra uma
 * aba, o `Tabs` do original vira conteúdo direto, sem abas) e sem os cards
 * de Negociações/Documentos/Contratos (dependem de `deals`/`documents`/
 * `contracts`, tabelas que ainda não existem — módulos futuros de CRM/
 * Financeiro; mostrá-los sempre zerados seria enganoso). A lista "Unidades
 * do Projeto" e a "Distribuição por Status" usam `useProjectUnits`
 * (prévia leve, sem link para detalhe de unidade — módulo ainda não tem UI
 * própria).
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError, refetch } = useProject(id);
  const { data: units } = useProjectUnits(id);

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Projeto não encontrado</p>
        <Button onClick={() => navigate(pageUrl('Projects'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const projectUnits = units ?? [];

  const adminStatusCounts = projectUnits.reduce<Record<string, number>>((acc, unit) => {
    if (!unit.admin_status) return acc;
    acc[unit.admin_status] = (acc[unit.admin_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(pageUrl('Projects'))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <p className="text-muted-foreground">{project.code}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <ProjectStatusBadge status={project.status} />
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>

      {/* Banner Espelho de Vendas */}
      {project.slug ? (
        <Card className={project.is_public ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
            <Globe className={`h-5 w-5 shrink-0 ${project.is_public ? 'text-green-600' : 'text-amber-500'}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${project.is_public ? 'text-green-800' : 'text-amber-800'}`}>
                {project.is_public ? 'Espelho de Vendas ativo' : 'Espelho de Vendas desativado (is_public = false)'}
              </p>
              <p className="truncate text-xs text-muted-foreground">{window.location.origin}/p/{project.slug}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/p/${project.slug}`);
                  toast.success('Link copiado!');
                }}
              >
                <Copy className="mr-1 h-4 w-4" />
                Copiar link
              </Button>
              {project.is_public && (
                <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" asChild>
                  <a href={`/p/${project.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Abrir
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 bg-muted">
          <CardContent className="flex items-center gap-3 pt-6">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <p className="flex-1 text-sm text-muted-foreground">
              Este projeto não tem <strong>slug</strong> configurado. Edite o projeto para ativar o espelho de vendas
              público.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informações */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <ProjectStatusBadge status={project.status} />
            </div>
            <div className="flex items-start gap-3">
              <Home className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Unidades</p>
                <p className="font-medium">
                  {projectUnits.length} de {project.total_units ?? '—'} total
                </p>
              </div>
            </div>
            {project.address && (
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Endereço</p>
                  <p className="font-medium">{project.address}</p>
                </div>
              </div>
            )}
            {project.start_sales_at && (
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Início das Vendas</p>
                  <p className="font-medium">{new Date(project.start_sales_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            )}
            {project.notes && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm text-muted-foreground">{project.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribuição por Status */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {projectUnits.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma unidade cadastrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {ADMIN_STATUS_ORDER.map((status) => {
                  const count = adminStatusCounts[status] ?? 0;
                  const percentage = projectUnits.length > 0 ? (count / projectUnits.length) * 100 : 0;

                  if (count === 0) return null;

                  return (
                    <div key={status} className="flex items-center gap-3">
                      <div className="w-28 truncate text-sm text-muted-foreground">{ADMIN_STATUS_LABELS[status]}</div>
                      <div className="flex-1">
                        <Progress value={percentage} className="h-2" />
                      </div>
                      <div className="w-12 text-right text-sm font-medium text-foreground">{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unidades do Projeto */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Unidades do Projeto</CardTitle>
          <Link to={pageUrl('Units')}>
            <Button variant="outline" size="sm">
              Ver Todas
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {projectUnits.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Home className="mx-auto mb-2 h-12 w-12 text-muted-foreground/40" />
              <p>Nenhuma unidade cadastrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Status Comercial</TableHead>
                    <TableHead>Status Admin</TableHead>
                    <TableHead>Atualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectUnits.slice(0, 10).map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.sku}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{UNIT_STATUS_LABELS[unit.status] ?? unit.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {unit.admin_status ? ADMIN_STATUS_LABELS[unit.admin_status] : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(unit.updated_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {projectUnits.length > 10 && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Mostrando 10 de {projectUnits.length} unidades.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ProjectEditDialog project={project} open={showEditDialog} onOpenChange={setShowEditDialog} />
    </div>
  );
}
