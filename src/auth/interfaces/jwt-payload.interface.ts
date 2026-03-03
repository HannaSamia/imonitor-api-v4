export interface JwtPayload {
  id: string;
  email: string;
  credential: string;
  theme: string;
  keepLogin?: boolean;
  iat?: number;
  exp?: number;
  sub?: string;
  jti?: string;
}
