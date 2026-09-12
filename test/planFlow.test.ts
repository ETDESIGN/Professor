// planFlow — multi-plan flow resolution precedence (spec 2026-09-13).
import { describe, it, expect } from 'vitest';
import { resolveLaunchFlow, shouldMirrorToUnitFlow, toUnitPlan } from '../services/planFlow';

describe('resolveLaunchFlow', () => {
  const cls = [{ type: 'CLASS' }];
  const plan = [{ type: 'PLAN' }];
  const unit = [{ type: 'UNIT' }];

  it('class plan wins over unit plan and unit flow', () => {
    expect(resolveLaunchFlow({ classPlanFlow: cls, unitPlanFlow: plan, unitFlow: unit })).toBe(cls);
  });

  it('launched unit plan wins over the unit flow mirror', () => {
    expect(resolveLaunchFlow({ unitPlanFlow: plan, unitFlow: unit })).toBe(plan);
  });

  it('falls back to the unit flow (default-plan mirror / old sessions)', () => {
    expect(resolveLaunchFlow({ unitFlow: unit })).toBe(unit);
    expect(resolveLaunchFlow({})).toEqual([]);
  });

  it('treats empty arrays as absent', () => {
    expect(resolveLaunchFlow({ classPlanFlow: [], unitPlanFlow: [], unitFlow: unit })).toBe(unit);
  });
});

describe('shouldMirrorToUnitFlow', () => {
  it('mirrors only the default plan', () => {
    expect(shouldMirrorToUnitFlow({ isDefault: true })).toBe(true);
    expect(shouldMirrorToUnitFlow({ isDefault: false })).toBe(false);
  });
});

describe('toUnitPlan', () => {
  it('maps a DB row defensively', () => {
    const p = toUnitPlan({ id: 'p1', unit_id: 'u1', title: 'Lesson 2', flow: null, order_index: 3, is_default: false });
    expect(p.flow).toEqual([]);
    expect(p.isDefault).toBe(false);
    expect(p.orderIndex).toBe(3);
  });
});
