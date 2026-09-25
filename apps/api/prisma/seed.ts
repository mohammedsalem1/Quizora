// Development seed: `npm run db:seed` (from the repo root).
// WIPES every Quizora table, then fills it with a demo of the whole centre: 3 classes,
// 12 teachers, 300 students, and a quiz in every state a reviewer should see (open now,
// a 2-minute quiz for testing the timer, not open yet, draft, and closed with results).
// All names are fictional.
//
// Dates are relative to the day the seed runs, so each quiz is in the state described here
// for a few days afterwards (the upcoming one opens after 3 days); re-run it before a demo.
// The past attempts come from a fixed random seed: the same students get the same answers
// and scores on every run.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { attemptDeadline } from '../src/attempts/attempt-rules';
import { finalizeAttempt } from '../src/attempts/finalize';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

// Every seeded account uses this password. Demo data only.
const DEMO_PASSWORD = 'Quizora@2026';

const DAY_MS = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// A small seeded random number generator (mulberry32). Math.random would give a different
// demo history on every run.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(2026);
const randomInt = (below: number) => Math.floor(random() * below);

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// `days` from today, at a local time of day. The centre's lessons are in the afternoon, so
// quizzes open and close at realistic hours.
function onDay(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const TEACHERS = [
  { username: 'teacher.rana', fullName: 'رنا الخطيب' }, // maths
  { username: 'teacher.omar', fullName: 'عمر الزعبي' }, // biology, teaches in English
  { username: 'teacher.huda', fullName: 'هدى النجار' }, // Arabic
  { username: 'teacher.khaled', fullName: 'خالد العبادي' }, // physics
  { username: 'teacher.lina', fullName: 'لينا حجازي' }, // English
  // No quizzes yet: they show what a new teacher sees.
  { username: 'teacher.sami', fullName: 'سامي القضاة' },
  { username: 'teacher.maha', fullName: 'مها الرواشدة' },
  { username: 'teacher.yazan', fullName: 'يزن العتوم' },
  { username: 'teacher.rasha', fullName: 'رشا الفايز' },
  { username: 'teacher.bilal', fullName: 'بلال المومني' },
  { username: 'teacher.nadia', fullName: 'نادية الحياري' },
  { username: 'teacher.tariq', fullName: 'طارق الشوبكي' },
];

// Student names are random first + family name pairs, each pair used at most once.
// prettier-ignore
const FIRST_NAMES = [
  'ليان', 'سارة', 'مريم', 'جود', 'تالا', 'نور', 'رهف', 'دانة', 'لمى', 'هيا',
  'رزان', 'سلمى', 'جنى', 'ملك', 'شهد', 'ريم', 'بتول', 'يارا', 'لين', 'غنى',
  'حلا', 'ديما', 'سيرين', 'ميار', 'آية', 'يوسف', 'أحمد', 'زيد', 'كريم', 'حمزة',
  'عمر', 'سيف', 'مالك', 'آدم', 'محمد', 'علي', 'خالد', 'إبراهيم', 'عبدالله', 'مصطفى',
  'ليث', 'فارس', 'يزن', 'قيس', 'معاذ', 'أنس', 'بشار', 'هاشم', 'راكان', 'تيم',
];
// prettier-ignore
const FAMILY_NAMES = [
  'حداد', 'العمري', 'المصري', 'الشريف', 'القاسم', 'الحوراني', 'الرفاعي', 'عبيدات',
  'السعدي', 'الطراونة', 'البشير', 'الخوالدة', 'المجالي', 'الدويري', 'العلي', 'الحسن',
  'الكيلاني', 'الصمادي', 'النابلسي', 'الأحمد', 'الصالح', 'الشامي', 'العزام', 'بني هاني',
  'الجراح', 'الحمود', 'النعيمات', 'السلايمة', 'الرحاحلة', 'القرعان', 'الشرع', 'العموش',
  'الخلايلة', 'الحياصات', 'المعايطة', 'الربيع', 'ياسين', 'درويش', 'عودة', 'سلامة',
];
// Some families register their children's names in Latin letters, so lists mix both.
const LATIN_NAMES = [
  'Adam Haddad',
  'Lara Nassar',
  'Maya Khoury',
  'Daniel Saleh',
];

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

// What addHistory needs to know about a quiz.
const HISTORY_SELECT = {
  id: true,
  opensAt: true,
  closesAt: true,
  timeLimitMinutes: true,
  questions: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, isCorrect: true },
      },
    },
  },
} satisfies Prisma.QuizSelect;

type HistoryQuiz = Prisma.QuizGetPayload<{ select: typeof HISTORY_SELECT }>;

