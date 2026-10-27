export function validateDraft(draft) {
  const issues = [], warnings = [];
  if (!draft || typeof draft !== "object") return {status:"needs_review",issues:["Draft is not an object."],warnings};
  for (const key of ["title","classLevel","subject","chapter","language","contentType","content"]) {
    if (!String(draft[key] ?? "").trim()) issues.push(`Missing required field: ${key}`);
  }
  const level = Number(draft.classLevel);
  if (!Number.isInteger(level) || level < 6 || level > 12) issues.push("Class must be 6–12.");
  if (!["English","Hindi","Odia"].includes(draft.language)) issues.push("Language must be English, Hindi, or Odia.");
  if (!["notes","mcq_set","short_answers","long_answers","worksheet","revision_test"].includes(draft.contentType)) issues.push("Unsupported content type.");
  const content = String(draft.content ?? "");
  if (content.length < 120) warnings.push("Content is very short; review completeness.");
  if (content.length > 30000) issues.push("Content exceeds 30,000 characters.");
  if (/\b(TODO|INSERT HERE|lorem ipsum)\b/i.test(content)) warnings.push("Placeholder text detected.");
  if (Array.isArray(draft.questions)) {
    const qs = draft.questions.map(q=>String(q.question??"").toLowerCase().replace(/\W/g,"")).filter(Boolean);
    if (new Set(qs).size !== qs.length) warnings.push("Duplicate questions may be present.");
    draft.questions.forEach((q,i)=>{
      if (!String(q.question??"").trim()) issues.push(`Question ${i+1} has no text.`);
      if (q.options && (!Array.isArray(q.options) || q.options.length < 2)) issues.push(`Question ${i+1} has too few options.`);
      if (q.options && q.answer && !q.options.some(o=>String(o).trim()===String(q.answer).trim())) warnings.push(`Question ${i+1}: verify answer matches an option.`);
      if (q.answer && !String(q.explanation??"").trim()) warnings.push(`Question ${i+1}: add an explanation.`);
    });
  }
  return {status:issues.length?"needs_review":"draft",issues,warnings};
}