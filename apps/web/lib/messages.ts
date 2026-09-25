// The API answers in English with a fixed set of messages. The interface is Arabic, so the
// known ones are translated here; anything unknown falls back to a message for its status.

const KNOWN_MESSAGES: Record<string, string> = {
  // Publishing (POST /teacher/quizzes/:id/publish)
  "Add at least one question": "أضف سؤالاً واحداً على الأقل.",
  "Assign the quiz to at least one class": "اختر صفاً واحداً على الأقل.",
  "The closing date has already passed":
    "موعد الإغلاق مضى. اختر موعد إغلاق لاحقاً ثم انشر الاختبار.",
  // Quiz settings
  "closesAt must be after opensAt": "يجب أن يكون موعد الإغلاق بعد موعد الفتح.",
  "One or more classes do not exist": "أحد الصفوف المختارة لم يعد موجوداً.",
  // Questions
  "A question must have exactly one correct option":
    "اختر إجابة صحيحة واحدة فقط.",
  "Options of a question must be different":
    "يجب أن تكون الخيارات مختلفة عن بعضها.",
  "A published quiz must keep at least one question":
    "لا يمكن حذف السؤال الوحيد في اختبار منشور.",
  "A quiz can have at most 100 questions":
    "لا يمكن أن يزيد الاختبار عن 100 سؤال.",
  "Students have already started this quiz, so its questions, points, time limit and negative marking can no longer change":
    "بدأ الطلاب هذا الاختبار، لذلك لم يعد ممكناً تغيير الأسئلة أو العلامات أو المدة أو العلامة السالبة.",
  // Taking a quiz (student)
  "This quiz is not open yet": "لم يُفتح هذا الاختبار بعد.",
  "This quiz is closed": "أُغلق هذا الاختبار.",
  "You have already taken this quiz":
    "قدّمت هذا الاختبار من قبل، ولكل طالب محاولة واحدة.",
  "Time is up for this attempt": "انتهى وقت الاختبار.",
  "This attempt has already been submitted": "سلّمت هذا الاختبار من قبل.",
  "This option does not belong to the question":
    "هذا الخيار ليس من خيارات السؤال.",
  "Attempt not found": "لم تبدأ هذا الاختبار بعد.",
  // Not found
  "Quiz not found": "الاختبار غير موجود.",
  "Question not found": "السؤال غير موجود.",
};

const QUESTION_PROBLEM =
  /^Question (\d+) needs at least two options and exactly one correct answer$/;

export function translateApiMessage(message: string): string | null {
  if (message in KNOWN_MESSAGES) return KNOWN_MESSAGES[message];
  const question = QUESTION_PROBLEM.exec(message);
  if (question) {
    return `السؤال ${question[1]} يحتاج خيارين على الأقل وإجابة صحيحة واحدة.`;
  }
  return null;
}

export function statusMessage(status: number): string {
  if (status === 0) return "تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.";
  if (status === 400)
    return "بعض البيانات غير صحيحة. راجع الحقول وحاول مرة أخرى.";
  if (status === 403) return "ليست لديك صلاحية للقيام بهذا.";
  if (status === 404) return "العنصر المطلوب غير موجود.";
  if (status === 409) return "لا يمكن تنفيذ هذا التغيير الآن.";
  return "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.";
}
