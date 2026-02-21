// Context de autenticación — httpOnly cookies (sin localStorage)
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, LoginCredentials } from '../types';
import { authAPI, resetSessionExpired } from '../services/api';

const API_URL = import.meta.env.VITE_API_URL || '';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Al cargar la app, verificar si hay sesión activa (cookie httpOnly).
  // Usa fetch directo (NO fetchAPI) para evitar el interceptor de refresh
  // que causa loops cuando no hay sesión.
  useEffect(() => {
    const checkSession = async () => {
      try {
        // 1. Intentar obtener usuario con access token actual
        let res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });

        // 2. Si el access token expiró, intentar refresh UNA vez
        if (res.status === 401) {
          const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
          });
          if (refreshRes.ok) {
            // Refresh exitoso — reintentar /me con el nuevo access token
            res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
          }
        }

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  // Escuchar evento de sesión expirada (emitido por fetchAPI cuando refresh falla)
  // Limpia el estado → React Router redirige a /login sin hard reload
  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const response = await authAPI.login(credentials);
    resetSessionExpired();
    setUser(response.user);
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // Limpiar estado local incluso si falla la API
    }
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }

  return context;
};
