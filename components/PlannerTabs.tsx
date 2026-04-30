'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, AlertOctagon, GitBranch, FileText, Fuel, Wrench, Users, Zap, ScrollText } from 'lucide-react';

const TABS = [
  { href: '/planner',            label: 'Plans',      icon: ClipboardList },
  { href: '/planner/batch',      label: 'Batch',      icon: Zap },
  { href: '/planner/notams',     label: 'NOTAMs',     icon: ScrollText },
  { href: '/planner/divert',     label: 'Divert',     icon: AlertOctagon },
  { href: '/planner/cascade',    label: 'Cascade',    icon: GitBranch },
  { href: '/planner/tankering',  label: 'Tankering',  icon: Fuel },
  { href: '/planner/mel',        label: 'MEL',        icon: Wrench },
  { href: '/planner/deconflict', label: 'Deconflict', icon: Users },
  { href: '/planner/eod',        label: 'EOD',        icon: FileText },
];

export function PlannerTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-gray-200 mb-6 -mx-6 px-6">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
