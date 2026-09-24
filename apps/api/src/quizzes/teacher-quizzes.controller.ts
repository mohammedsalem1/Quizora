import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { QuestionDto } from './dto/question.dto';
import { CreateQuizDto, UpdateQuizDto } from './dto/quiz-settings.dto';
import { TeacherQuizzesService } from './teacher-quizzes.service';

// Every route: logged-in TEACHER only, and only for quizzes that teacher owns.
@Roles('TEACHER')
@Controller('teacher/quizzes')
export class TeacherQuizzesController {
  constructor(private readonly quizzes: TeacherQuizzesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.quizzes.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuizDto) {
    return this.quizzes.create(user.id, dto);
  }

  @Get(':quizId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.quizzes.get(user.id, quizId);
  }

  @Patch(':quizId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizzes.update(user.id, quizId, dto);
  }

  @Post(':quizId/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.quizzes.publish(user.id, quizId);
  }

  @Post(':quizId/questions')
  addQuestion(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() dto: QuestionDto,
  ) {
    return this.quizzes.addQuestion(user.id, quizId, dto);
  }

  @Put(':quizId/questions/:questionId')
  replaceQuestion(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: QuestionDto,
  ) {
    return this.quizzes.replaceQuestion(user.id, quizId, questionId, dto);
  }

  @Delete(':quizId/questions/:questionId')
  removeQuestion(
    @CurrentUser() user: AuthUser,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.quizzes.removeQuestion(user.id, quizId, questionId);
  }
}
