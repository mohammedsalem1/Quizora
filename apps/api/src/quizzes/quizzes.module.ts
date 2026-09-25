import { Module } from '@nestjs/common';
import { StudentQuizzesController } from './student-quizzes.controller';
import { StudentQuizzesService } from './student-quizzes.service';
import { TeacherQuizzesController } from './teacher-quizzes.controller';
import { TeacherQuizzesService } from './teacher-quizzes.service';

@Module({
  controllers: [TeacherQuizzesController, StudentQuizzesController],
  providers: [TeacherQuizzesService, StudentQuizzesService],
})
export class QuizzesModule {}
