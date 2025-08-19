import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { useRouter } from 'next/router';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (tokens: Tokens) => void;
  logout: () => void;
  user: { id: number; nickname: string, role: string } | null;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const AuthContext = createContext<AuthContextType>({} as any);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  type AuthUser = { id: number; nickname: string; role: string };
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  const login = (tokens: Tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
    setUser(payload);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    setUser(null);
    router.push('/login'); // или куда нужно
  };

  const tryRefresh = async () => {
    try {
      const res = await api.post('/auth/refresh', {
        refreshToken: localStorage.getItem('refreshToken'),
      });
      login(res.data);
    } catch {
      logout();
    }
  };

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return;

    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      setUser({ id: payload.id, nickname: payload.nickname, role: payload.role });
      setIsAuthenticated(true);
    } catch {
      tryRefresh();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
