import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { AnswerDto } from './dto/answer.dto';
import { StudentAttemptsService } from './student-attempts.service';

// Logged-in STUDENT only. A student has at most one attempt per quiz, so the attempt is
// addressed by its quiz; whose attempt it is always comes from the login, never the URL.
@Roles('STUDENT')
@Controller('student/quizzes/:quizId/attempt')
export class StudentAttemptsController {
  constructor(private readonly attempts: StudentAttemptsService) {}

  @Post()
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.attempts.start(user, quizId);
  }

  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.attempts.get(user, quizId);
  }

  @Put('answers/:questionId')
  saveAnswer(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: AnswerDto,
  ) {
    return this.attempts.saveAnswer(user, quizId, questionId, dto.optionId);
  }

  @Delete('answers/:questionId')
  @HttpCode(204)
  async clearAnswer(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    await this.attempts.clearAnswer(user, quizId, questionId);
  }

  @Post('submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.attempts.submit(user, quizId);
  }
}
