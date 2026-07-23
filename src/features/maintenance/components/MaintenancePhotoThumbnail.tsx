import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMaintenancePhotoSignedUrl } from '@/features/maintenance/hooks';

interface MaintenancePhotoThumbnailProps {
  /** Path do objeto no bucket privado `maintenance-photos`. */
  path: string;
  caption?: string;
  onDelete?: () => void;
  /** Abre a foto em tamanho real numa nova aba ao clicar — mesmo comportamento de `MediaThumbnail` (`features/inspections`). */
  openOnClick?: boolean;
}

/**
 * Miniatura de uma foto de manutenção — `photos` guarda PATHS num bucket
 * PRIVADO (`maintenance-photos`), não URLs públicas, resolve a signed URL
 * via `useMaintenancePhotoSignedUrl` antes de renderizar. Mesmo padrão de
 * `MediaThumbnail` (`features/inspections/components/MediaThumbnail.tsx`),
 * reutilizado tanto no dialog de criação (com `onDelete`, foto ainda não
 * gravada no chamado) quanto na galeria do detalhe (`openOnClick`, sem
 * `onDelete` — remover foto de um chamado já criado não tem write path
 * nesta rodada, ver `MaintenanceDetailPage.tsx`).
 */
export function MaintenancePhotoThumbnail({ path, caption, onDelete, openOnClick }: MaintenancePhotoThumbnailProps) {
  const { data: signedUrl, isLoading } = useMaintenancePhotoSignedUrl(path);

  function handleClick() {
    if (openOnClick && signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="group relative">
      {isLoading || !signedUrl ? (
        <div className="h-24 w-full animate-pulse rounded-lg border bg-muted" />
      ) : (
        <img
          src={signedUrl}
          alt={caption ?? 'Foto do chamado de manutenção'}
          className={`h-24 w-full rounded-lg border object-cover ${openOnClick ? 'cursor-pointer transition hover:opacity-90' : ''}`}
          onClick={handleClick}
        />
      )}
      {onDelete && (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onDelete}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      {caption && <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/70 p-1 text-xs text-white">{caption}</div>}
    </div>
  );
}
