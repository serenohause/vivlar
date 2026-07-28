import { useState } from 'react';
import { Edit2, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TerrainPinSelector } from '@/features/terrains/components/TerrainPinSelector';
import { useUpdateTerrainLocation } from '@/features/terrains/hooks';
import type { TerrainLocationInput } from '@/features/terrains/schemas';
import type { Terrain } from '@/features/terrains/types';

interface TerrainLocationCardProps {
  terrain: Terrain;
  isTransformed: boolean;
}

/**
 * Seção "Localização" de `TerrainDetail.jsx`, com o mapa interativo
 * (`TerrainPinSelector`, Leaflet) — débito técnico fechado. Modo edição:
 * clique/arraste no mapa reposiciona o pino. Modo somente-leitura: mapa
 * mostra só o pino salvo, sem interação de escrita. Preserva o restante do
 * fluxo do original (alerta de "localização definida", timestamp de
 * atualização, botão definir/editar, gate `!isTransformed`).
 */
export function TerrainLocationCard({ terrain, isTransformed }: TerrainLocationCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const updateLocation = useUpdateTerrainLocation(terrain.id);
  const hasLocation = terrain.latitude != null && terrain.longitude != null;

  function handleToggleEdit() {
    setIsEditing((current) => !current);
  }

  function handleLocationSave(location: TerrainLocationInput) {
    updateLocation.mutate(location, {
      onSuccess: () => {
        toast.success('Localização atualizada com sucesso!');
        setIsEditing(false);
      },
      onError: () => {
        toast.error('Erro ao salvar localização.');
      },
    });
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5" />
            Localização
          </CardTitle>
          {!isTransformed && (
            <Button
              type="button"
              onClick={handleToggleEdit}
              variant={isEditing ? 'secondary' : 'brand'}
            >
              {isEditing ? (
                <X className="mr-2 h-4 w-4" />
              ) : hasLocation ? (
                <Edit2 className="mr-2 h-4 w-4" />
              ) : (
                <MapPin className="mr-2 h-4 w-4" />
              )}
              {isEditing ? 'Cancelar' : hasLocation ? 'Editar Localização' : 'Definir Localização'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <TerrainPinSelector
            existingLat={terrain.latitude}
            existingLng={terrain.longitude}
            onSave={handleLocationSave}
            onCancel={() => setIsEditing(false)}
          />
        ) : hasLocation ? (
          <div className="space-y-3">
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription>
                <div>
                  <span className="font-semibold text-green-900">Localização definida</span>
                  <p className="mt-1 font-mono text-sm text-green-700">
                    {terrain.latitude?.toFixed(6)}, {terrain.longitude?.toFixed(6)}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
            {terrain.location_updated_at && (
              <p className="text-xs text-muted-foreground">
                Localização atualizada em{' '}
                {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                  new Date(terrain.location_updated_at)
                )}
              </p>
            )}
            <TerrainPinSelector
              existingLat={terrain.latitude}
              existingLng={terrain.longitude}
              onSave={() => {}}
              readOnly
            />
          </div>
        ) : (
          <Alert>
            <MapPin className="h-4 w-4" />
            <AlertDescription>
              Nenhuma localização definida. Clique em &quot;Definir Localização&quot; para marcar o terreno no mapa.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
