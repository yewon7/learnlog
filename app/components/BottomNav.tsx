'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/documents', label: 'Documents' },
  { href: '/learnlog', label: 'Learn Log' },
  { href: '/dailylog', label: 'Daily Log' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#00D4E8] flex items-center justify-around z-50">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center justify-center flex-1 h-full"
          >
            <span className={`text-sm text-white ${active ? 'font-bold' : 'font-normal opacity-70'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
