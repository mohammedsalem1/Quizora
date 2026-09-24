import { Role } from '../generated/prisma/client';

// The logged-in user, loaded from the database by AuthGuard on every request.
// Never built from anything the client sends.
export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  classId: string | null;
};

export const AUTH_USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  classId: true,
} as const;

// Contents of our JWTs: only the user id. The role is looked up, not trusted from the token.
export type JwtPayload = { sub: string };
