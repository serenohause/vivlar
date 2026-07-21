import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { TerrainForm } from '@/features/terrains/components/TerrainForm';
import { useCreateTerrain } from '@/features/terrains/hooks';
import type { TerrainMutationPayload } from '@/features/terrains/schemas';
import { pageUrl } from '@/lib/page-url';

/**
 * Criação de terreno como página própria (`/terrains/novo`), em vez do
 * modal inline usado em `original-project/src/pages/Terrains.jsx` — decisão
 * de convenção de rota para este e os próximos módulos do catálogo
 * (Projetos, Unidades) terem uma URL própria e navegável para criação, ver
 * relatório final. A lista continua permitindo criar rápido pelo modal
 * também (fiel ao original) — os dois caminhos usam o mesmo `TerrainForm`.
 */
export function TerrainFormPage() {
  const navigate = useNavigate();
  const createTerrain = useCreateTerrain();

  function handleSubmit(data: TerrainMutationPayload) {
    createTerrain.mutate(data, {
      onSuccess: (terrain) => {
        toast.success('Terreno criado com sucesso!');
        navigate(`${pageUrl('Terrains')}/${terrain.id}`);
      },
      onError: () => {
        toast.error('Erro ao criar terreno.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Novo Terreno" subtitle="Gestão de terrenos e pré-projetos" backTo="Terrains" />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <TerrainForm
            onSubmit={handleSubmit}
            isSubmitting={createTerrain.isPending}
            submitLabel="Criar Terreno"
            onCancel={() => navigate(pageUrl('Terrains'))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
