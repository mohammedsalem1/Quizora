import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { TeacherResultsService } from './teacher-results.service';

// Logged-in TEACHER only, and only for quizzes that teacher owns.
@Roles('TEACHER')
@Controller('teacher/quizzes/:quizId/results')
export class TeacherResultsController {
  constructor(private readonly results: TeacherResultsService) {}

  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.results.results(user.id, quizId);
  }
}
