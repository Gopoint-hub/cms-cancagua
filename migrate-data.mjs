/**
 * Migration script: TiDB → Manus DB
 * Exports data from the original TiDB database and imports into the Manus MySQL database
 */
import mysql from 'mysql2/promise';

// Source: TiDB Cloud (original database)
const TIDB_URL = 'mysql://VpuGQMh4iyL3egF.root:fExakHNuYha3pOMW@gateway01.us-east-1.prod.aws.tidbcloud.com/test?ssl={"rejectUnauthorized":true}';

// Target: Manus DB (from DATABASE_URL env)
const MANUS_DB_URL = process.env.DATABASE_URL;

if (!MANUS_DB_URL) {
  console.error('ERROR: DATABASE_URL not set. Run this from the project directory with env loaded.');
  process.exit(1);
}

// Parse connection strings
function parseConnectionString(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 3306,
    user: parsed.username,
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1).split('?')[0],
    ssl: url.includes('tidbcloud') ? { rejectUnauthorized: true } : undefined,
  };
}

// Tables to migrate (in order to respect foreign keys)
const TABLES_IN_ORDER = [
  'users',
  'services',
  'service_categories',
  'menu_categories',
  'menu_items',
  'menu_item_variants',
  'menu_item_allergens',
  'menu_item_pairings',
  'reservations',
  'contact_messages',
  'newsletter_subscribers',
  'subscriber_lists',
  'subscriber_list_members',
  'newsletters',
  'newsletter_sends',
  'newsletter_events',
  'events',
  'event_registrations',
  'clients',
  'client_interactions',
  'corporate_products',
  'corporate_product_items',
  'quotes',
  'quote_items',
  'deals',
  'deal_activities',
  'discount_codes',
  'gift_cards',
  'gift_card_transactions',
  'translations',
  'site_config',
  'maintenance_reports',
  'maintenance_report_photos',
  'marketing_campaigns',
  'marketing_campaign_metrics',
];

async function migrateTable(sourceConn, targetConn, tableName) {
  try {
    // Check if table exists in source
    const [rows] = await sourceConn.query(`SELECT * FROM \`${tableName}\``);
    
    if (!rows || rows.length === 0) {
      console.log(`  ⏭️  ${tableName}: vacía (0 registros)`);
      return 0;
    }

    // Disable foreign key checks temporarily
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Clear target table
    await targetConn.query(`DELETE FROM \`${tableName}\``);
    
    // Insert in batches of 100
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const columns = Object.keys(batch[0]);
      const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      const values = batch.flatMap(row => columns.map(col => row[col]));
      
      const query = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES ${placeholders}`;
      
      try {
        await targetConn.query(query, values);
        inserted += batch.length;
      } catch (err) {
        console.error(`  ❌ Error inserting batch in ${tableName}:`, err.message);
        // Try one by one
        for (const row of batch) {
          try {
            const singlePlaceholders = `(${columns.map(() => '?').join(',')})`;
            const singleValues = columns.map(col => row[col]);
            await targetConn.query(
              `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES ${singlePlaceholders}`,
              singleValues
            );
            inserted++;
          } catch (singleErr) {
            console.error(`    ⚠️ Skipped row in ${tableName}: ${singleErr.message}`);
          }
        }
      }
    }
    
    // Re-enable foreign key checks
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log(`  ✅ ${tableName}: ${inserted}/${rows.length} registros migrados`);
    return inserted;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.log(`  ⏭️  ${tableName}: no existe en origen`);
    } else {
      console.error(`  ❌ ${tableName}: ${err.message}`);
    }
    return 0;
  }
}

async function main() {
  console.log('🚀 Iniciando migración de datos TiDB → Manus DB\n');
  
  const sourceConfig = parseConnectionString(TIDB_URL);
  const targetConfig = parseConnectionString(MANUS_DB_URL);
  
  console.log(`📡 Origen: ${sourceConfig.host} (${sourceConfig.database})`);
  console.log(`📡 Destino: ${targetConfig.host} (${targetConfig.database})\n`);
  
  let sourceConn, targetConn;
  
  try {
    console.log('Conectando a TiDB...');
    sourceConn = await mysql.createConnection(sourceConfig);
    console.log('✅ Conectado a TiDB\n');
    
    console.log('Conectando a Manus DB...');
    targetConn = await mysql.createConnection(targetConfig);
    console.log('✅ Conectado a Manus DB\n');
    
    let totalMigrated = 0;
    
    console.log('📦 Migrando tablas:\n');
    
    for (const table of TABLES_IN_ORDER) {
      const count = await migrateTable(sourceConn, targetConn, table);
      totalMigrated += count;
    }
    
    console.log(`\n🎉 Migración completada: ${totalMigrated} registros totales migrados`);
    
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
  } finally {
    if (sourceConn) await sourceConn.end();
    if (targetConn) await targetConn.end();
  }
}

main();
