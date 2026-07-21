import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Edit2, Mail, MapPin, Phone, Trash2, UserCog } from 'lucide-react';
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
import { PageHeader } from '@/components/shared/PageHeader';
import { useBrokers } from '@/features/brokers/hooks';
import { RealEstateAgencyEditDialog } from '@/features/real-estate-agencies/components/RealEstateAgencyEditDialog';
import { AGENCY_STATUS_LABELS } from '@/features/real-estate-agencies/constants';
import { useRealEstateAgency, useSoftDeleteRealEstateAgency } from '@/features/real-estate-agencies/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Não existe `RealEstateAgencyDetail` no original — `RealEstateAgencies.jsx`
 * é só lista + dialog. Página de detalhe construída seguindo a mesma
 * linguagem visual do resto do sistema (`ClientDetailPage`/
 * `TerrainDetailPage`), necessária para a rota `/real-estate-agencies/:id`
 * (padrão de navegação já usado em todo o resto do app). A ação de excluir
 * (soft delete) fica aqui, já que o dialog original não tinha — mesmo
 * critério de "sempre disponível para quem chega até a tela" já usado em
 * `ClientsListPage`.
 */
export function RealEstateAgencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agency, isLoading, isError, refetch } = useRealEstateAgency(id);
  const { data: brokers } = useBrokers();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteAgency = useSoftDeleteRealEstateAgency();

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!agency) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Imobiliária não encontrada</p>
        <Button onClick={() => navigate(pageUrl('RealEstateAgencies'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const agencyBrokers = (brokers ?? []).filter((b) => b.real_estate_agency_id === agency.id);

  function handleDeleteConfirm() {
    deleteAgency.mutate(agency!.id, {
      onSuccess: () => {
        toast.success('Imobiliária excluída com sucesso!');
        navigate(pageUrl('RealEstateAgencies'));
      },
      onError: () => {
        toast.error('Erro ao excluir imobiliária.');
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={agency.name}
        subtitle="Detalhes da imobiliária"
        backTo="RealEstateAgencies"
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
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <Badge variant={agency.status === 'ativa' ? 'default' : 'secondary'}>
                {AGENCY_STATUS_LABELS[agency.status]}
              </Badge>
              <Badge variant="outline">{agency.commission_percentage}% comissão</Badge>
            </div>

            {agency.cnpj && <p className="text-sm text-muted-foreground">CNPJ: {agency.cnpj}</p>}

            {agency.contact_person && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Responsável</p>
                <p className="font-medium">{agency.contact_person}</p>
              </div>
            )}

            {agency.phone && (
              <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="font-medium">{agency.phone}</p>
                </div>
              </div>
            )}

            {agency.email && (
              <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="font-medium">{agency.email}</p>
                </div>
              </div>
            )}

            {agency.address && (
              <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Endereço</p>
                  <p className="font-medium">{agency.address}</p>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Cadastrada em {new Date(agency.created_at).toLocaleDateString('pt-BR')}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <UserCog className="h-5 w-5 text-muted-foreground" />
              Corretores ({agencyBrokers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agencyBrokers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <UserCog className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
                <p>Nenhum corretor vinculado a esta imobiliária</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agencyBrokers.map((broker) => (
                  <Link
                    key={broker.id}
                    to={`${pageUrl('Brokers')}/${broker.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{broker.name}</p>
                        <p className="text-sm text-muted-foreground">{broker.phone || '—'}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{broker.commission_split}% split</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RealEstateAgencyEditDialog agency={agency} open={showEditDialog} onOpenChange={setShowEditDialog} />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Imobiliária?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir esta imobiliária?</p>
              <p className="font-medium text-foreground">{agency.name}</p>
              <p className="text-sm text-muted-foreground">
                Esta ação remove a imobiliária das listagens (exclusão lógica). Corretores vinculados são mantidos.
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
