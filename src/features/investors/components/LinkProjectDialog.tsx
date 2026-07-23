import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateProjectInvestor, useUpdateProjectInvestor } from '@/features/investors/hooks';
import { projectInvestorFormSchema } from '@/features/investors/schemas';
import type { ProjectInvestor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

interface LinkProjectFormState {
  project_id: string;
  nome_exibicao: string;
  valor_aportado: string;
  percentual_participacao: string;
}

function emptyForm(defaultNome: string): LinkProjectFormState {
  return { project_id: '', nome_exibicao: defaultNome, valor_aportado: '0', percentual_participacao: '0' };
}

function stateFromLink(link: ProjectInvestor): LinkProjectFormState {
  return {
    project_id: link.project_id,
    nome_exibicao: link.nome_exibicao,
    valor_aportado: String(link.valor_aportado),
    percentual_participacao: String(link.percentual_participacao),
  };
}

interface LinkProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investorId: string;
  /** Nome do investidor — usado como valor inicial de "Nome de Exibição" na criação (fiel ao dado mais comum observado no original: o mesmo nome do cadastro). */
  investorName: string;
  projects: Project[];
  /**
   * Vínculo existente, quando o diálogo edita em vez de criar. Sem
   * equivalente no original — `project_investors` nunca tinha tela de
   * criação/edição (ver ACHADO em `0042_project_investors.sql`), esta tela é
   * nova, desenhada para esta tarefa.
   */
  link?: ProjectInvestor | null;
}

/**
 * Diálogo "Vincular a Projeto" — tela NOVA, sem correspondência no
 * `original-project` (achado documentado em `0042_project_investors.sql`:
 * nenhuma tela de lá cria `project_investors`, só lê). Acessível a partir de
 * `InvestorDetailPage` ("Vincular a Projeto" para criar um vínculo novo, e
 * um ícone de edição em cada linha de "Projetos Vinculados" para corrigir
 * aporte/percentual/nome de exibição sem excluir e recriar). Campos
 * seguem a sugestão do achado: projeto, nome de exibição, valor aportado e
 * percentual de participação — os 4 únicos usados em qualquer lugar do
 * original (`InvestorDetail.jsx`/`InvestorDashboard.jsx`).
 */
export function LinkProjectDialog({ open, onOpenChange, investorId, investorName, projects, link }: LinkProjectDialogProps) {
  const isEdit = Boolean(link);
  const [formData, setFormData] = useState<LinkProjectFormState>(() => (link ? stateFromLink(link) : emptyForm(investorName)));
  const [error, setError] = useState<string | null>(null);

  const createLink = useCreateProjectInvestor();
  const updateLink = useUpdateProjectInvestor(link?.id ?? '');

  const isSubmitting = isEdit ? updateLink.isPending : createLink.isPending;

  function setField<K extends keyof LinkProjectFormState>(field: K, value: LinkProjectFormState[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setFormData(link ? stateFromLink(link) : emptyForm(investorName));
      setError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = projectInvestorFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    if (isEdit) {
      updateLink.mutate(parsed.data, {
        onSuccess: () => {
          toast.success('Vínculo atualizado com sucesso!');
          handleOpenChange(false);
        },
        onError: () => toast.error('Erro ao atualizar vínculo.'),
      });
      return;
    }

    createLink.mutate(
      { ...parsed.data, investor_id: investorId },
      {
        onSuccess: () => {
          toast.success('Investidor vinculado ao projeto com sucesso!');
          handleOpenChange(false);
        },
        onError: () => toast.error('Erro ao vincular investidor ao projeto.'),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Vínculo' : 'Vincular a Projeto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div>
              <Label>Projeto *</Label>
              <Select value={formData.project_id} onValueChange={(value) => setField('project_id', value)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="link-nome-exibicao">Nome de Exibição *</Label>
              <Input
                id="link-nome-exibicao"
                value={formData.nome_exibicao}
                onChange={(e) => setField('nome_exibicao', e.target.value)}
                placeholder="Como o investidor aparece neste projeto"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="link-valor-aportado">Valor Aportado *</Label>
                <Input
                  id="link-valor-aportado"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.valor_aportado}
                  onChange={(e) => setField('valor_aportado', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="link-percentual">% Participação *</Label>
                <Input
                  id="link-percentual"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.percentual_participacao}
                  onChange={(e) => setField('percentual_participacao', e.target.value)}
                />
              </div>
            </div>

            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
