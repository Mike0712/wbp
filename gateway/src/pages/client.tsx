'use client';

import Client from '@/components/Client';
import { useSearchParams } from 'next/navigation';

export default function Page() {
  const sp = useSearchParams();
  const seller = sp.get('seller') ?? '0';
  const sid = sp.get('sid') ?? '';
  return <Client seller={seller} sid={sid} wsUrl={'/api-ws'} />;
}