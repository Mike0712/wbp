import { useAuth } from './AuthContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function RequireRole({
  role,
  children,
}: {
  role: 'admin' | 'user';
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || user.role !== role) {
      router.push('/login');
    }
  }, [user]);

  if (!user || user.role !== role) return null;

  return <>{children}</>;
}
