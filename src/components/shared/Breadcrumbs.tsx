import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { PAGE_LABELS, type PageLabelEntry } from '@/features/dashboard/navigation';
import { pageUrl } from '@/lib/page-url';

interface BreadcrumbsProps {
  currentPage: string;
  customLabel?: string;
}

export function Breadcrumbs({ currentPage, customLabel }: BreadcrumbsProps) {
  const buildBreadcrumbPath = (pageName: string) => {
    const path: { label: string; route: string }[] = [];
    let current: string | null = pageName;

    while (current) {
      const route: PageLabelEntry | undefined = PAGE_LABELS[current];
      if (!route) break;

      path.unshift({ label: route.label, route: current });
      current = route.parent;
    }

    return path;
  };

  const breadcrumbs = buildBreadcrumbPath(currentPage);

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <Fragment key={crumb.route}>
            {index > 0 && <ChevronRight className="w-4 h-4" />}
            {isLast ? (
              <span className="font-medium text-slate-900 dark:text-slate-100">{customLabel || crumb.label}</span>
            ) : (
              <Link to={pageUrl(crumb.route)} className="hover:text-slate-900 dark:hover:text-slate-100 transition">
                {crumb.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
