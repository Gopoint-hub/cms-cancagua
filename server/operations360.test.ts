import { describe, expect, it } from "vitest";
import { buildClientKey } from "./operations360Router";
import { canAccessCmsPath } from "../shared/permissions";

describe("Cliente 360", () => {
  it("prioriza correo normalizado para unir historiales", () => {
    expect(buildClientKey({ email: " Cliente@Cancagua.cl ", phone: "+56 9 1111 2222" }))
      .toBe("email:cliente@cancagua.cl");
  });

  it("usa teléfono cuando no existe correo", () => {
    expect(buildClientKey({ phone: "+56 9 1111 2222", name: "Cliente" }))
      .toBe("phone:56911112222");
  });
});

describe("acceso a vistas 360", () => {
  it("permite calendario con acceso a cualquier módulo operativo", () => {
    const permissions = JSON.stringify(["module.biopools"]);
    expect(canAccessCmsPath("editor", "/cms/calendario", false, permissions)).toBe(true);
    expect(canAccessCmsPath("editor", "/cms/clientes-360", false, permissions)).toBe(false);
  });

  it("requiere permiso de clientes para Cliente 360", () => {
    const permissions = JSON.stringify(["module.biopools", "biopools.view_clients"]);
    expect(canAccessCmsPath("editor", "/cms/clientes-360", false, permissions)).toBe(true);
  });

  it("reserva el Dashboard BI exclusivamente para superadministradores", () => {
    const permissions = JSON.stringify(["module.b2c", "biopools.view_clients"]);
    expect(canAccessCmsPath("admin", "/cms/clientes-360/dashboard-bi", false, permissions)).toBe(false);
    expect(canAccessCmsPath("super_admin", "/cms/clientes-360/dashboard-bi", false, permissions)).toBe(true);
  });
});
