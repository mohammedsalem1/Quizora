import { Module } from '@nestjs/common';
import { StudentQuizzesController } from './student-quizzes.controller';
import { StudentQuizzesService } from './student-quizzes.service';
import { TeacherQuizzesController } from './teacher-quizzes.controller';
import { TeacherQuizzesService } from './teacher-quizzes.service';
import { TeacherResultsController } from './teacher-results.controller';
import { TeacherResultsService } from './teacher-results.service';

@Module({
  controllers: [
    TeacherQuizzesController,
    TeacherResultsController,
    StudentQuizzesController,
  ],
  providers: [
    TeacherQuizzesService,
    TeacherResultsService,
    StudentQuizzesService,
  ],
})
export class QuizzesModule {}
