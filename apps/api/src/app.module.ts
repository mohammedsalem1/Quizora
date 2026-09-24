import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClassesController } from './classes/classes.controller';
import { PrismaModule } from './prisma/prisma.module';
import { QuizzesModule } from './quizzes/quizzes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    QuizzesModule,
  ],
  controllers: [AppController, ClassesController],
  providers: [
    AppService,
    // Registered here (not in main.ts) so e2e tests get exactly the same validation.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true, // unknown fields (e.g. a client-sent "role") are a 400
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
