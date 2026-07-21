import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { RealEstateAgencyForm } from '@/features/real-estate-agencies/components/RealEstateAgencyForm';
import { useCreateRealEstateAgency } from '@/features/real-estate-agencies/hooks';
import type { RealEstateAgencyMutationPayload } from '@/features/real-estate-agencies/schemas';
import { pageUrl } from '@/lib/page-url';

/**
 * Criação de imobiliária como página própria (`/real-estate-agencies/novo`),
 * em vez do modal inline usado em
 * `original-project/src/pages/RealEstateAgencies.jsx` — mesma convenção já
 * usada no resto do sistema. A lista continua permitindo editar rápido pelo
 * dialog (`RealEstateAgencyEditDialog`) — os dois caminhos usam o mesmo
 * `RealEstateAgencyForm`.
 */
export function RealEstateAgencyFormPage() {
  const navigate = useNavigate();
  const createAgency = useCreateRealEstateAgency();

  function handleSubmit(data: RealEstateAgencyMutationPayload) {
    createAgency.mutate(data, {
      onSuccess: (agency) => {
        toast.success('Imobiliária criada com sucesso!');
        navigate(`${pageUrl('RealEstateAgencies')}/${agency.id}`);
      },
      onError: () => {
        toast.error('Erro ao criar imobiliária.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Nova Imobiliária" subtitle="Cadastro de imobiliárias parceiras" backTo="RealEstateAgencies" />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <RealEstateAgencyForm
            onSubmit={handleSubmit}
            isSubmitting={createAgency.isPending}
            submitLabel="Cadastrar"
            onCancel={() => navigate(pageUrl('RealEstateAgencies'))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
