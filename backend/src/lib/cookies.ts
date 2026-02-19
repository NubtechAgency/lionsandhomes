// Configuración de cookies para autenticación httpOnly
import { CookieOptions } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Cookie sin domain — se asocia solo al hostname exacto del API (host-only cookie).
// Esto impide que XSS en otro subdominio de nubtechagency.com robe la sesión.
export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutos
};

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/api/auth', // Solo se envía a endpoints de auth
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
};

// Opciones para limpiar cookies legacy que tenían domain: '.nubtechagency.com'.
// Necesario durante la migración: si no se limpian con el mismo domain, el browser
// enviaría AMBAS cookies (old + new) causando conflictos.
export const legacyAccessTokenClearOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  domain: '.nubtechagency.com',
  path: '/',
};

export const legacyRefreshTokenClearOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  domain: '.nubtechagency.com',
  path: '/api/auth',
};
