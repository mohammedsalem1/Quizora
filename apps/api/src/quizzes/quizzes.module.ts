import { Module } from '@nestjs/common';
import { TeacherQuizzesController } from './teacher-quizzes.controller';
import { TeacherQuizzesService } from './teacher-quizzes.service';

@Module({
  controllers: [TeacherQuizzesController],
  providers: [TeacherQuizzesService],
})
export class QuizzesModule {}
