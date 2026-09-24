// Development seed: `npm run db:seed` (from the repo root).
// WIPES every Quizora table, then inserts sample data. All names are fictional.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';

// Every seeded account uses this password. Demo data only.
const DEMO_PASSWORD = 'Quizora@2026';

const DAY_MS = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type SeedQuestion = {
  text: string;
  points: number;
  options: string[]; // shown in this order
  correctIndex: number; // index into options
};

function questionsData(questions: SeedQuestion[]) {
  return questions.map((q, i) => ({
    text: q.text,
    points: q.points,
    position: i + 1,
    options: {
      create: q.options.map((text, j) => ({
        text,
        isCorrect: j === q.correctIndex,
        position: j + 1,
      })),
    },
  }));
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the seed (it deletes all data) with NODE_ENV=production',
    );
  }

  // Children first, so foreign keys don't block the deletes.
  await prisma.answer.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.quizClass.deleteMany();
  await prisma.option.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [c10A, c10B, c11A] = await Promise.all(
    ['10A', '10B', '11A'].map((name) =>
      prisma.class.create({ data: { name } }),
    ),
  );

  const [rana, omar, huda] = await Promise.all(
    [
      { username: 'teacher.rana', fullName: 'رنا الخطيب' },
      { username: 'teacher.omar', fullName: 'عمر الزعبي' },
      { username: 'teacher.huda', fullName: 'هدى النجار' },
    ].map((t) =>
      prisma.user.create({ data: { ...t, passwordHash, role: 'TEACHER' } }),
    ),
  );

  const studentsByClass: [string, typeof c10A, string[]][] = [
    [
      's10a',
      c10A,
      [
        'ليان حداد',
        'يوسف العمري',
        'سارة المصري',
        'أحمد الشريف',
        'مريم القاسم',
        'زيد الحوراني',
      ],
    ],
    [
      's10b',
      c10B,
      [
        'جود الرفاعي',
        'كريم عبيدات',
        'تالا السعدي',
        'حمزة الطراونة',
        'نور البشير',
        'عمر الخوالدة',
      ],
    ],
    [
      's11a',
      c11A,
      [
        'رهف المجالي',
        'سيف الدويري',
        'دانة العلي',
        'مالك الحسن',
        'لمى الكيلاني',
        'آدم الصمادي',
      ],
    ],
  ];
  for (const [prefix, klass, names] of studentsByClass) {
    await prisma.user.createMany({
      data: names.map((fullName, i) => ({
        username: `${prefix}${String(i + 1).padStart(2, '0')}`, // s10a01, s10a02, ...
        fullName,
        passwordHash,
        role: 'STUDENT' as const,
        classId: klass.id,
      })),
    });
  }

  const now = Date.now();

  // Published, open now, Arabic content, negative marking on (25% of the question's points).
  await prisma.quiz.create({
    data: {
      title: 'اختبار الرياضيات: المعادلات الخطية',
      description: 'اختبار قصير على حل المعادلات الخطية وميل المستقيم.',
      teacherId: rana.id,
      opensAt: new Date(now - DAY_MS),
      closesAt: new Date(now + 14 * DAY_MS),
      timeLimitMinutes: 20,
      negativeMarkPercent: 25,
      publishedAt: new Date(now - DAY_MS),
      classes: { create: [{ classId: c10A.id }, { classId: c10B.id }] },
      questions: {
        create: questionsData([
          {
            text: 'ما قيمة س في المعادلة: 2س + 3 = 11؟',
            points: 1,
            options: ['4', '7', '5.5', '8'],
            correctIndex: 0,
          },
          {
            text: 'ما حل المعادلة: 5س − 10 = 0؟',
            points: 1,
            options: ['5', '2', '−2', '10'],
            correctIndex: 1,
          },
          {
            text: 'إذا كان 3(س − 2) = 12، فما قيمة س؟',
            points: 2,
            options: ['4', '2', '6', '5'],
            correctIndex: 2,
          },
          {
            text: 'ما ميل المستقيم ص = 3س + 1؟',
            points: 2,
            options: ['1', '−3', '1/3', '3'],
            correctIndex: 3,
          },
          {
            text: 'أي نقطة تقع على المستقيم ص = 2س − 1؟',
            points: 3,
            options: ['(2, 3)', '(1, 3)', '(0, 1)', '(3, 4)'],
            correctIndex: 0,
          },
        ]),
      },
    },
  });

  // Published, open now, English content, no negative marking.
  await prisma.quiz.create({
    data: {
      title: 'Biology: The Cell',
      description: 'Cell structure and organelles.',
      teacherId: omar.id,
      opensAt: new Date(now - DAY_MS),
      closesAt: new Date(now + 14 * DAY_MS),
      timeLimitMinutes: 15,
      negativeMarkPercent: 0,
      publishedAt: new Date(now - DAY_MS),
      classes: { create: [{ classId: c11A.id }] },
      questions: {
        create: questionsData([
          {
            text: "Which organelle contains the cell's genetic material?",
            points: 1,
            options: ['Nucleus', 'Ribosome', 'Cell membrane', 'Vacuole'],
            correctIndex: 0,
          },
          {
            text: 'Where does aerobic respiration mainly take place?',
            points: 1,
            options: [
              'Chloroplast',
              'Mitochondria',
              'Golgi apparatus',
              'Nucleus',
            ],
            correctIndex: 1,
          },
          {
            text: 'Which structure is found in plant cells but not in animal cells?',
            points: 2,
            options: ['Cell membrane', 'Cytoplasm', 'Cell wall', 'Ribosome'],
            correctIndex: 2,
          },
          {
            text: 'What is the main function of ribosomes?',
            points: 2,
            options: [
              'Energy production',
              'Storing water',
              'Cell division',
              'Protein synthesis',
            ],
            correctIndex: 3,
          },
          {
            text: 'Which process moves water across a partially permeable membrane?',
            points: 3,
            options: ['Osmosis', 'Photosynthesis', 'Mitosis', 'Respiration'],
            correctIndex: 0,
          },
        ]),
      },
    },
  });

  // Draft (publishedAt = null): the teacher is still writing it, so students must not see it.
  await prisma.quiz.create({
    data: {
      title: 'اختبار اللغة العربية: النحو',
      teacherId: huda.id,
      opensAt: new Date(now + 7 * DAY_MS),
      closesAt: new Date(now + 14 * DAY_MS),
      timeLimitMinutes: 20,
      classes: { create: [{ classId: c10A.id }] },
      questions: {
        create: questionsData([
          {
            text: 'ما إعراب كلمة "الطالبُ" في جملة: "نجحَ الطالبُ"؟',
            points: 2,
            options: [
              'فاعل مرفوع',
              'مفعول به منصوب',
              'مبتدأ مرفوع',
              'خبر مرفوع',
            ],
            correctIndex: 0,
          },
          {
            text: 'ما جمع كلمة "كتاب"؟',
            points: 1,
            options: ['كتابات', 'كُتُب', 'كواتب', 'أكتاب'],
            correctIndex: 1,
          },
        ]),
      },
    },
  });

  const counts = {
    classes: await prisma.class.count(),
    teachers: await prisma.user.count({ where: { role: 'TEACHER' } }),
    students: await prisma.user.count({ where: { role: 'STUDENT' } }),
    quizzes: await prisma.quiz.count(),
    questions: await prisma.question.count(),
    options: await prisma.option.count(),
  };
  console.log('Seeded:', counts);
  console.log(
    `All accounts use the password "${DEMO_PASSWORD}" (e.g. teacher.rana, s10a01).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
