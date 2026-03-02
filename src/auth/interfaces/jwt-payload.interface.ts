export interface JwtPayload {
  id: string;
  email: string;
  credential: string;
  theme: string;
  iat?: number;
  exp?: number;
  sub?: string;
  jti?: string;
}
