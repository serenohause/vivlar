import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useInspectionMediaSignedUrl } from '@/features/inspections/hooks';
import type { InspectionMedia } from '@/features/inspections/types';

interface MediaThumbnailProps {
  media: InspectionMedia;
  /** Rótulo mostrado sobre a foto — título do item (grid do item) ou data/hora (galeria), fiel às duas variações do original. */
  caption: string;
  onDelete?: () => void;
  /** Abre a foto em tamanho real numa nova aba ao clicar — fiel a `onClick={() => window.open(m.file_url, "_blank")}` da galeria (`InspectionDetail.jsx`). A miniatura já resolveu a signed URL para o `<img>`, então o clique reaproveita a mesma URL em vez de buscar de novo. */
  openOnClick?: boolean;
}

/**
 * Miniatura de uma foto de vistoria — o `<img src={m.file_url}>` direto do
 * original não funciona aqui: `file_url` é o PATH num bucket PRIVADO
 * (`inspection-media`), não uma URL pública. Resolve a signed URL via
 * `useInspectionMediaSignedUrl` antes de renderizar, com um placeholder
 * enquanto carrega.
 */
export function MediaThumbnail({ media, caption, onDelete, openOnClick }: MediaThumbnailProps) {
  const { data: signedUrl, isLoading } = useInspectionMediaSignedUrl(media.file_url);

  function handleClick() {
    if (openOnClick && signedUrl) window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="group relative">
      {isLoading || !signedUrl ? (
        <div className="h-32 w-full animate-pulse rounded-lg border bg-muted" />
      ) : (
        <img
          src={signedUrl}
          alt={media.file_name ?? 'Foto da vistoria'}
          className={`h-32 w-full rounded-lg border object-cover ${openOnClick ? 'cursor-pointer transition hover:opacity-90' : ''}`}
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
      <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/70 p-1 text-xs text-white">{caption}</div>
    </div>
  );
}
