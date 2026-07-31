import { eq, sql } from "drizzle-orm";
import {
  regularClassDisciplines,
  regularClassPlans,
  regularClassSchedules,
  regularClassTeacherAgreements,
  regularClassTeachers,
} from "../drizzle/schema";
import { getDb } from "./db";

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS regular_class_teachers (
    id int AUTO_INCREMENT PRIMARY KEY, cms_user_id int NULL, name varchar(160) NOT NULL,
    email varchar(320) NULL, phone varchar(40) NULL, bio text NULL, image_url text NULL,
    color varchar(20) NOT NULL DEFAULT '#648596', active int NOT NULL DEFAULT 1,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY regular_class_teachers_cms_user_unique (cms_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_teacher_agreements (
    id int AUTO_INCREMENT PRIMARY KEY, teacher_id int NOT NULL, teacher_share_bps int NOT NULL,
    document_type enum('pending','honorarium_receipt','exempt_invoice','taxable_invoice','none') NOT NULL DEFAULT 'pending',
    withholding_bps int NOT NULL DEFAULT 1525, vat_bps int NOT NULL DEFAULT 1900,
    valid_from date NOT NULL, valid_to date NULL, notes text NULL, created_by_user_id int NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX regular_class_agreements_teacher_date_idx (teacher_id, valid_from)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_disciplines (
    id int AUTO_INCREMENT PRIMARY KEY, name varchar(180) NOT NULL, short_description varchar(300) NULL,
    description text NULL, image_url text NULL, location varchar(180) NULL, capacity int NULL,
    active int NOT NULL DEFAULT 1, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_schedules (
    id int AUTO_INCREMENT PRIMARY KEY, discipline_id int NOT NULL, teacher_id int NOT NULL,
    day_of_week int NOT NULL, start_time varchar(5) NOT NULL, end_time varchar(5) NOT NULL,
    valid_from date NOT NULL, valid_to date NULL, active int NOT NULL DEFAULT 1,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX regular_class_schedules_day_idx (day_of_week, active)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_sessions (
    id int AUTO_INCREMENT PRIMARY KEY, schedule_id int NULL, discipline_id int NOT NULL,
    teacher_id int NOT NULL, session_date date NOT NULL, start_time varchar(5) NOT NULL,
    end_time varchar(5) NOT NULL, status enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
    notes text NULL, closed_at timestamp NULL, closed_by_user_id int NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY regular_class_session_occurrence_unique (schedule_id, session_date),
    INDEX regular_class_sessions_date_teacher_idx (session_date, teacher_id)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_plans (
    id int AUTO_INCREMENT PRIMARY KEY, code varchar(30) NOT NULL UNIQUE, name varchar(100) NOT NULL,
    price_clp int NOT NULL, credits_per_period int NOT NULL, benefits text NULL,
    display_order int NOT NULL DEFAULT 0, active int NOT NULL DEFAULT 1,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_students (
    id int AUTO_INCREMENT PRIMARY KEY, first_name varchar(120) NOT NULL, last_name varchar(120) NULL,
    email varchar(320) NULL, phone varchar(40) NULL,
    status enum('prospect','active','inactive') NOT NULL DEFAULT 'prospect',
    source enum('teacher','reception','admin','web') NOT NULL DEFAULT 'admin',
    communications_consent int NOT NULL DEFAULT 0, notes text NULL, created_by_user_id int NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX regular_class_students_email_idx (email), INDEX regular_class_students_phone_idx (phone)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_memberships (
    id int AUTO_INCREMENT PRIMARY KEY, student_id int NOT NULL, plan_id int NOT NULL,
    period_start date NOT NULL, period_end date NOT NULL, price_paid_clp int NOT NULL,
    original_amount_clp int NOT NULL, discount_amount_clp int NOT NULL DEFAULT 0,
    discount_code_id int NULL, discount_code varchar(50) NULL,
    credits_total int NOT NULL,
    status enum('pending_payment','active','postponed','completed','cancelled') NOT NULL DEFAULT 'pending_payment',
    payment_status enum('pending','paid','refunded') NOT NULL DEFAULT 'pending',
    payment_method varchar(60) NULL, payment_reference varchar(160) NULL, paid_at timestamp NULL,
    carried_from_membership_id int NULL, carried_to_membership_id int NULL, notes text NULL,
    created_by_user_id int NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX regular_class_memberships_student_period_idx (student_id, period_start, period_end)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_attendances (
    id int AUTO_INCREMENT PRIMARY KEY, session_id int NOT NULL, student_id int NOT NULL,
    membership_id int NULL, status enum('present','pending_payment','void') NOT NULL DEFAULT 'present',
    notes text NULL, marked_by_user_id int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY regular_class_attendance_session_student_unique (session_id, student_id),
    INDEX regular_class_attendance_membership_idx (membership_id, status)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_payment_invitations (
    id int AUTO_INCREMENT PRIMARY KEY, student_id int NOT NULL, token varchar(64) NOT NULL UNIQUE,
    status enum('pending','sent','opened','completed','expired') NOT NULL DEFAULT 'pending',
    payment_url text NULL, sent_at timestamp NULL, opened_at timestamp NULL, completed_at timestamp NULL,
    expires_at timestamp NOT NULL, created_by_user_id int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_closures (
    id int AUTO_INCREMENT PRIMARY KEY, period_start date NOT NULL, period_end date NOT NULL,
    status enum('draft','closed') NOT NULL DEFAULT 'draft', snapshot mediumtext NULL, notes text NULL,
    created_by_user_id int NOT NULL, closed_by_user_id int NULL, closed_at timestamp NULL,
    reopened_by_user_id int NULL, reopened_at timestamp NULL, reopen_reason text NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY regular_class_closures_period_unique (period_start, period_end)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_audit (
    id int AUTO_INCREMENT PRIMARY KEY, entity_type varchar(60) NOT NULL, entity_id int NOT NULL,
    action varchar(60) NOT NULL, detail text NULL, user_id int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX regular_class_audit_entity_idx (entity_type, entity_id)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_settings (
    \`key\` varchar(100) PRIMARY KEY, \`value\` text NOT NULL,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_benefit_entitlements (
    id int AUTO_INCREMENT PRIMARY KEY, student_id int NOT NULL, membership_id int NOT NULL,
    benefit_code varchar(80) NOT NULL, benefit_name varchar(220) NOT NULL, eligible_at date NOT NULL,
    status enum('available','notified','redeemed','expired') NOT NULL DEFAULT 'available',
    notified_at timestamp NULL, redeemed_at timestamp NULL, notes text NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY regular_class_benefit_membership_code_unique (membership_id, benefit_code),
    INDEX regular_class_benefit_student_status_idx (student_id, status)
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_campaigns (
    id int AUTO_INCREMENT PRIMARY KEY, name varchar(180) NOT NULL, subject varchar(250) NOT NULL,
    message text NOT NULL,
    audience enum('all_active','2x_plus','3x_plus','4x_plus','5x','pending_payment') NOT NULL,
    status enum('draft','sending','sent','failed') NOT NULL DEFAULT 'draft',
    sent_count int NOT NULL DEFAULT 0, failed_count int NOT NULL DEFAULT 0,
    created_by_user_id int NOT NULL, sent_at timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS regular_class_campaign_deliveries (
    id int AUTO_INCREMENT PRIMARY KEY, campaign_id int NOT NULL, student_id int NOT NULL,
    recipient_email varchar(320) NOT NULL, status enum('sent','failed','skipped') NOT NULL,
    provider_id varchar(160) NULL, error text NULL, sent_at timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX regular_class_campaign_deliveries_campaign_idx (campaign_id)
  )`,
];

const INITIAL_TEACHERS = [
  { name: "Andrea Ortúzar", color: "#648596", share: 8000, documentType: "pending" as const },
  { name: "Bernardita Mir", color: "#667594", share: 0, documentType: "none" as const },
  { name: "Claudia Silva", color: "#899169", share: 7000, documentType: "pending" as const },
  { name: "Marco Santana", color: "#967B64", share: 7000, documentType: "pending" as const },
];

const INITIAL_CLASSES = [
  "Hatha Yoga Intenso",
  "Hatha Yoga Suave",
  "Entrenamiento Funcional y Movilidad",
  "Meditación y Respiración",
  "Natación en Aguas Abiertas",
];

const INITIAL_SCHEDULES = [
  ["Hatha Yoga Intenso", "Andrea Ortúzar", 1, "08:30", "09:45"],
  ["Hatha Yoga Intenso", "Andrea Ortúzar", 3, "08:30", "09:45"],
  ["Hatha Yoga Intenso", "Andrea Ortúzar", 5, "08:30", "09:45"],
  ["Hatha Yoga Suave", "Andrea Ortúzar", 1, "10:15", "11:30"],
  ["Hatha Yoga Suave", "Andrea Ortúzar", 3, "10:15", "11:30"],
  ["Entrenamiento Funcional y Movilidad", "Bernardita Mir", 2, "08:30", "09:30"],
  ["Entrenamiento Funcional y Movilidad", "Bernardita Mir", 4, "08:30", "09:30"],
  ["Meditación y Respiración", "Claudia Silva", 2, "19:00", "20:00"],
  ["Natación en Aguas Abiertas", "Marco Santana", 2, "08:30", "09:30"],
  ["Natación en Aguas Abiertas", "Marco Santana", 4, "08:30", "09:30"],
] as const;

export async function ensureRegularClassesSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql.raw("ALTER TABLE users ADD COLUMN regular_classes_teacher int NOT NULL DEFAULT 0"));
  } catch (error: any) {
    if (error?.cause?.code !== "ER_DUP_FIELDNAME" && error?.code !== "ER_DUP_FIELDNAME") throw error;
  }
  for (const statement of CREATE_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  for (const statement of [
    "ALTER TABLE regular_class_memberships ADD COLUMN original_amount_clp int NULL",
    "ALTER TABLE regular_class_memberships ADD COLUMN discount_amount_clp int NOT NULL DEFAULT 0",
    "ALTER TABLE regular_class_memberships ADD COLUMN discount_code_id int NULL",
    "ALTER TABLE regular_class_memberships ADD COLUMN discount_code varchar(50) NULL",
  ]) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error: any) {
      if (error?.cause?.code !== "ER_DUP_FIELDNAME" && error?.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }
  await db.execute(sql.raw(`
    UPDATE regular_class_memberships
    SET original_amount_clp = price_paid_clp
    WHERE original_amount_clp IS NULL
  `));
  for (const [key, value] of [
    ["period_start_day", "1"],
    ["honorarium_withholding_bps", "1525"],
    ["vat_bps", "1900"],
    ["payment_base_url", "https://cancagua.cl/clases"],
  ]) {
    await db.execute(sql.raw(
      `INSERT IGNORE INTO regular_class_settings (\`key\`, \`value\`) VALUES ('${key}', '${value}')`,
    ));
  }
  await db.execute(sql.raw(
    "UPDATE regular_class_settings SET `value` = '1' WHERE `key` = 'period_start_day'",
  ));
  await db.execute(sql.raw(`
    UPDATE regular_class_memberships
    SET period_end = LAST_DAY(period_start),
        period_start = DATE_FORMAT(period_start, '%Y-%m-01')
    WHERE DAY(period_start) <> 1
       OR period_end <> LAST_DAY(period_start)
  `));

  const existingTeachers = await db.select().from(regularClassTeachers);
  for (const item of INITIAL_TEACHERS) {
    let teacher = existingTeachers.find((row) => row.name === item.name);
    if (!teacher) {
      const [created] = await db.insert(regularClassTeachers).values({
        name: item.name,
        color: item.color,
      }).$returningId();
      [teacher] = await db.select().from(regularClassTeachers)
        .where(eq(regularClassTeachers.id, created.id)).limit(1);
    }
    const [agreement] = await db.select().from(regularClassTeacherAgreements)
      .where(eq(regularClassTeacherAgreements.teacherId, teacher.id)).limit(1);
    if (!agreement) {
      await db.insert(regularClassTeacherAgreements).values({
        teacherId: teacher.id,
        teacherShareBps: item.share,
        documentType: item.documentType,
        validFrom: "2026-01-01",
      });
    }
  }

  const existingClasses = await db.select().from(regularClassDisciplines);
  for (const name of INITIAL_CLASSES) {
    if (!existingClasses.some((row) => row.name === name)) {
      await db.insert(regularClassDisciplines).values({ name });
    }
  }
  const teachers = await db.select().from(regularClassTeachers);
  const disciplines = await db.select().from(regularClassDisciplines);
  const schedules = await db.select().from(regularClassSchedules);
  for (const [className, teacherName, dayOfWeek, startTime, endTime] of INITIAL_SCHEDULES) {
    const discipline = disciplines.find((row) => row.name === className);
    const teacher = teachers.find((row) => row.name === teacherName);
    if (!discipline || !teacher) continue;
    const exists = schedules.some((row) =>
      row.disciplineId === discipline.id
      && row.teacherId === teacher.id
      && row.dayOfWeek === dayOfWeek
      && row.startTime === startTime
      && row.endTime === endTime);
    if (!exists) {
      await db.insert(regularClassSchedules).values({
        disciplineId: discipline.id,
        teacherId: teacher.id,
        dayOfWeek,
        startTime,
        endTime,
        validFrom: "2026-01-01",
      });
    }
  }

  const plans = [
    ["1x", "1 vez por semana", 38_000, 4, "Acceso a cualquier clase del programa"],
    ["2x", "2 veces por semana", 58_000, 8, "15% de descuento en tickets de biopiscina"],
    ["3x", "3 veces por semana", 75_000, 12, "Beneficios anteriores + sauna jueves 10:00–12:00"],
    ["4x", "4 veces por semana", 89_000, 16, "Beneficios anteriores + Pulso 3 a 6 meses / Pulso 5 a 12 meses"],
    ["5x", "5 veces por semana", 99_000, 20, "Beneficios anteriores + Pulso 5 a 6 meses / Pulso 10 a 12 meses"],
    ["drop_in", "Clase suelta", 15_000, 1, "Una clase del programa"],
  ] as const;
  for (let index = 0; index < plans.length; index += 1) {
    const [code, name, priceClp, creditsPerPeriod, benefits] = plans[index];
    await db.insert(regularClassPlans).values({
      code, name, priceClp, creditsPerPeriod, benefits, displayOrder: index + 1,
    }).onDuplicateKeyUpdate({ set: { code } });
  }
  console.log("[database] Esquema de clases regulares verificado");
}
