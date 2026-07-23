import { INSPECTION_RESULT_CONFIG } from '@/features/inspections/constants';
import type { InspectionResult } from '@/features/inspections/types';

/** Ícone + label colorido do resultado de um item — tradução de `getResultColor`/`getResultIcon` (`InspectionDetail.jsx`). */
export function ResultIndicator({ result }: { result: InspectionResult }) {
  const config = INSPECTION_RESULT_CONFIG[result];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1 ${config.textColor}`}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}
