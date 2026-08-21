import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { regularClassTeachers } from "../drizzle/schema";
import {
  hasCmsPermission,
  hasRegularClassesAdminAccess,
  hasRegularClassesReceptionAccess,
  type PermissionUser,
} from "../shared/permissions";
import { getDb } from "./db";

type RegularClassesDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type RegularClassOperationsResource =
  | { kind: "regular_class_membership" }
  | {
      kind: "regular_class" | "regular_class_schedule";
      teacherId: number;
    };

/**
 * Resuelve el perfil docente activo vinculado a una cuenta del CMS.
 *
 * El vínculo por `cmsUserId` es la fuente de verdad para limitar sesiones: el
 * indicador `regularClassesTeacher` habilita la interfaz, pero no identifica a
 * qué profesor pertenece una sesión concreta.
 */
export async function getActiveRegularClassTeacherForUser(
  userId: number,
  database?: RegularClassesDb
) {
  const db = database ?? (await getDb());
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Base de datos no disponible",
    });
  }
  const [teacher] = await db
    .select()
    .from(regularClassTeachers)
    .where(
      and(
        eq(regularClassTeachers.cmsUserId, userId),
        eq(regularClassTeachers.active, 1)
      )
    )
    .limit(1);
  return teacher ?? null;
}

/**
 * Replica los límites de los routers nativos de Clases Regulares:
 *
 * - planes/membresías pertenecen a Students: recepción, admin o su permiso
 *   granular explícito;
 * - sesiones pertenecen a Attendance: admin o el profesor vinculado y dueño;
 * - tener visible el módulo, por sí solo, nunca autoriza un recurso concreto.
 */
export function canAccessRegularClassOperationsResource(
  user: PermissionUser,
  resource: RegularClassOperationsResource,
  viewerTeacherId: number | null = null
): boolean {
  if (resource.kind === "regular_class_membership") {
    return (
      hasRegularClassesReceptionAccess(user.role) ||
      hasCmsPermission(user, "regular_classes.students")
    );
  }
  if (hasRegularClassesAdminAccess(user.role)) return true;
  return (
    hasCmsPermission(user, "module.regular_classes") &&
    hasCmsPermission(user, "regular_classes.attendance") &&
    viewerTeacherId !== null &&
    viewerTeacherId === resource.teacherId
  );
}

export function assertRegularClassOperationsResourceAccess(
  user: PermissionUser,
  resource: RegularClassOperationsResource,
  viewerTeacherId: number | null = null
): void {
  if (
    !canAccessRegularClassOperationsResource(user, resource, viewerTeacherId)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "No tienes permisos para abrir este registro de Clases Regulares",
    });
  }
}
