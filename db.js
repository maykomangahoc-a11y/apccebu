const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        pin VARCHAR(50) NOT NULL,
        role VARCHAR(50) DEFAULT 'viewer',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pickers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        designation VARCHAR(100) DEFAULT 'Picker',
        shift VARCHAR(100) DEFAULT '1st Shift'
      );

      CREATE TABLE IF NOT EXISTS checkers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        shift VARCHAR(100) DEFAULT '1st Shift',
        type VARCHAR(50) DEFAULT 'Outbound'
      );

      CREATE TABLE IF NOT EXISTS staging_areas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dispatch_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(255) DEFAULT '',
        order_received VARCHAR(255) DEFAULT '',
        party_code VARCHAR(255) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        type VARCHAR(100) DEFAULT '',
        qty INTEGER DEFAULT 0,
        cbm VARCHAR(100) DEFAULT '',
        weight VARCHAR(100) DEFAULT '',
        invoiced_value VARCHAR(255) DEFAULT '',
        order_status VARCHAR(255) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        truck_size VARCHAR(100) DEFAULT '',
        trucker VARCHAR(255) DEFAULT '',
        loading_time VARCHAR(255) DEFAULT '',
        linechecker VARCHAR(255) DEFAULT '',
        dispatcher VARCHAR(255) DEFAULT '',
        checked_qty VARCHAR(100) DEFAULT '',
        column_q VARCHAR(255) DEFAULT '',
        plate_no VARCHAR(255) DEFAULT '',
        time_arrival VARCHAR(255) DEFAULT '',
        start_loading VARCHAR(255) DEFAULT '',
        loading_end VARCHAR(255) DEFAULT '',
        preparation VARCHAR(255) DEFAULT '',
        truck_arrival VARCHAR(255) DEFAULT '',
        est_amount NUMERIC DEFAULT 0,
        start_line_check VARCHAR(255) DEFAULT '',
        end_line_check VARCHAR(255) DEFAULT '',
        archive_status VARCHAR(50) DEFAULT 'Active',
        invoiced_value_user VARCHAR(255) DEFAULT '',
        invoiced_value_ts VARCHAR(255) DEFAULT '',
        staging_area VARCHAR(255) DEFAULT '',
        -- Plan audit timestamps
        plan_today_ts VARCHAR(255) DEFAULT '',
        plan_today_user VARCHAR(255) DEFAULT '',
        plan_pending_ts VARCHAR(255) DEFAULT '',
        plan_pending_user VARCHAR(255) DEFAULT '',
        plan_additional_ts VARCHAR(255) DEFAULT '',
        plan_additional_user VARCHAR(255) DEFAULT '',
        plan_grand_ts VARCHAR(255) DEFAULT '',
        plan_grand_user VARCHAR(255) DEFAULT '',
        plan_tomorrow_ts VARCHAR(255) DEFAULT '',
        plan_tomorrow_user VARCHAR(255) DEFAULT '',
        -- Order status audit timestamps
        status_rtd_ts VARCHAR(255) DEFAULT '',
        status_rtd_user VARCHAR(255) DEFAULT '',
        status_sorting_ts VARCHAR(255) DEFAULT '',
        status_sorting_user VARCHAR(255) DEFAULT '',
        status_sorted_ts VARCHAR(255) DEFAULT '',
        status_sorted_user VARCHAR(255) DEFAULT '',
        status_picking_ts VARCHAR(255) DEFAULT '',
        status_picking_user VARCHAR(255) DEFAULT '',
        status_picked_ts VARCHAR(255) DEFAULT '',
        status_picked_user VARCHAR(255) DEFAULT '',
        status_loading_ts VARCHAR(255) DEFAULT '',
        status_loading_user VARCHAR(255) DEFAULT '',
        status_loaded_ts VARCHAR(255) DEFAULT '',
        status_loaded_user VARCHAR(255) DEFAULT '',
        status_dispatched_ts VARCHAR(255) DEFAULT '',
        status_dispatched_user VARCHAR(255) DEFAULT '',
        status_checking_ts VARCHAR(255) DEFAULT '',
        status_checking_user VARCHAR(255) DEFAULT '',
        -- Truck field audit timestamps
        truck_loading_time_ts VARCHAR(255) DEFAULT '',
        truck_loading_time_user VARCHAR(255) DEFAULT '',
        truck_linechecker_ts VARCHAR(255) DEFAULT '',
        truck_linechecker_user VARCHAR(255) DEFAULT '',
        truck_dispatcher_ts VARCHAR(255) DEFAULT '',
        truck_dispatcher_user VARCHAR(255) DEFAULT '',
        truck_time_arrival_ts VARCHAR(255) DEFAULT '',
        truck_time_arrival_user VARCHAR(255) DEFAULT '',
        truck_start_loading_ts VARCHAR(255) DEFAULT '',
        truck_start_loading_user VARCHAR(255) DEFAULT '',
        truck_loading_end_ts VARCHAR(255) DEFAULT '',
        truck_loading_end_user VARCHAR(255) DEFAULT '',
        truck_trucker_ts VARCHAR(255) DEFAULT '',
        truck_trucker_user VARCHAR(255) DEFAULT '',
        truck_plate_no_ts VARCHAR(255) DEFAULT '',
        truck_plate_no_user VARCHAR(255) DEFAULT '',
        -- Master-synced date columns (kept for compatibility)
        dispatch_date VARCHAR(255) DEFAULT '',
        loading_date VARCHAR(255) DEFAULT '',
        rtd_date VARCHAR(255) DEFAULT '',
        line_check_date VARCHAR(255) DEFAULT '',
        picking_date VARCHAR(255) DEFAULT '',
        done_pick_date VARCHAR(255) DEFAULT '',
        ready_for_dispatch VARCHAR(255) DEFAULT '',
        w_truck VARCHAR(255) DEFAULT '',
        ongoing VARCHAR(255) DEFAULT '',
        loaded_date VARCHAR(255) DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dispatch_archive (
        id UUID PRIMARY KEY,
        status VARCHAR(255) DEFAULT '',
        order_received VARCHAR(255) DEFAULT '',
        party_code VARCHAR(255) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        type VARCHAR(100) DEFAULT '',
        qty INTEGER DEFAULT 0,
        cbm VARCHAR(100) DEFAULT '',
        weight VARCHAR(100) DEFAULT '',
        invoiced_value VARCHAR(255) DEFAULT '',
        order_status VARCHAR(255) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        truck_size VARCHAR(100) DEFAULT '',
        trucker VARCHAR(255) DEFAULT '',
        loading_time VARCHAR(255) DEFAULT '',
        linechecker VARCHAR(255) DEFAULT '',
        dispatcher VARCHAR(255) DEFAULT '',
        checked_qty VARCHAR(100) DEFAULT '',
        plate_no VARCHAR(255) DEFAULT '',
        time_arrival VARCHAR(255) DEFAULT '',
        start_loading VARCHAR(255) DEFAULT '',
        loading_end VARCHAR(255) DEFAULT '',
        preparation VARCHAR(255) DEFAULT '',
        est_amount NUMERIC DEFAULT 0,
        start_line_check VARCHAR(255) DEFAULT '',
        end_line_check VARCHAR(255) DEFAULT '',
        invoiced_value_user VARCHAR(255) DEFAULT '',
        dispatch_date VARCHAR(255) DEFAULT '',
        done_pick_date VARCHAR(255) DEFAULT '',
        archived_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS picking_data (
        id SERIAL PRIMARY KEY,
        fo VARCHAR(500) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        bl VARCHAR(255) DEFAULT '',
        picker_code VARCHAR(100) DEFAULT '',
        qty INTEGER DEFAULT 0,
        staging_area VARCHAR(255) DEFAULT '',
        start_time VARCHAR(255) DEFAULT '',
        end_time VARCHAR(255) DEFAULT '',
        duration VARCHAR(100) DEFAULT '',
        start_user VARCHAR(255) DEFAULT '',
        end_user VARCHAR(255) DEFAULT '',
        party_code VARCHAR(255) DEFAULT '',
        total_order_qty INTEGER DEFAULT 0,
        order_id VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS pending_picks (
        id VARCHAR(255) PRIMARY KEY,
        fo VARCHAR(500) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        bl VARCHAR(255) DEFAULT '',
        picker_code VARCHAR(100) DEFAULT '',
        qty INTEGER DEFAULT 0,
        staging_area VARCHAR(255) DEFAULT '',
        assigned_user VARCHAR(255) DEFAULT '',
        timestamp VARCHAR(255) DEFAULT '',
        party_code VARCHAR(255) DEFAULT '',
        total_order_qty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS processing_data (
        id SERIAL PRIMARY KEY,
        party_code VARCHAR(255) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        cases VARCHAR(100) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        size VARCHAR(100) DEFAULT '',
        trucker VARCHAR(255) DEFAULT '',
        loading_date VARCHAR(255) DEFAULT '',
        processing_status VARCHAR(100) DEFAULT '',
        printing_status VARCHAR(100) DEFAULT '',
        pending_skus TEXT DEFAULT '',
        unserved TEXT DEFAULT '',
        uploader VARCHAR(255) DEFAULT '',
        processor VARCHAR(255) DEFAULT '',
        completer VARCHAR(255) DEFAULT '',
        printer VARCHAR(255) DEFAULT '',
        helper VARCHAR(500) DEFAULT '',
        upload_timestamp VARCHAR(255) DEFAULT '',
        processed_date VARCHAR(255) DEFAULT '',
        completed_date VARCHAR(255) DEFAULT '',
        printed_date VARCHAR(255) DEFAULT '',
        processed_qty INTEGER DEFAULT 0,
        unserved_qty INTEGER DEFAULT 0,
        balance_qty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS processing_sku_data (
        id SERIAL PRIMARY KEY,
        party_code VARCHAR(255) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        sku VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        status VARCHAR(100) DEFAULT '',
        bl VARCHAR(255) DEFAULT '',
        timestamp VARCHAR(255) DEFAULT '',
        sku_user VARCHAR(255) DEFAULT '',
        helper VARCHAR(500) DEFAULT '',
        processed_qty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS item_database (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(255) UNIQUE NOT NULL,
        material_description TEXT DEFAULT '',
        palletizing VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS checking_data (
        id SERIAL PRIMARY KEY,
        timestamp VARCHAR(255) DEFAULT '',
        order_id VARCHAR(255) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        party_code VARCHAR(255) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        checker VARCHAR(255) DEFAULT '',
        checked_qty VARCHAR(100) DEFAULT '',
        log_user VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS dispatching_data (
        id SERIAL PRIMARY KEY,
        timestamp VARCHAR(255) DEFAULT '',
        order_id VARCHAR(255) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        party_code VARCHAR(255) DEFAULT '',
        account_name VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        dispatcher VARCHAR(255) DEFAULT '',
        log_user VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS outbound_bl_data (
        id SERIAL PRIMARY KEY,
        bl VARCHAR(255) DEFAULT '',
        date VARCHAR(255) DEFAULT '',
        account VARCHAR(255) DEFAULT '',
        fo VARCHAR(500) DEFAULT '',
        po VARCHAR(255) DEFAULT '',
        operator_qty INTEGER DEFAULT 0,
        picker_qty INTEGER DEFAULT 0,
        synced_at VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS inbound_monitoring (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) DEFAULT '',
        day VARCHAR(100) DEFAULT '',
        trucker VARCHAR(255) DEFAULT '',
        source VARCHAR(255) DEFAULT '',
        identifier VARCHAR(255) DEFAULT '',
        arrival VARCHAR(255) DEFAULT '',
        start_time VARCHAR(255) DEFAULT '',
        end_unload VARCHAR(255) DEFAULT '',
        dwell_time VARCHAR(100) DEFAULT '',
        status VARCHAR(50) DEFAULT '',
        release VARCHAR(255) DEFAULT '',
        dock_in VARCHAR(255) DEFAULT '',
        docs_receive VARCHAR(255) DEFAULT '',
        jib VARCHAR(255) DEFAULT '',
        checker VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS inbound_monitoring_records (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) DEFAULT '',
        day VARCHAR(100) DEFAULT '',
        trucker VARCHAR(255) DEFAULT '',
        source VARCHAR(255) DEFAULT '',
        identifier VARCHAR(255) DEFAULT '',
        arrival VARCHAR(255) DEFAULT '',
        start_time VARCHAR(255) DEFAULT '',
        end_unload VARCHAR(255) DEFAULT '',
        dwell_time VARCHAR(100) DEFAULT '',
        status VARCHAR(50) DEFAULT '',
        release VARCHAR(255) DEFAULT '',
        dock_in VARCHAR(255) DEFAULT '',
        docs_receive VARCHAR(255) DEFAULT '',
        jib VARCHAR(255) DEFAULT '',
        checker VARCHAR(255) DEFAULT '',
        archived_at VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS inbound_data (
        id SERIAL PRIMARY KEY,
        gr_date VARCHAR(255) DEFAULT '',
        jib VARCHAR(255) DEFAULT '',
        checking_date VARCHAR(255) DEFAULT '',
        shift VARCHAR(100) DEFAULT '',
        operator VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        pallets VARCHAR(100) DEFAULT '',
        start_putaway VARCHAR(255) DEFAULT '',
        end_putaway VARCHAR(255) DEFAULT '',
        duration VARCHAR(100) DEFAULT '',
        date VARCHAR(255) DEFAULT '',
        time_slot VARCHAR(100) DEFAULT '',
        month VARCHAR(50) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS putaway_data (
        id SERIAL PRIMARY KEY,
        jib VARCHAR(255) DEFAULT '',
        gr_date VARCHAR(255) DEFAULT '',
        date_duty VARCHAR(255) DEFAULT '',
        shift VARCHAR(100) DEFAULT '',
        operator VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        pallets VARCHAR(100) DEFAULT '',
        start_time VARCHAR(255) DEFAULT '',
        end_time VARCHAR(255) DEFAULT '',
        duration VARCHAR(100) DEFAULT '',
        start_user VARCHAR(255) DEFAULT '',
        end_user VARCHAR(255) DEFAULT '',
        remarks TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS pending_putaway (
        id VARCHAR(255) PRIMARY KEY,
        jib VARCHAR(255) DEFAULT '',
        gr_date VARCHAR(255) DEFAULT '',
        operator VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        pallets VARCHAR(100) DEFAULT '',
        assigned_user VARCHAR(255) DEFAULT '',
        timestamp VARCHAR(255) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS inbound_putaway (
        id SERIAL PRIMARY KEY,
        gr_date VARCHAR(255) DEFAULT '',
        jib VARCHAR(255) DEFAULT '',
        checking_date VARCHAR(255) DEFAULT '',
        shift VARCHAR(100) DEFAULT '',
        operator VARCHAR(255) DEFAULT '',
        qty VARCHAR(100) DEFAULT '',
        pallets VARCHAR(100) DEFAULT '',
        start_putaway VARCHAR(255) DEFAULT '',
        end_putaway VARCHAR(255) DEFAULT '',
        duration VARCHAR(100) DEFAULT '',
        date VARCHAR(255) DEFAULT '',
        time_slot VARCHAR(100) DEFAULT '',
        month VARCHAR(50) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS config (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB DEFAULT '{}'::jsonb
      );

      -- Seed default config if empty
      INSERT INTO config (key, value) VALUES ('app', '{"dayStartHour": 3, "dailyGoalQty": 10000, "dailyGoalValue": 0}'::jsonb)
      ON CONFLICT (key) DO NOTHING;

      -- Seed default users
      INSERT INTO users (username, pin, role, active) VALUES
        ('Myko', '1111', 'admin', TRUE),
        ('test', '0921', 'processor', TRUE),
        ('Ed_win', '283055', 'supervisor', TRUE),
        ('Richard_30', '4477', 'processor', TRUE),
        ('Jazz', '020802', 'admin', TRUE),
        ('test2', '0921', 'viewer', TRUE),
        ('Ram', '0814', 'admin', TRUE),
        ('Kentoy1654', '0210', 'supervisor', TRUE),
        ('ALJANE1970', '1970', 'processor', TRUE),
        ('ReyMart15', '041500', 'processor', TRUE),
        ('Justin', '2021', 'supervisor', TRUE),
        ('Eve', '1818', 'admin', TRUE),
        ('Pat', '0000', 'supervisor', TRUE),
        ('Marju', '0000', 'processor', TRUE),
        ('zhyrajoy', '12345', 'processor', TRUE),
        ('jaca', '1111', 'processor', TRUE),
        ('Ann Paulino', '082396', 'processor', TRUE),
        ('MommyROY', '0310', 'processor', TRUE),
        ('baihens', '1234', 'supervisor', TRUE),
        ('Maevil', '123456', 'processor', TRUE),
        ('chardiebie123', '1988', 'processor', TRUE),
        ('EDM', '123456', 'processor', TRUE),
        ('XiangMo', '102494', 'processor', TRUE),
        ('dashboard', '1111', 'dashboard', TRUE),
        ('Rhea', '1210', 'supervisor', TRUE),
        ('isabellaauman', '1995', 'processor', TRUE),
        ('James', '1996', 'viewer', TRUE),
        ('BREMAR_PILLAR', '2019', 'processor', TRUE)
      ON CONFLICT (username) DO NOTHING;
    `);
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
