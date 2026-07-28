import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Eye, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TerrainStatusBadge } from '@/features/terrains/components/TerrainStatusBadge';
import { configureLeafletDefaultIcon } from '@/lib/leaflet-icon';
import { pageUrl } from '@/lib/page-url';
import type { Terrain } from '@/features/terrains/types';

configureLeafletDefaultIcon();

const BRASILIA: [number, number] = [-15.7942, -47.8822];

interface TerrainSimpleMapViewProps {
  terrains: Terrain[];
}

/**
 * Tradução de `original-project/src/components/terrain/TerrainSimpleMapView.jsx`
 * (Leaflet puro): um pin por terreno com `latitude`+`longitude` definidos.
 * Centro inicial Brasília, `fitBounds` automático nos terrenos com
 * localização. Clique no marker abre um card com os dados do terreno e
 * botão para abrir o detalhe.
 */
export function TerrainSimpleMapView({ terrains }: TerrainSimpleMapViewProps) {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [selectedTerrain, setSelectedTerrain] = useState<Terrain | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: BRASILIA,
      zoom: 4,
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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current = [];

    const terrainsWithLocation = terrains.filter((t) => t.latitude != null && t.longitude != null);
    const bounds: [number, number][] = [];

    terrainsWithLocation.forEach((terrain) => {
      const marker = L.marker([terrain.latitude as number, terrain.longitude as number]);
      marker.on('click', () => setSelectedTerrain(terrain));
      marker.addTo(map);
      markersRef.current.push(marker);
      bounds.push([terrain.latitude as number, terrain.longitude as number]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [terrains]);

  const terrainsWithLocation = terrains.filter((t) => t.latitude != null && t.longitude != null);

  return (
    <div className="relative">
      <div ref={mapContainerRef} className="h-[600px] w-full rounded-lg border border-input" />

      <div className="absolute left-4 top-4 z-[1000] rounded-lg bg-card px-3 py-2 text-sm shadow-md">
        <span className="font-semibold">{terrainsWithLocation.length}</span> terreno(s) no mapa
      </div>

      {selectedTerrain && (
        <Card className="absolute bottom-4 left-4 right-4 z-[1000] shadow-lg md:right-auto md:w-80">
          <CardContent className="p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">{selectedTerrain.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedTerrain.code}</p>
              </div>
              <TerrainStatusBadge status={selectedTerrain.status} />
            </div>

            <div className="mb-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>
                  {selectedTerrain.city}, {selectedTerrain.state}
                </span>
              </div>
              {selectedTerrain.area_m2 != null && (
                <div>
                  <span className="text-muted-foreground">Área: </span>
                  <span className="font-semibold">{selectedTerrain.area_m2.toLocaleString('pt-BR')} m²</span>
                  {selectedTerrain.area_m2 >= 10000 && (
                    <span className="ml-1 text-muted-foreground">({(selectedTerrain.area_m2 / 10000).toFixed(2)} ha)</span>
                  )}
                </div>
              )}
            </div>

            <Button
              variant="brand"
              className="w-full"
              onClick={() => navigate(`${pageUrl('Terrains')}/${selectedTerrain.id}`)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Abrir Detalhes
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
