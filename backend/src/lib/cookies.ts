// Configuración de cookies para autenticación httpOnly
import { CookieOptions } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  domain: isProd ? '.nubtechagency.com' : undefined,
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutos
};

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  domain: isProd ? '.nubtechagency.com' : undefined,
  path: '/api/auth', // Solo se envía a endpoints de auth
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
};
