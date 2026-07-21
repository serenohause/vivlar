import { useState, type FormEvent } from 'react';
import { Edit2, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateTerrainLocation } from '@/features/terrains/hooks';
import { terrainLocationSchema } from '@/features/terrains/schemas';
import type { Terrain } from '@/features/terrains/types';

interface TerrainLocationCardProps {
  terrain: Terrain;
  isTransformed: boolean;
}

/**
 * Seção "Localização" de `TerrainDetail.jsx`, sem o mapa interativo
 * (`TerrainPinSelector.jsx`, Leaflet — fora de escopo combinado com o
 * usuário). O original só deixava marcar/editar a localização através do
 * mapa; aqui os mesmos dados (`latitude`/`longitude`) viram um formulário
 * simples de dois campos numéricos, preservando o restante do fluxo
 * (alerta de "localização definida", timestamp de atualização, botão
 * definir/editar) fiel ao original.
 */
export function TerrainLocationCard({ terrain, isTransformed }: TerrainLocationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [latitude, setLatitude] = useState(terrain.latitude != null ? String(terrain.latitude) : '');
  const [longitude, setLongitude] = useState(terrain.longitude != null ? String(terrain.longitude) : '');
  const [error, setError] = useState<string | null>(null);

  const updateLocation = useUpdateTerrainLocation(terrain.id);
  const hasLocation = terrain.latitude != null && terrain.longitude != null;

  function handleToggleEdit() {
    setError(null);
    setLatitude(terrain.latitude != null ? String(terrain.latitude) : '');
    setLongitude(terrain.longitude != null ? String(terrain.longitude) : '');
    setIsEditing((current) => !current);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = terrainLocationSchema.safeParse({ latitude, longitude });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique as coordenadas informadas.');
      return;
    }

    updateLocation.mutate(parsed.data, {
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="-23.550520"
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="-46.633308"
                />
              </div>
            </div>
            <FormError message={error} />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={updateLocation.isPending}>
                {updateLocation.isPending ? 'Salvando...' : 'Salvar Localização'}
              </Button>
            </div>
          </form>
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
          </div>
        ) : (
          <Alert>
            <MapPin className="h-4 w-4" />
            <AlertDescription>
              Nenhuma localização definida. Clique em &quot;Definir Localização&quot; para informar as coordenadas do terreno.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