// The attempts students left on a quiz that has closed: most submitted, some let the time
// run out, a few never started. Each attempt is ended and scored by finalizeAttempt, the
// same code the API runs, so every score is one the app itself would have given.
//
// The first three students of each class are fixed, so the README can point at them:
// …001 submitted, …002 ran out of time, …003 never started.
async function addHistory(
  quiz: HistoryQuiz,
  students: { id: string; username: string }[],
) {
  const openDays = Math.floor(
    (quiz.closesAt.getTime() - quiz.opensAt.getTime()) / DAY_MS,
  );

  for (const student of students) {
    const inClass = Number(student.username.slice(-3));
    const roll = random();
    const outcome =
      inClass === 1
        ? 'SUBMITTED'
        : inClass === 2
          ? 'EXPIRED'
          : inClass === 3 || roll < 0.08
            ? null
            : roll < 0.16
              ? 'EXPIRED'
              : 'SUBMITTED';
    if (outcome === null) continue;

    // Started on one of the afternoons the quiz was open (it opened at 16:00).
    const startedAt = new Date(quiz.opensAt);
    startedAt.setDate(startedAt.getDate() + randomInt(openDays));
    startedAt.setHours(16 + randomInt(5), randomInt(60), randomInt(60));
    const expiresAt = attemptDeadline(
      startedAt,
      quiz.timeLimitMinutes,
      quiz.closesAt,
    );

    // How likely this student is to pick the right option; now and then they leave a
    // question blank. Someone who ran out of time only got part of the way through.
    const skill = 0.4 + random() * 0.55;
    const reached =
      outcome === 'EXPIRED'
        ? randomInt(quiz.questions.length + 1)
        : quiz.questions.length;
    const answers = quiz.questions.slice(0, reached).flatMap((question) => {
      if (random() < 0.06) return [];
      const wrong = question.options.filter((o) => !o.isCorrect);
      const option =
        random() < skill
          ? question.options.find((o) => o.isCorrect)!
          : wrong[randomInt(wrong.length)];
      return [{ questionId: question.id, optionId: option.id }];
    });

    // A submission comes some way into the time allowed, always before the deadline.
    const allowedMs = expiresAt.getTime() - startedAt.getTime();
    const submittedAt = new Date(
      startedAt.getTime() + (0.35 + random() * 0.6) * allowedMs,
    );

    await prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.create({
        data: {
          quizId: quiz.id,
          studentId: student.id,
          startedAt,
          expiresAt,
          answers: { create: answers },
        },
        select: { id: true },
      });
      await finalizeAttempt(tx, attempt.id, outcome, submittedAt);
    });
  }
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

  const [rana, omar, huda, khaled, lina] = await Promise.all(
    TEACHERS.map((t) =>
      prisma.user.create({ data: { ...t, passwordHash, role: 'TEACHER' } }),
    ),
  );

  // 100 students per class: s10a001 … s10a100, s10b001 …, s11a001 …
  const names = shuffled(
    FIRST_NAMES.flatMap((first) =>
      FAMILY_NAMES.map((family) => `${first} ${family}`),
    ),
  );
  const classLists: [typeof c10A, string[]][] = [
    [c10A, names.slice(0, 100)],
    [c10B, names.slice(100, 200)],
    [c11A, [...names.slice(200, 296), ...LATIN_NAMES]],
  ];
  for (const [klass, fullNames] of classLists) {
    await prisma.user.createMany({
      data: fullNames.map((fullName, n) => ({
        username: `s${klass.name.toLowerCase()}${String(n + 1).padStart(3, '0')}`,
        fullName,
        passwordHash,
        role: 'STUDENT' as const,
        classId: klass.id,
      })),
    });
  }
  const studentsOf = (...classIds: string[]) =>
    prisma.user.findMany({
      where: { classId: { in: classIds } },
      orderBy: { username: 'asc' },
      select: { id: true, username: true },
    });

  // Open now, Arabic, negative marking on (25% of the question's points). No attempts yet:
  // a reviewer takes it fresh and sees their own result appear on the teacher's page.
  await prisma.quiz.create({
    data: {
      title: 'اختبار الرياضيات: المعادلات الخطية',
      description: 'اختبار قصير على حل المعادلات الخطية وميل المستقيم.',
      teacherId: rana.id,
      opensAt: onDay(-1, 16),
      closesAt: onDay(14, 22),
      timeLimitMinutes: 20,
      negativeMarkPercent: 25,
      publishedAt: onDay(-2, 18),
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
            // Written out, not as "(2, 3)": a pair of numbers shows left to right, while the
            // equation above reads right to left, so the order would be ambiguous.
            options: [
              'س = 2، ص = 3',
              'س = 1، ص = 3',
              'س = 0، ص = 1',
              'س = 3، ص = 4',
            ],
            correctIndex: 0,
          },
        ]),
      },
    },
  });

  // Open now, English content, no negative marking.
  await prisma.quiz.create({
    data: {
      title: 'Biology: The Cell',
      description: 'Cell structure and organelles.',
      teacherId: omar.id,
      opensAt: onDay(-1, 16),
      closesAt: onDay(14, 22),
      timeLimitMinutes: 15,
      publishedAt: onDay(-2, 19),
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

  // Open now for every class, with a 2-minute time limit: a reviewer can watch the timer
  // run out without waiting. A wrong answer costs half the question's points.
  await prisma.quiz.create({
    data: {
      title: 'مراجعة سريعة: مفردات إنجليزية',
      description:
        'مراجعة قصيرة مدتها دقيقتان فقط. الإجابة الخاطئة تخصم نصف علامة السؤال.',
      teacherId: lina.id,
      opensAt: onDay(-1, 16),
      closesAt: onDay(30, 22),
      timeLimitMinutes: 2,
      negativeMarkPercent: 50,
      publishedAt: onDay(-1, 15),
      classes: {
        create: [
          { classId: c10A.id },
          { classId: c10B.id },
          { classId: c11A.id },
        ],
      },
      questions: {
        create: questionsData([
          {
            text: 'What is the opposite of "ancient"?',
            points: 1,
            options: ['modern', 'old', 'huge', 'quiet'],
            correctIndex: 0,
          },
          {
            text: 'What does "reliable" mean?',
            points: 1,
            options: [
              'expensive',
              'can be trusted',
              'very fast',
              'easy to break',
            ],
            correctIndex: 1,
          },
          {
            text: 'Which word means the same as "enormous"?',
            points: 2,
            options: ['tiny', 'narrow', 'huge', 'early'],
            correctIndex: 2,
          },
          {
            text: 'Complete the sentence: "She has lived here ___ 2019."',
            points: 2,
            options: ['for', 'during', 'at', 'since'],
            correctIndex: 3,
          },
        ]),
      },
    },
  });

  // Published but not open yet: students see when it opens, and can't start it.
  await prisma.quiz.create({
    data: {
      title: 'اختبار اللغة العربية: الإملاء',
      description: 'همزة الوصل والقطع، والتاء المربوطة، والألف المقصورة.',
      teacherId: huda.id,
      opensAt: onDay(3, 16),
      closesAt: onDay(10, 22),
      timeLimitMinutes: 15,
      publishedAt: onDay(-1, 12),
      classes: {
        create: [
          { classId: c10A.id },
          { classId: c10B.id },
          { classId: c11A.id },
        ],
      },
      questions: {
        create: questionsData([
          {
            text: 'اختر الكتابة الصحيحة:',
            points: 1,
            options: ['إستماع', 'استماع', 'أستماع', 'آستماع'],
            correctIndex: 1,
          },
          {
            text: 'أي الكلمات التالية تنتهي بتاء مربوطة؟',
            points: 1,
            options: ['مدرسة', 'بيت', 'وقت', 'صوت'],
            correctIndex: 0,
          },
          {
            text: 'في أي كلمة كُتبت الهمزة على نبرة (ياء)؟',
            points: 2,
            options: ['سأل', 'رؤوف', 'سُئِل', 'يسأل'],
            correctIndex: 2,
          },
          {
            text: 'أي الكلمات التالية تنتهي بألف مقصورة؟',
            points: 2,
            options: ['دعا', 'مشى', 'سما', 'علا'],
            correctIndex: 1,
          },
          {
            text: 'أي الجمل التالية مكتوبة بشكل صحيح؟',
            points: 2,
            options: [
              'ذهبتُ إلى المدرسه',
              'ذهبتُ الى المدرسة',
              'ذهبتُ إلى المدرسة',
              'ذهبتو إلى المدرسة',
            ],
            correctIndex: 2,
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
      opensAt: onDay(7, 16),
      closesAt: onDay(14, 22),
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

  // Closed last week, with results: negative marking on (25%).
  const fractions = await prisma.quiz.create({
    data: {
      title: 'اختبار الرياضيات: الكسور والنسب المئوية',
      description: 'الكسور العادية والعشرية، والنسب المئوية، والتناسب.',
      teacherId: rana.id,
      opensAt: onDay(-12, 16),
      closesAt: onDay(-5, 22),
      timeLimitMinutes: 25,
      negativeMarkPercent: 25,
      publishedAt: onDay(-13, 18),
      classes: { create: [{ classId: c10A.id }, { classId: c10B.id }] },
      questions: {
        create: questionsData([
          {
            text: 'ما ناتج 1/2 + 1/4؟',
            points: 1,
            options: ['3/4', '2/6', '1/6', '2/4'],
            correctIndex: 0,
          },
          {
            text: 'أي كسر يساوي العدد العشري 0.2؟',
            points: 1,
            options: ['1/2', '1/5', '2/5', '1/20'],
            correctIndex: 1,
          },
          {
            text: 'ما 25% من 80؟',
            points: 1,
            options: ['25', '15', '20', '40'],
            correctIndex: 2,
          },
          {
            text: 'ما ناتج 2/3 × 3/4؟',
            points: 2,
            options: ['5/7', '6/7', '1/3', '1/2'],
            correctIndex: 3,
          },
          {
            text: 'قميص سعره 40 دينارًا عليه خصم 10%. كم يصبح سعره؟',
            points: 2,
            options: ['36 دينارًا', '30 دينارًا', '44 دينارًا', '4 دنانير'],
            correctIndex: 0,
          },
          {
            text: 'أي الكسور التالية هو الأكبر؟',
            points: 2,
            options: ['3/5', '2/3', '5/8', '1/2'],
            correctIndex: 1,
          },
          {
            text: 'ما النسبة المئوية التي يساويها الكسر 3/8؟',
            points: 2,
            options: ['38%', '30%', '37.5%', '83%'],
            correctIndex: 2,
          },
          {
            text: 'في صف 25 طالبًا، نسبة البنين إلى البنات 2 إلى 3. كم عدد البنات؟',
            points: 3,
            options: ['10', '12', '15', '20'],
            correctIndex: 2,
          },
        ]),
      },
    },
    select: HISTORY_SELECT,
  });
  await addHistory(fractions, await studentsOf(c10A.id, c10B.id));

  // Closed, with results: no negative marking.
  const motion = await prisma.quiz.create({
    data: {
      title: 'اختبار الفيزياء: الحركة في خط مستقيم',
      description: 'السرعة المتوسطة، والتسارع، والكميات المتجهة.',
      teacherId: khaled.id,
      opensAt: onDay(-9, 16),
      closesAt: onDay(-2, 22),
      timeLimitMinutes: 20,
      publishedAt: onDay(-10, 18),
      classes: { create: [{ classId: c11A.id }] },
      questions: {
        create: questionsData([
          {
            text: 'ما وحدة قياس السرعة في النظام الدولي للوحدات؟',
            points: 1,
            options: ['م/ث', 'كم/س', 'م/ث²', 'نيوتن'],
            correctIndex: 0,
          },
          {
            text: 'قطعت سيارة 120 كم في ساعتين. ما سرعتها المتوسطة؟',
            points: 1,
            options: ['240 كم/س', '60 كم/س', '120 كم/س', '30 كم/س'],
            correctIndex: 1,
          },
          {
            text: 'ما الكمية الفيزيائية التي تصف معدل تغيّر السرعة؟',
            points: 2,
            options: ['الإزاحة', 'القوة', 'التسارع', 'الزخم'],
            correctIndex: 2,
          },
          {
            text: 'جسم يتحرك بسرعة ثابتة في خط مستقيم. ما تسارعه؟',
            points: 2,
            options: ['يزداد', 'يتناقص', 'يساوي سرعته', 'صفر'],
            correctIndex: 3,
          },
          {
            text: 'بدأت دراجة الحركة من السكون بتسارع 2 م/ث² مدة 5 ثوانٍ. ما سرعتها في النهاية؟',
            points: 2,
            options: ['10 م/ث', '7 م/ث', '2.5 م/ث', '25 م/ث'],
            correctIndex: 0,
          },
          {
            text: 'أي مما يلي كمية متجهة؟',
            points: 3,
            options: ['الكتلة', 'الزمن', 'الإزاحة', 'المسافة'],
            correctIndex: 2,
          },
        ]),
      },
    },
    select: HISTORY_SELECT,
  });
  await addHistory(motion, await studentsOf(c11A.id));

  const counts = {
    classes: await prisma.class.count(),
    teachers: await prisma.user.count({ where: { role: 'TEACHER' } }),
    students: await prisma.user.count({ where: { role: 'STUDENT' } }),
    quizzes: await prisma.quiz.count(),
    questions: await prisma.question.count(),
    submitted: await prisma.quizAttempt.count({
      where: { status: 'SUBMITTED' },
    }),
    expired: await prisma.quizAttempt.count({ where: { status: 'EXPIRED' } }),
  };
  console.log('Seeded:', counts);
  console.log(
    `All accounts use the password "${DEMO_PASSWORD}" (e.g. teacher.rana, s10a001).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
