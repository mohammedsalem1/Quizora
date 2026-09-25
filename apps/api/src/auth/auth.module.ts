import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { assertUsableJwtSecret } from './jwt-secret';
import { LoginThrottle } from './login-throttle';
import { RolesGuard } from './roles.guard';

// Long enough that a student who logs in in the morning isn't logged out mid-quiz.
// No refresh tokens: when it expires, the user logs in again.
const TOKEN_LIFETIME = '12h';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        assertUsableJwtSecret(secret, config.get<string>('NODE_ENV'));
        return {
          secret,
          signOptions: { expiresIn: TOKEN_LIFETIME, algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // One instance per API process: it remembers failed logins in memory.
    { provide: LoginThrottle, useValue: new LoginThrottle() },
    // Order matters: AuthGuard sets request.user, then RolesGuard checks it.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
