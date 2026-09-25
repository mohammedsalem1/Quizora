import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth-user';
import { LoginThrottle } from './login-throttle';

// Compared against when the username doesn't exist, so a login for an unknown user takes
// about as long as one with a wrong password and doesn't reveal which usernames exist.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

const PROFILE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  class: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly throttle: LoginThrottle,
  ) {}

  async login(username: string, password: string) {
    // Checked before the password (and before bcrypt's work), so guessing stays slow.
    const waitMs = this.throttle.retryAfterMs(username);
    if (waitMs > 0) {
      throw new HttpException(
        {
          message: 'Too many login attempts. Try again later.',
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { ...PROFILE_SELECT, passwordHash: true },
    });

    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordOk) {
      this.throttle.recordFailure(username);
      throw new UnauthorizedException('Invalid username or password');
    }
    this.throttle.recordSuccess(username);

    const payload: JwtPayload = { sub: user.id };
    return {
      accessToken: await this.jwt.signAsync(payload),
      // Listed explicitly so passwordHash can never leak into the response.
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        class: user.class,
      },
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
  }
}
