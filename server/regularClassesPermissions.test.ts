import { describe, expect, it } from "vitest";
import {
  CANCAGUA_STAFF_ROLE,
  MASSAGE_THERAPIST_ROLE,
  canAccessCmsPath,
  hasRegularClassesAccess,
  hasRegularClassesAdminAccess,
  hasRegularClassesReceptionAccess,
  hasRegularClassesTeacherAccess,
} from "@shared/permissions";

describe("regular classes permissions", () => {
  it("keeps administration restricted to superadmin and admin", () => {
    expect(hasRegularClassesAdminAccess("super_admin")).toBe(true);
    expect(hasRegularClassesAdminAccess("admin")).toBe(true);
    expect(hasRegularClassesAdminAccess("editor")).toBe(false);
    expect(hasRegularClassesAdminAccess(CANCAGUA_STAFF_ROLE)).toBe(false);
  });

  it("gives reception access only to students and payments", () => {
    expect(hasRegularClassesReceptionAccess(CANCAGUA_STAFF_ROLE)).toBe(true);
    expect(canAccessCmsPath(CANCAGUA_STAFF_ROLE, "/cms/clases-regulares/alumnos")).toBe(true);
    expect(canAccessCmsPath(CANCAGUA_STAFF_ROLE, "/cms/clases-regulares/liquidaciones")).toBe(false);
    expect(canAccessCmsPath(CANCAGUA_STAFF_ROLE, "/cms/clases-regulares/asistencia")).toBe(false);
  });

  it("allows a massage therapist to accumulate regular-class teacher access", () => {
    expect(hasRegularClassesTeacherAccess(MASSAGE_THERAPIST_ROLE, 1)).toBe(true);
    expect(hasRegularClassesAccess(MASSAGE_THERAPIST_ROLE, 1)).toBe(true);
    expect(canAccessCmsPath(MASSAGE_THERAPIST_ROLE, "/cms/masajes", 1)).toBe(true);
    expect(canAccessCmsPath(MASSAGE_THERAPIST_ROLE, "/cms/clases-regulares/asistencia", 1)).toBe(true);
    expect(canAccessCmsPath(MASSAGE_THERAPIST_ROLE, "/cms/clases-regulares/alumnos", 1)).toBe(false);
    expect(canAccessCmsPath("user", "/cms/clases-regulares/asistencia", 0)).toBe(false);
  });
});
