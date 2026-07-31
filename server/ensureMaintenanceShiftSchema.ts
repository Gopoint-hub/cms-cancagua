import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Tablas de la ficha diaria de mantención.
 *
 * Dominio aparte del de averías (`maintenance_reports`): aquí vive el checklist
 * del turno. Se crean con IF NOT EXISTS, igual que el resto de los módulos.
 */
export async function ensureMaintenanceShiftSchema(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while ensuring maintenance shift schema");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS maintenance_shift_reports (
      id int AUTO_INCREMENT NOT NULL,
      report_date date NOT NULL,
      shift enum('apertura','cierre') NOT NULL,
      status enum('draft','submitted') NOT NULL DEFAULT 'draft',
      staff_name varchar(200) NULL,
      weather_summary varchar(255) NULL,
      tomorrow_early_temp decimal(4,1) NULL,
      filtering_start varchar(5) NULL,
      filtering_end varchar(5) NULL,
      filtering_rule varchar(255) NULL,
      pending_notes text NULL,
      handover_notes text NULL,
      submitted_at timestamp NULL,
      created_by_id int NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY maintenance_shift_reports_date_shift_unique (report_date, shift)
    )
  `);

  // La llave incluye turno y hora, no solo el texto: "Avanzar con tareas extras"
  // existe en apertura y en cierre, y con llave por texto una marcaba a la otra.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS maintenance_shift_tasks (
      id int AUTO_INCREMENT NOT NULL,
      report_id int NOT NULL,
      task_key varchar(191) NOT NULL,
      scheduled_time varchar(5) NULL,
      label varchar(500) NOT NULL,
      is_pool int NOT NULL DEFAULT 0,
      done int NOT NULL DEFAULT 0,
      done_at varchar(5) NULL,
      responsible varchar(120) NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY maintenance_shift_tasks_report_key_unique (report_id, task_key),
      KEY maintenance_shift_tasks_report_idx (report_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS maintenance_shift_temperatures (
      id int AUTO_INCREMENT NOT NULL,
      report_id int NOT NULL,
      venue varchar(60) NOT NULL,
      round_time varchar(5) NOT NULL,
      temperature decimal(4,1) NULL,
      in_range int NOT NULL DEFAULT 1,
      note varchar(255) NULL,
      responsible varchar(120) NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY maintenance_shift_temp_unique (report_id, venue, round_time),
      KEY maintenance_shift_temp_report_idx (report_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS maintenance_shift_water_quality (
      id int AUTO_INCREMENT NOT NULL,
      report_id int NOT NULL,
      venue varchar(60) NOT NULL,
      transparency int NULL,
      suspended_particles enum('ausente','pocas','muchas') NULL,
      settled_particles enum('ausente','pocas','muchas') NULL,
      observation text NULL,
      actions text NULL,
      recorded_at varchar(5) NULL,
      responsible varchar(120) NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY maintenance_shift_water_unique (report_id, venue),
      KEY maintenance_shift_water_report_idx (report_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS maintenance_shift_cycles (
      id int AUTO_INCREMENT NOT NULL,
      report_id int NOT NULL,
      cycle_type enum('hot_tub','sauna') NOT NULL,
      venue varchar(60) NOT NULL,
      booking_ref varchar(80) NULL,
      step enum('llenado','entrega','vaciado','higienizado','encendido') NOT NULL,
      planned_time varchar(5) NULL,
      actual_time varchar(5) NULL,
      temperature decimal(4,1) NULL,
      done int NOT NULL DEFAULT 0,
      responsible varchar(120) NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY maintenance_shift_cycles_report_idx (report_id)
    )
  `);
}
