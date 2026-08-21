import { describe, expect, it } from "vitest";
import {
  assertRegularClassOperationsResourceAccess,
  canAccessRegularClassOperationsResource,
} from "./regularClassesOperationsAccess";

describe("regular classes Operations 360 resource access", () => {
  const teacher = {
    role: "user",
    permissions: JSON.stringify([
      "module.regular_classes",
      "regular_classes.attendance",
    ]),
  };
  const membership = { kind: "regular_class_membership" as const };
  const ownSession = { kind: "regular_class" as const, teacherId: 17 };
  const otherSchedule = {
    kind: "regular_class_schedule" as const,
    teacherId: 29,
  };

  it("allows reception and administration to open memberships", () => {
    expect(
      canAccessRegularClassOperationsResource(
        { role: "cancagua_staff" },
        membership
      )
    ).toBe(true);
    expect(
      canAccessRegularClassOperationsResource({ role: "admin" }, membership)
    ).toBe(true);
    expect(
      canAccessRegularClassOperationsResource(
        {
          role: "user",
          permissions: JSON.stringify(["regular_classes.students"]),
        },
        membership
      )
    ).toBe(true);
  });

  it("does not let a teacher open arbitrary student memberships", () => {
    expect(
      canAccessRegularClassOperationsResource({ role: "user" }, membership, 17)
    ).toBe(false);
    expect(() =>
      assertRegularClassOperationsResourceAccess(
        { role: "massage_therapist" },
        membership,
        17
      )
    ).toThrowError(/No tienes permisos/);
  });

  it("limits teachers to sessions and schedules assigned to their profile", () => {
    expect(
      canAccessRegularClassOperationsResource(teacher, ownSession, 17)
    ).toBe(true);
    expect(
      canAccessRegularClassOperationsResource(teacher, otherSchedule, 17)
    ).toBe(false);
    expect(
      canAccessRegularClassOperationsResource(teacher, ownSession, null)
    ).toBe(false);
  });

  it("revokes session detail when a linked teacher loses module or attendance access", () => {
    expect(
      canAccessRegularClassOperationsResource(
        {
          role: "user",
          permissions: JSON.stringify(["module.regular_classes"]),
        },
        ownSession,
        17
      )
    ).toBe(false);
    expect(
      canAccessRegularClassOperationsResource(
        {
          role: "user",
          permissions: JSON.stringify(["regular_classes.attendance"]),
        },
        ownSession,
        17
      )
    ).toBe(false);
  });

  it("keeps all sessions available to administration, not reception alone", () => {
    expect(
      canAccessRegularClassOperationsResource(
        { role: "admin" },
        otherSchedule,
        null
      )
    ).toBe(true);
    expect(
      canAccessRegularClassOperationsResource(
        { role: "cancagua_staff" },
        ownSession,
        null
      )
    ).toBe(false);
  });
});
