import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { useProjects } from '@/features/projects/hooks';
import { UnitForm } from '@/features/units/components/UnitForm';
import { useCreateUnit } from '@/features/units/hooks';
import type { UnitMutationPayload } from '@/features/units/schemas';
import { pageUrl } from '@/lib/page-url';

/**
 * Criação de unidade como página própria (`/units/novo`), mesma convenção
 * de rota de `TerrainFormPage`/`ProjectFormPage`. Aceita `?project=<id>`
 * para pré-selecionar o empreendimento (usado quando a criação parte do
 * detalhe de um projeto). A lista continua permitindo criar rápido pelo
 * dialog também (fiel ao original) — os dois caminhos usam o mesmo `UnitForm`.
 */
export function UnitFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: projects } = useProjects();
  const createUnit = useCreateUnit();

  function handleSubmit(data: UnitMutationPayload) {
    createUnit.mutate(data, {
      onSuccess: (unit) => {
        toast.success('Unidade criada com sucesso!');
        navigate(`${pageUrl('Units')}/${unit.id}`);
      },
      onError: () => {
        toast.error('Erro ao criar unidade.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Nova Unidade" subtitle="Gestão de estoque de unidades" backTo="Units" />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <UnitForm
            projects={projects ?? []}
            defaultProjectId={searchParams.get('project') ?? undefined}
            onSubmit={handleSubmit}
            isSubmitting={createUnit.isPending}
            submitLabel="Criar"
            onCancel={() => navigate(pageUrl('Units'))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
