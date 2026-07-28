import * as L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

/**
 * Corrige o ícone padrão do marker do Leaflet, que por padrão resolve os
 * PNGs via caminho relativo ao bundler do Webpack (quebrado no Vite).
 *
 * O `original-project` (Base44/CRA) resolvia isso apontando para PNGs via
 * CDN (`cdnjs.cloudflare.com/ajax/libs/leaflet/...`). Aqui optamos por
 * importar os mesmos PNGs como assets estáticos do próprio pacote
 * `leaflet` (via import do Vite) em vez de depender de uma CDN externa:
 * funciona offline, não quebra se a CDN sair do ar ou trocar de versão, e
 * o asset fica versionado junto com a dependência no `package.json`.
 *
 * Chamar uma única vez (idempotente) antes de qualquer `L.marker(...)` sem
 * ícone customizado — os dois componentes de mapa de terrenos
 * (`TerrainPinSelector`, `TerrainSimpleMapView`) importam este módulo.
 */
export function configureLeafletDefaultIcon(): void {
  // `_getIconUrl` é um método interno do Leaflet, não faz parte do tipo
  // público de `Icon.Default` em `@types/leaflet`.
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
}
