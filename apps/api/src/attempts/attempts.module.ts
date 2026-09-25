import { Module } from '@nestjs/common';
import { StudentAttemptsController } from './student-attempts.controller';
import { StudentAttemptsService } from './student-attempts.service';

@Module({
  controllers: [StudentAttemptsController],
  providers: [StudentAttemptsService],
})
export class AttemptsModule {}
