import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { ClientForm } from '@/features/clients/components/ClientForm';
import { useCreateClient } from '@/features/clients/hooks';
import type { ClientMutationPayload } from '@/features/clients/schemas';
import { pageUrl } from '@/lib/page-url';

/**
 * Criação de cliente como página própria (`/clients/novo`), em vez do modal
 * inline usado em `original-project/src/pages/Clients.jsx` — mesma
 * convenção já usada em Terrenos/Projetos/Unidades. A lista continua
 * permitindo editar rápido pelo dialog (`ClientEditDialog`) — os dois
 * caminhos usam o mesmo `ClientForm`.
 */
export function ClientFormPage() {
  const navigate = useNavigate();
  const createClient = useCreateClient();

  function handleSubmit(data: ClientMutationPayload) {
    createClient.mutate(data, {
      onSuccess: (client) => {
        toast.success('Cliente criado com sucesso!');
        navigate(`${pageUrl('Clients')}/${client.id}`);
      },
      onError: () => {
        toast.error('Erro ao criar cliente.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Novo Cliente" subtitle="Cadastro de compradores" backTo="Clients" />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <ClientForm
            onSubmit={handleSubmit}
            isSubmitting={createClient.isPending}
            submitLabel="Cadastrar"
            onCancel={() => navigate(pageUrl('Clients'))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
