import { toast } from 'sonner';
import { CheckCircle, FileText, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { useAuth } from '@/features/auth/AuthContext';
import { DOC_TYPE_LABELS } from '@/features/documents/constants';
import { useDeleteDocRequirement, useDocRequirements } from '@/features/settings/hooks';
import { ADMIN_STATUS_CONFIG, ADMIN_STATUS_ORDER, REQUIRED_DOCS_BY_STATUS } from '@/features/units/constants';

/**
 * Aba "Documentos" (Settings, ver comentário de topo de `SettingsPage.tsx`)
 * — tradução fiel da aba homônima de `Settings.jsx`: para cada etapa do
 * pipeline administrativo, mostra os documentos "hardcoded"
 * (`REQUIRED_DOCS_BY_STATUS`, badge sólido) + os customizados salvos em
 * `doc_requirements` (badge outline, com botão de excluir só para admin).
 * SEM formulário de "adicionar requisito": confirmado que o original tem a
 * mutation de criar (`createReqMutation`) mas nenhum controle de UI a
 * aciona em lugar nenhum do arquivo — mutation morta, não replicada aqui.
 */
export function DocumentsTab() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: docRequirements, isLoading, isError, refetch } = useDocRequirements();
  const deleteRequirement = useDeleteDocRequirement();

  function handleDelete(id: string) {
    deleteRequirement.mutate(id, {
      onSuccess: () => toast.success('Requisito removido.'),
      onError: () => toast.error('Erro ao remover requisito.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const requirements = docRequirements ?? [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Documentos Obrigatórios por Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-6 text-sm text-muted-foreground">
          Configure quais documentos são obrigatórios para avançar em cada status administrativo. O status só pode
          avançar se todos os documentos obrigatórios estiverem com status APROVADO.
        </p>

        <div className="space-y-6">
          {ADMIN_STATUS_ORDER.map((status) => {
            const requiredDocs = REQUIRED_DOCS_BY_STATUS[status] ?? [];
            const savedReqs = requirements.filter((r) => r.admin_status === status);

            return (
              <div key={status} className="rounded-lg border p-4">
                <h3 className="mb-3 font-semibold text-foreground">{ADMIN_STATUS_CONFIG[status].label}</h3>

                <div className="flex flex-wrap gap-2">
                  {requiredDocs.map((docType) => (
                    <Badge key={docType} className="bg-brand text-brand-foreground hover:bg-brand">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      {DOC_TYPE_LABELS[docType]}
                    </Badge>
                  ))}

                  {savedReqs.map((req) => (
                    <Badge key={req.id} variant="outline" className="flex items-center gap-1">
                      {DOC_TYPE_LABELS[req.doc_type]}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(req.id)}
                          className="ml-1 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>

                {requiredDocs.length === 0 && savedReqs.length === 0 && (
                  <p className="text-sm text-muted-foreground/70">Nenhum documento obrigatório configurado</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
