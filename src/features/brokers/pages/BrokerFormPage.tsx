import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { BrokerForm } from '@/features/brokers/components/BrokerForm';
import { useCreateBroker } from '@/features/brokers/hooks';
import type { BrokerMutationPayload } from '@/features/brokers/schemas';
import { useRealEstateAgencies } from '@/features/real-estate-agencies/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Criação de corretor como página própria (`/brokers/novo`), em vez do
 * modal inline usado em `original-project/src/pages/Brokers.jsx` — mesma
 * convenção já usada no resto do sistema. A lista continua permitindo
 * editar rápido pelo dialog (`BrokerEditDialog`) — os dois caminhos usam o
 * mesmo `BrokerForm`.
 */
export function BrokerFormPage() {
  const navigate = useNavigate();
  const createBroker = useCreateBroker();
  const { data: agencies } = useRealEstateAgencies();

  function handleSubmit(data: BrokerMutationPayload) {
    createBroker.mutate(data, {
      onSuccess: (broker) => {
        toast.success('Corretor criado com sucesso!');
        navigate(`${pageUrl('Brokers')}/${broker.id}`);
      },
      onError: () => {
        toast.error('Erro ao criar corretor.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Novo Corretor" subtitle="Gestão de corretores e comissões" backTo="Brokers" />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <BrokerForm
            agencies={agencies ?? []}
            onSubmit={handleSubmit}
            isSubmitting={createBroker.isPending}
            submitLabel="Cadastrar"
            onCancel={() => navigate(pageUrl('Brokers'))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
