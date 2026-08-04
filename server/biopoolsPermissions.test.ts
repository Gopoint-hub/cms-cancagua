import { describe, expect, it } from "vitest";
import { canAccessCmsPath, getDefaultCmsPermissions } from "../shared/permissions";

describe("Biopiscinas permissions", () => {
  it("gives reception agenda and blocking access without settings access", () => {
    const permissions = getDefaultCmsPermissions("cancagua_staff");
    expect(permissions).toContain("module.biopools");
    expect(permissions).toContain("biopools.manage_agenda");
    expect(permissions).toContain("biopools.manage_blocks");
    expect(permissions).not.toContain("biopools.manage_settings");
    const explicit = JSON.stringify(permissions);
    expect(canAccessCmsPath("cancagua_staff", "/cms/biopiscinas/agenda", false, explicit)).toBe(true);
    expect(canAccessCmsPath("cancagua_staff", "/cms/biopiscinas/configuracion", false, explicit)).toBe(false);
  });
});
