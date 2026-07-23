import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Edit2, Link2, Mail, Phone, Trash2 } from 'lucide-react';
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
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { useAuth } from '@/features/auth/AuthContext';
import { InvestorEditDialog } from '@/features/investors/components/InvestorEditDialog';
import { LinkProjectDialog } from '@/features/investors/components/LinkProjectDialog';
import { formatCurrency, INVESTOR_STATUS_CONFIG, INVESTOR_TYPE_LABELS } from '@/features/investors/constants';
import {
  useInvestmentContributionsByInvestor,
  useInvestmentReturnsByInvestor,
  useInvestor,
  useProjectInvestorsByInvestor,
  useSoftDeleteInvestor,
  useSoftDeleteProjectInvestor,
} from '@/features/investors/hooks';
import type { ProjectInvestor } from '@/features/investors/types';
import { useProjects } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InvestorDetail.jsx` — informações
 * do investidor, totais aportado/retornado, projetos vinculados e atalhos
 * para aportes/retornos. Acrescenta o que o original NÃO tinha: gestão do
 * próprio vínculo investidor↔projeto ("Vincular a Projeto"/editar/remover
 * vínculo), já que nenhuma tela do original cria `project_investors` (ver
 * ACHADO em `0042_project_investors.sql`) — sem isso, a lista "Projetos
 * Vinculados" ficaria permanentemente vazia nesta plataforma nova.
 * Criar/editar/excluir (investidor e vínculo) restritos a `admin`, mesmo
 * critério de `InvestorsListPage`.
 */
export function InvestorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: investor, isLoading, isError, refetch } = useInvestor(id);
  const { data: projectLinks } = useProjectInvestorsByInvestor(id);
  const { data: contributions } = useInvestmentContributionsByInvestor(id);
  const { data: returns } = useInvestmentReturnsByInvestor(id);
  const { data: projects } = useProjects();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; link: ProjectInvestor | null }>({ open: false, link: null });
  const [unlinkConfirm, setUnlinkConfirm] = useState<ProjectInvestor | null>(null);

  const softDeleteInvestor = useSoftDeleteInvestor();
  const softDeleteLink = useSoftDeleteProjectInvestor();

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!investor) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Investidor não encontrado</p>
        <Button onClick={() => navigate(pageUrl('Investors'))}>Voltar</Button>
      </div>
    );
  }

  const allProjects = projects ?? [];
  const allLinks = (projectLinks ?? []).filter((link) => !link.is_deleted);
  const activeContributions = contributions ?? [];
  const activeReturns = returns ?? [];

  const totalAportado = activeContributions.reduce((sum, c) => sum + c.valor, 0);
  const totalRetornado = activeReturns.reduce((sum, r) => sum + r.valor, 0);

  const linkedProjectIds = new Set(allLinks.map((link) => link.project_id));
  const availableProjects = allProjects.filter((project) => !linkedProjectIds.has(project.id) || linkDialog.link?.project_id === project.id);

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function handleConfirmDeleteInvestor() {
    if (!investor) return;
    softDeleteInvestor.mutate(investor.id, {
      onSuccess: () => {
        toast.success('Investidor excluído com sucesso!');
        navigate(pageUrl('Investors'));
      },
      onError: () => toast.error('Erro ao excluir investidor.'),
    });
  }

  function handleConfirmUnlink() {
    if (!unlinkConfirm) return;
    softDeleteLink.mutate(
      { id: unlinkConfirm.id, investor_id: unlinkConfirm.investor_id },
      {
        onSuccess: () => {
          toast.success('Vínculo removido com sucesso!');
          setUnlinkConfirm(null);
        },
        onError: () => toast.error('Erro ao remover vínculo.'),
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
        <div className="flex items-center gap-3">
          <Link to={pageUrl('Investors')}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{investor.nome}</h1>
            {investor.documento && <p className="mt-1 text-muted-foreground">{investor.documento}</p>}
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button variant="outline" onClick={() => setDeleteConfirm(true)} className="border-red-200 text-red-600 hover:bg-red-50">
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Informações do Investidor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <Badge variant="outline">{INVESTOR_TYPE_LABELS[investor.tipo]}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={`${INVESTOR_STATUS_CONFIG[investor.status].color} text-white`}>
                  {INVESTOR_STATUS_CONFIG[investor.status].label}
                </Badge>
              </div>
            </div>
            {investor.email && (
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a href={`mailto:${investor.email}`} className="font-medium text-brand hover:underline">
                    {investor.email}
                  </a>
                </div>
              </div>
            )}
            {investor.telefone && (
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium text-foreground">{investor.telefone}</p>
                </div>
              </div>
            )}
            {investor.observacoes && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">{investor.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="mb-1 text-sm text-muted-foreground">Total Aportado</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAportado)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="mb-1 text-sm text-muted-foreground">Total Retornado</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRetornado)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Projetos Vinculados</CardTitle>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setLinkDialog({ open: true, link: null })}>
              <Link2 className="mr-2 h-4 w-4" />
              Vincular a Projeto
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {allLinks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum projeto vinculado a este investidor ainda.</p>
          ) : (
            <div className="space-y-3">
              {allLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-foreground">{link.nome_exibicao}</p>
                    <p className="text-sm text-muted-foreground">{projectName(link.project_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(link.valor_aportado)} · {link.percentual_participacao.toFixed(2)}%
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar vínculo" onClick={() => setLinkDialog({ open: true, link })}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Remover vínculo"
                        onClick={() => setUnlinkConfirm(link)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-2">
            <Link to={pageUrl('InvestmentContributions')}>
              <Button variant="outline" className="w-full justify-between">
                Ver Aportes
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to={pageUrl('InvestmentReturns')}>
              <Button variant="outline" className="w-full justify-between">
                Ver Retornos
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <InvestorEditDialog investor={investor} open={isEditOpen} onOpenChange={setIsEditOpen} />
      )}

      {isAdmin && linkDialog.open && (
        <LinkProjectDialog
          open={linkDialog.open}
          onOpenChange={(open) => setLinkDialog({ open, link: open ? linkDialog.link : null })}
          investorId={investor.id}
          investorName={investor.nome}
          projects={availableProjects}
          link={linkDialog.link}
        />
      )}

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Investidor?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{investor.nome}</strong>? Esta ação remove o investidor das
              listagens (exclusão lógica).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteInvestor} className="bg-destructive hover:bg-destructive/90" disabled={softDeleteInvestor.isPending}>
              {softDeleteInvestor.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(unlinkConfirm)} onOpenChange={(open) => !open && setUnlinkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Vínculo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o vínculo com <strong>{unlinkConfirm && projectName(unlinkConfirm.project_id)}</strong>? Os
              aportes e retornos já registrados para este projeto não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUnlink} className="bg-destructive hover:bg-destructive/90" disabled={softDeleteLink.isPending}>
              {softDeleteLink.isPending ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
