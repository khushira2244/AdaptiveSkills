import type { ConceptLesson, LearningUnit, MarkerType } from "@adaptive-labs/contracts";

export const markerForAction = {
  know: "I_KNOW_THIS",
  doubt: "DONT_UNDERSTAND",
  deeper: "GO_DEEPER",
} as const satisfies Record<string, MarkerType>;

export function isUnitOpen(unit: LearningUnit) {
  return unit.status !== "LOCKED";
}

export function pickUnit(units: LearningUnit[], requestedUnitId: string | null, nextUnitId: string | null) {
  const requested = units.find(unit => unit.unitId === requestedUnitId && isUnitOpen(unit));
  if (requested) return requested;
  const next = units.find(unit => unit.unitId === nextUnitId && isUnitOpen(unit));
  return next ?? units.find(isUnitOpen) ?? null;
}

export function pickLessonIndex(lessons: ConceptLesson[], requestedConceptId: string | null) {
  const requested = lessons.findIndex(lesson => lesson.conceptId === requestedConceptId);
  if (requested >= 0) return requested;
  const incomplete = lessons.findIndex(lesson => !lesson.completed);
  return incomplete >= 0 ? incomplete : Math.max(0, lessons.length - 1);
}

export function sectionIds(lesson: ConceptLesson) {
  return [...lesson.blocks.map(block => block.blockId), `recap:${lesson.lessonId}`];
}

export function restoredSections(lesson: ConceptLesson) {
  const ids = sectionIds(lesson);
  if (lesson.completed) return ids;
  return ids.slice(0, Math.min(ids.length, Math.max(1, lesson.lastBlockPosition || 1)));
}

export function selectionContext(selectedText: string, containerText: string, limit = 500) {
  const selected = selectedText.trim().slice(0, limit);
  const source = containerText.replace(/\s+/g, " ").trim();
  const position = source.indexOf(selected);
  if (position < 0) return { selectedText: selected, sourceContext: source.slice(0, 2000) };
  return {
    selectedText: selected,
    sourceContext: source.slice(Math.max(0, position - 120), Math.min(source.length, position + selected.length + 120)),
  };
}

export function sourceRoute(unitId: string | null, conceptId: string | null) {
  if (!unitId) return "/learn";
  const search = new URLSearchParams({ unit: unitId });
  if (conceptId) search.set("concept", conceptId);
  return `/learn?${search.toString()}`;
}
