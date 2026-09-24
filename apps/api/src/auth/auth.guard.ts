import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_USER_SELECT, AuthUser, JwtPayload } from './auth-user';
import { IS_PUBLIC_KEY } from './decorators';

// Registered globally: every route needs a valid Bearer token unless marked @Public().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(); // bad signature, expired, malformed
    }

    // Load the user fresh so role changes and deleted accounts take effect immediately.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: AUTH_USER_SELECT,
    });
    if (!user) throw new UnauthorizedException();

    request.user = user;
    return true;
  }
}
