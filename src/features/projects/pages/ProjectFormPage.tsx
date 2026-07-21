import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProjectForm } from '@/features/projects/components/ProjectForm';
import { useCreateProject } from '@/features/projects/hooks';
import type { ProjectMutationPayload } from '@/features/projects/schemas';
import { pageUrl } from '@/lib/page-url';

/**
 * Criação de projeto como página própria (`/projects/novo`), em vez do
 * modal inline usado em `original-project/src/pages/Projects.jsx` — mesma
 * decisão de convenção de rota adotada em `TerrainFormPage`. A lista
 * continua permitindo criar rápido pelo modal também (fiel ao original) —
 * os dois caminhos usam o mesmo `ProjectForm`.
 */
export function ProjectFormPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  function handleSubmit(data: ProjectMutationPayload) {
    createProject.mutate(data, {
      onSuccess: (project) => {
        toast.success('Projeto criado com sucesso!');
        navigate(`${pageUrl('Projects')}/${project.id}`);
      },
      onError: () => {
        toast.error('Erro ao criar projeto.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Novo Projeto" subtitle="Gerencie os empreendimentos" backTo="Projects" />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <ProjectForm
            onSubmit={handleSubmit}
            isSubmitting={createProject.isPending}
            submitLabel="Criar"
            onCancel={() => navigate(pageUrl('Projects'))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
