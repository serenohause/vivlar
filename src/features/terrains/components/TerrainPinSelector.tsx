import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Save, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { configureLeafletDefaultIcon } from '@/lib/leaflet-icon';

configureLeafletDefaultIcon();

const BRASILIA: [number, number] = [-15.7942, -47.8822];

interface TerrainPinSelectorProps {
  existingLat: number | null;
  existingLng: number | null;
  onSave: (location: { latitude: number; longitude: number }) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

/**
 * Tradução de `original-project/src/components/terrain/TerrainPinSelector.jsx`
 * (Leaflet puro, API imperativa — sem `<MapContainer>` do `react-leaflet`,
 * mesma escolha do original). Só o par `latitude`/`longitude` é suportado,
 * sem desenho de polígono (`TerrainPolygonEditor.jsx` do original é código
 * morto, não portado).
 *
 * Modo edição: clique no mapa posiciona/reposiciona o marker (`draggable`),
 * botão "Salvar Localização" dispara `onSave`. Modo somente-leitura: só
 * exibe o marker na posição salva, sem nenhuma interação de escrita.
 */
export function TerrainPinSelector({ existingLat, existingLng, onSave, onCancel, readOnly = false }: TerrainPinSelectorProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [currentLat, setCurrentLat] = useState<number | null>(existingLat);
  const [currentLng, setCurrentLng] = useState<number | null>(existingLng);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = existingLat ?? BRASILIA[0];
    const initialLng = existingLng ?? BRASILIA[1];

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: existingLat != null ? 15 : 5,
      zoomControl: true,
    });

    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri', maxZoom: 19 }
    );

    streetLayer.addTo(map);
    L.control.layers({ Mapa: streetLayer, Satélite: satelliteLayer }).addTo(map);

    mapRef.current = map;

    function placeMarker(lat: number, lng: number) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', (event) => {
          const pos = (event.target as L.Marker).getLatLng();
          setCurrentLat(pos.lat);
          setCurrentLng(pos.lng);
          setHasChanges(true);
        });
        markerRef.current = marker;
      }
    }

    if (existingLat != null && existingLng != null) {
      const marker = L.marker([existingLat, existingLng], { draggable: !readOnly }).addTo(map);

      if (!readOnly) {
        marker.on('dragend', (event) => {
          const pos = (event.target as L.Marker).getLatLng();
          setCurrentLat(pos.lat);
          setCurrentLng(pos.lng);
          setHasChanges(true);
        });
      }

      markerRef.current = marker;
    }

    if (!readOnly) {
      map.on('click', (event: L.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        placeMarker(lat, lng);
        setCurrentLat(lat);
        setCurrentLng(lng);
        setHasChanges(true);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingLat, existingLng, readOnly]);

  function handleSave() {
    if (currentLat == null || currentLng == null) return;
    onSave({ latitude: currentLat, longitude: currentLng });
  }

  return (
    <div className="space-y-4">
      {currentLat != null && currentLng != null && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">Coordenadas: </span>
                <span className="font-mono">
                  {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
                </span>
              </div>
              {hasChanges && !readOnly && <span className="text-xs text-amber-600">Não salvo</span>}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div ref={mapContainerRef} className="h-[400px] w-full rounded-lg border border-input" />

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={currentLat == null || currentLng == null} className="bg-green-600 hover:bg-green-700">
            <Save className="mr-2 h-4 w-4" />
            Salvar Localização
          </Button>

          {onCancel && (
            <Button type="button" onClick={onCancel} variant="outline">
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          )}
        </div>
      )}

      {!readOnly && (
        <Alert>
          <MapPin className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Instruções:</strong> Clique no mapa para posicionar o marcador ou arraste o marcador existente para
            ajustar a localização.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
