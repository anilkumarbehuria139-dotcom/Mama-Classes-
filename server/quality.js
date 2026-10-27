
export function validateDraft(draft) {
  const issues = [];
  const content = String(draft.content || "").trim();
  const questions = Array.isArray(draft.questions)
    ? draft.questions
    : [];
  const answerKey = String(draft.answerKey || "").trim();

  if (content.length < 100) {
    issues.push("Content is too short; teacher review is required.");
  }

  if (!questions.length) {
    issues.push("No questions were generated.");
  }

  if (!answerKey) {
    issues.push("Answer key is missing.");
  }

  const normalized = content.toLowerCase().replace(/\s+/g, " ");
  if (normalized.length > 0 && normalized.length < 300) {
    issues.push("Content may be incomplete.");
  }

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];

    if (!question || typeof question !== "object") {
      issues.push(`Question ${i + 1} has an invalid format.`);
      continue;
    }

    if (!String(question.question || question.text || "").trim()) {
      issues.push(`Question ${i + 1} has no question text.`);
    }

    if (Array.isArray(question.options) &&
        question.options.length < 2) {
      issues.push(`Question ${i + 1} has too few options.`);
    }
  }

  return {
    passed: issues.length === 0,
    issues
  };
}
