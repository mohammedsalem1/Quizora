import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { StudentQuizzesService } from './student-quizzes.service';

// Logged-in STUDENT only. Each quiz comes with its state for this student (see availability.ts).
@Roles('STUDENT')
@Controller('student/quizzes')
export class StudentQuizzesController {
  constructor(private readonly quizzes: StudentQuizzesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.quizzes.list(user);
  }

  @Get(':quizId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.quizzes.get(user, quizId);
  }
}
