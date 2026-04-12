'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/documents');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      <Image
        src="/icons/logo.png"
        alt="LearnLog Logo"
        width={120}
        height={120}
        priority
      />
      <p
        className="mt-6 text-xl font-bold tracking-[0.4em] text-[#00D4E8]"
        style={{ fontFamily: "'D2Coding ligature', monospace" }}
      >
        LEARN LOG . . .
      </p>
    </div>
  );
}
