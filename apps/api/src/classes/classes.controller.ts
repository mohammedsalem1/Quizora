import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

// Teachers pick from these when assigning a quiz.
@Roles('TEACHER')
@Controller('classes')
export class ClassesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.class.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
