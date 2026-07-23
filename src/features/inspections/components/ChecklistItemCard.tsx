import type { ChangeEvent } from 'react';
import { AlertCircle, Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MediaThumbnail } from '@/features/inspections/components/MediaThumbnail';
import { ResultIndicator } from '@/features/inspections/components/ResultIndicator';
import { INSPECTION_RESULT_CONFIG, RESULT_BUTTON_ORDER, RESULT_SELECTED_BUTTON_CLASS } from '@/features/inspections/constants';
import { useSoftDeleteInspectionMedia, useUpdateItemResult, useUploadInspectionMedia } from '@/features/inspections/hooks';
import type { InspectionItemResult, InspectionMedia, InspectionResult, InspectionStatus } from '@/features/inspections/types';
import type { InspectionTemplateItem } from '@/features/inspection-templates/types';
import { cn } from '@/lib/utils';

interface ChecklistItemCardProps {
  inspectionId: string;
  templateItem: InspectionTemplateItem;
  itemResult: InspectionItemResult;
  media: InspectionMedia[];
  isEditable: boolean;
  inspectionStatus: InspectionStatus;
}

const RESULTS_WITH_DETAILS: InspectionResult[] = ['nao_conforme', 'pendente'];

/**
 * Um item de checklist — tradução do card inline de `InspectionDetail.jsx`
 * (dentro do `.map` de `categoryItems`): resultado (grid de 4 botões),
 * comentário e upload de fotos (só quando o resultado é "Não Conforme" ou
 * "Pendente", fiel ao original).
 */
export function ChecklistItemCard({ inspectionId, templateItem, itemResult, media, isEditable, inspectionStatus }: ChecklistItemCardProps) {
  const updateItemResult = useUpdateItemResult(inspectionId);
  const uploadMedia = useUploadInspectionMedia();
  const deleteMedia = useSoftDeleteInspectionMedia();

  const needsMedia = templateItem.requires_photo && itemResult.result !== 'conforme' && media.length === 0;

  function handleResultChange(result: InspectionResult) {
    updateItemResult.mutate(
      { id: itemResult.id, result, currentInspectionStatus: inspectionStatus },
      {
        onSuccess: () => toast.success('Item atualizado'),
        onError: () => toast.error('Erro ao atualizar item.'),
      }
    );
  }

  // Sem toast a cada tecla digitada (diferente do original, que disparava
  // "Item atualizado" a cada onChange do comentário) -- simplificação
  // deliberada, spam de toast por tecla não é um comportamento que faz
  // sentido preservar.
  function handleCommentChange(comment: string) {
    updateItemResult.mutate({ id: itemResult.id, comment }, { onError: () => toast.error('Erro ao salvar comentário.') });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    uploadMedia.mutate(
      { file, inspectionId, itemResultId: itemResult.id },
      {
        onSuccess: () => toast.success('Mídia anexada'),
        onError: () => toast.error('Erro ao anexar mídia.'),
      }
    );
  }

  function handleDeleteMedia(mediaId: string) {
    deleteMedia.mutate(
      { id: mediaId, inspection_id: inspectionId },
      {
        onSuccess: () => toast.success('Mídia removida'),
        onError: () => toast.error('Erro ao remover mídia.'),
      }
    );
  }

  return (
    <Card className={cn('p-4', needsMedia && 'border-red-300 bg-red-50/50')}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="mb-2 font-medium text-foreground">{templateItem.title}</h4>
          {templateItem.instructions && <p className="text-sm text-muted-foreground">{templateItem.instructions}</p>}
          {templateItem.requires_photo && (
            <Badge variant="outline" className="mt-2">
              <Camera className="mr-1 h-3 w-3" />
              Foto Obrigatória
            </Badge>
          )}
        </div>
        <ResultIndicator result={itemResult.result} />
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium">Resultado</label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {RESULT_BUTTON_ORDER.map((resultOption) => {
              const isSelected = itemResult.result === resultOption;
              // Em modo Reinspeção, um item já "Conforme" fica travado
              // (não pode ser mudado para outro resultado) -- fiel a
              // `isBlockedInReinspection` do original.
              const isBlockedInReinspection = inspectionStatus === 'reinspecao' && itemResult.result === 'conforme' && resultOption !== 'conforme';

              return (
                <Button
                  key={resultOption}
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  disabled={!isEditable || isBlockedInReinspection || updateItemResult.isPending}
                  onClick={() => handleResultChange(resultOption)}
                  className={cn(isSelected && RESULT_SELECTED_BUTTON_CLASS[resultOption])}
                >
                  {INSPECTION_RESULT_CONFIG[resultOption].label}
                </Button>
              );
            })}
          </div>
        </div>

        {RESULTS_WITH_DETAILS.includes(itemResult.result) && (
          <div className="space-y-4 rounded-lg bg-muted p-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Comentário / Observação</label>
              <Textarea
                defaultValue={itemResult.comment ?? ''}
                key={itemResult.id}
                onBlur={(e) => handleCommentChange(e.target.value)}
                disabled={!isEditable}
                placeholder="Descreva o problema encontrado..."
                rows={3}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Anexos
                {templateItem.requires_photo && <span className="ml-1 text-red-600">*</span>}
              </label>

              {needsMedia && (
                <div className="mb-3 rounded-lg border border-red-300 bg-red-100 p-3 text-sm text-red-700">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  Foto obrigatória para este item
                </div>
              )}

              {isEditable && (
                <div className="mb-3">
                  <input type="file" accept="image/*" id={`upload-${itemResult.id}`} className="hidden" onChange={handleFileChange} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById(`upload-${itemResult.id}`)?.click()}
                    disabled={uploadMedia.isPending}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadMedia.isPending ? 'Enviando...' : 'Anexar Foto'}
                  </Button>
                </div>
              )}

              {media.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {media.map((item) => (
                    <MediaThumbnail
                      key={item.id}
                      media={item}
                      caption={new Date(item.taken_at).toLocaleString('pt-BR')}
                      onDelete={isEditable ? () => handleDeleteMedia(item.id) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
