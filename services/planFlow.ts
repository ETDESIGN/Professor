// planFlow — multi-plan-per-unit flow resolution (spec 2026-09-13
// docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md).
// Pure TS: vitest covers it from test/planFlow.test.ts. units.flow remains
// the MIRROR of the default plan — it is the last-resort layer here.

export interface UnitPlan {
  id: string;
  unitId: string;
  title: string;
  flow: any[];
  orderIndex: number;
  isDefault: boolean;
}

export interface UnitPlanRow {
  id: string;
  unit_id: string;
  title: string;
  flow: any[] | null;
  order_index: number;
  is_default: boolean;
}

export function toUnitPlan(row: UnitPlanRow): UnitPlan {
  return {
    id: String(row.id),
    unitId: String(row.unit_id),
    title: String(row.title ?? 'Lesson plan'),
    flow: Array.isArray(row.flow) ? row.flow : [],
    orderIndex: Number(row.order_index ?? 0),
    isDefault: !!row.is_default,
  };
}

const nonEmpty = (f: any[] | null | undefined): any[] | null =>
  Array.isArray(f) && f.length > 0 ? f : null;

/**
 * Session flow precedence (spec 2026-09-13): a class-bound session serves the
 * CLASS plan's flow; otherwise the LAUNCHED unit plan (Lesson 2 etc.); the
 * unit's own flow (default-plan mirror) is the fallback for old sessions.
 */
export function resolveLaunchFlow(input: {
  classPlanFlow?: any[] | null;
  unitPlanFlow?: any[] | null;
  unitFlow?: any[] | null;
}): any[] {
  return nonEmpty(input.classPlanFlow) ?? nonEmpty(input.unitPlanFlow) ?? nonEmpty(input.unitFlow) ?? [];
}

/**
 * Default-plan mirroring rule: saving a plan's flow must write through to
 * units.flow when (and only when) the plan is the default — that mirror is
 * what every legacy consumer (orchestrate-lesson, generate-media, class-plan
 * sync) still reads.
 */
export function shouldMirrorToUnitFlow(plan: Pick<UnitPlan, 'isDefault'>): boolean {
  return plan.isDefault;
}
