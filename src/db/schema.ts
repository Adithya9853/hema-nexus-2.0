import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  unitSystem: 'conventional' | 'si';
  notificationsEnabled: boolean;
  deviceAlertsEnabled: boolean;
  autoSyncBle: boolean;
  shareQrIncludeEmergencyInfo: boolean;
}

export interface ReferenceRangeConfig {
  minNormal: number;
  maxNormal: number;
  borderlineLow?: number;
  borderlineHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  secondaryMinNormal?: number;
  secondaryMaxNormal?: number;
  secondaryLabel?: string;
  notes?: string;
}

export type UserRole = 'consumer' | 'hospital_operator' | 'clinician' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'pending';

// 8. Hospitals and Clinics (defined early so users, patients, devices, sessions, reports can FK to it)
export const hospitals = pgTable(
  'hospitals',
  {
    id: serial('id').primaryKey(),
    hospitalCode: text('hospital_code').notNull().unique(),
    name: text('name').notNull(),
    address: text('address'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    registrationNumber: text('registration_number'),
    accountStatus: text('account_status').notNull().default('active'), // 'active' | 'pending' | 'suspended'
    ownerUid: text('owner_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('hospitals_owner_uid_idx').on(table.ownerUid),
    index('hospitals_name_idx').on(table.name),
  ],
);

// 1. Users
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    fullName: text('full_name'),
    phone: text('phone'),
    dateOfBirth: text('date_of_birth'),
    patientCode: text('patient_code').notNull(),
    avatarUrl: text('avatar_url'),
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('consumer'), // 'consumer' | 'hospital_operator' | 'clinician' | 'admin'
    accountStatus: text('account_status').notNull().default('active'), // 'active' | 'suspended' | 'pending'
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    preferences: jsonb('preferences').$type<UserPreferences>().notNull().default({
      theme: 'light',
      unitSystem: 'conventional',
      notificationsEnabled: true,
      deviceAlertsEnabled: true,
      autoSyncBle: true,
      shareQrIncludeEmergencyInfo: false,
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role),
    index('users_hospital_id_idx').on(table.hospitalId),
  ],
);

// 2. Patients
export const patients = pgTable(
  'patients',
  {
    id: serial('id').primaryKey(),
    ownerUid: text('owner_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    uhid: text('uhid').notNull(),
    fullName: text('full_name').notNull(),
    dateOfBirth: text('date_of_birth'),
    sex: text('sex'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('patients_owner_uid_idx').on(table.ownerUid),
    index('patients_hospital_id_idx').on(table.hospitalId),
    uniqueIndex('patients_owner_uhid_idx').on(table.ownerUid, table.uhid),
  ],
);

// 3. Devices
export const devices = pgTable(
  'devices',
  {
    id: serial('id').primaryKey(),
    ownerUid: text('owner_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    deviceName: text('device_name').notNull(),
    deviceIdentifier: text('device_identifier').notNull(), // Serial / BLE MAC or SIM ID
    deviceModel: text('device_model').notNull().default('Hema Nexus Multi-Port v1'),
    firmwareVersion: text('firmware_version'),
    hardwareRevision: text('hardware_revision'),
    connectionType: text('connection_type').notNull().default('ble'), // 'ble' | 'simulated'
    status: text('status').notNull().default('paired'), // 'connected' | 'disconnected' | 'paired'
    calibrationStatus: text('calibration_status').notNull().default('uncalibrated'), // 'calibrated' | 'due' | 'overdue' | 'uncalibrated'
    sensorChannels: jsonb('sensor_channels').$type<string[]>(),
    lastConnectedAt: timestamp('last_connected_at'),
    lastCommunicationAt: timestamp('last_communication_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('devices_owner_uid_idx').on(table.ownerUid),
    index('devices_hospital_id_idx').on(table.hospitalId),
    index('devices_identifier_idx').on(table.deviceIdentifier),
  ],
);

// Device Connection History & Error Logs
export const deviceEvents = pgTable(
  'device_events',
  {
    id: serial('id').primaryKey(),
    deviceId: integer('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // 'paired' | 'connected' | 'disconnected' | 'error' | 'calibration' | 'firmware_update'
    connectionMode: text('connection_mode').notNull().default('ble'), // 'ble' | 'simulated'
    errorCode: text('error_code'),
    message: text('message').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('device_events_device_id_idx').on(table.deviceId),
    index('device_events_user_uid_idx').on(table.userUid),
    index('device_events_created_at_idx').on(table.createdAt),
  ],
);

// Test Catalog & Configurable Reference Ranges
export const testTypes = pgTable('test_types', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  testName: text('test_name').notNull(),
  category: text('category').notNull(), // 'blood' | 'physiological'
  portNumber: integer('port_number'),
  unit: text('unit').notNull(),
  secondaryUnit: text('secondary_unit'),
  availabilityStatus: text('availability_status').notNull(), // 'available' | 'device_required' | 'coming_soon' | 'unavailable'
  sensingMethod: text('sensing_method').notNull(),
  description: text('description').notNull(),
  instructions: jsonb('instructions').$type<string[]>().notNull(),
  referenceRangeConfig: jsonb('reference_range_config')
    .$type<ReferenceRangeConfig>()
    .notNull(),
  accentColor: text('accent_color').notNull().default('#2563EB'),
});

// 4. Test Sessions
export const testSessions = pgTable(
  'test_sessions',
  {
    id: serial('id').primaryKey(),
    sessionCode: text('session_code').notNull().unique(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    patientRecordId: integer('patient_record_id').references(() => patients.id, {
      onDelete: 'set null',
    }),
    deviceId: integer('device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    operatorName: text('operator_name'),
    testMode: text('test_mode').notNull().default('simulated'), // 'simulated' | 'real' | 'manual'
    sessionStatus: text('session_status').notNull().default('in_progress'), // 'in_progress' | 'completed' | 'failed' | 'cancelled'
    completionStatus: text('completion_status').notNull().default('incomplete'), // 'complete' | 'partial' | 'incomplete'
    selectedParameters: jsonb('selected_parameters').$type<string[]>().notNull().default([]),
    errorDetails: text('error_details'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('test_sessions_user_uid_idx').on(table.userUid),
    index('test_sessions_patient_id_idx').on(table.patientRecordId),
    index('test_sessions_hospital_id_idx').on(table.hospitalId),
    index('test_sessions_started_at_idx').on(table.startedAt),
  ],
);

// 5. Test Results (measurements)
export const measurements = pgTable(
  'measurements',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    deviceId: integer('device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    patientRecordId: integer('patient_record_id').references(() => patients.id, {
      onDelete: 'set null',
    }),
    sessionId: integer('session_id').references(() => testSessions.id, {
      onDelete: 'set null',
    }),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    testType: text('test_type').notNull(),
    testName: text('test_name').notNull(),
    measuredValue: doublePrecision('measured_value').notNull(),
    secondaryValue: doublePrecision('secondary_value'),
    unit: text('unit').notNull(),
    measuredAt: timestamp('measured_at').notNull(),
    status: text('status').notNull(), // 'normal' | 'borderline' | 'elevated' | 'low' | 'critical'
    dataSource: text('data_source').notNull(), // 'ble_device' | 'manual_entry' | 'simulated_device'
    isSimulated: boolean('is_simulated').default(false).notNull(),
    validationStatus: text('validation_status').notNull().default('validated'), // 'validated' | 'flagged' | 'pending_review'
    referenceRangeSnapshot: jsonb('reference_range_snapshot').$type<ReferenceRangeConfig | null>(),
    idempotencyKey: text('idempotency_key').unique(),
    notes: text('notes'),
    rawPacketHex: text('raw_packet_hex'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('measurements_user_uid_idx').on(table.userUid),
    index('measurements_measured_at_idx').on(table.measuredAt),
    index('measurements_test_type_idx').on(table.testType),
    index('measurements_patient_id_idx').on(table.patientRecordId),
    index('measurements_session_id_idx').on(table.sessionId),
    index('measurements_hospital_id_idx').on(table.hospitalId),
  ],
);

// 6. Calibration Records
export const calibrationRecords = pgTable(
  'calibration_records',
  {
    id: serial('id').primaryKey(),
    calibrationCode: text('calibration_code').notNull().unique(),
    deviceId: integer('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    sensorChannel: text('sensor_channel').notNull(),
    calibrationDate: timestamp('calibration_date').defaultNow().notNull(),
    calibrationParameters: jsonb('calibration_parameters')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    calibrationStatus: text('calibration_status').notNull().default('passed'), // 'passed' | 'pending' | 'failed' | 'expired'
    verifiedByUid: text('verified_by_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    verifiedByName: text('verified_by_name'),
    nextDueDate: timestamp('next_due_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('calibration_records_device_id_idx').on(table.deviceId),
    index('calibration_records_hospital_id_idx').on(table.hospitalId),
    index('calibration_records_status_idx').on(table.calibrationStatus),
  ],
);

// 7. Reports
export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    patientRecordId: integer('patient_record_id').references(() => patients.id, {
      onDelete: 'set null',
    }),
    sessionId: integer('session_id').references(() => testSessions.id, {
      onDelete: 'set null',
    }),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    reportCode: text('report_code').notNull().unique(),
    title: text('title').notNull(),
    patientName: text('patient_name').notNull(),
    patientId: text('patient_id').notNull(),
    measurementIds: jsonb('measurement_ids').$type<number[]>().notNull(),
    includesSimulatedData: boolean('includes_simulated_data')
      .default(false)
      .notNull(),
    reportFileLocation: text('report_file_location'),
    verificationStatus: text('verification_status').notNull().default('verified'), // 'verified' | 'simulated_only' | 'draft'
    generatedByUid: text('generated_by_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    generatedByName: text('generated_by_name'),
    summaryNotes: text('summary_notes'),
    deviceSnapshot: jsonb('device_snapshot').$type<{
      deviceName: string;
      deviceIdentifier: string;
      firmwareVersion?: string | null;
      isSimulated?: boolean;
    } | null>(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
  },
  (table) => [
    index('reports_user_uid_idx').on(table.userUid),
    index('reports_patient_id_idx').on(table.patientRecordId),
    index('reports_hospital_id_idx').on(table.hospitalId),
  ],
);

// Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    category: text('category').notNull(), // 'measurement' | 'device' | 'report' | 'system'
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_uid_idx').on(table.userUid)],
);

// 9. Audit Logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    actorRole: text('actor_role').notNull().default('consumer'),
    hospitalId: integer('hospital_id').references(() => hospitals.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    ipAddress: text('ip_address'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_user_uid_idx').on(table.userUid),
    index('audit_logs_hospital_id_idx').on(table.hospitalId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

// Relational Definitions
export const hospitalsRelations = relations(hospitals, ({ many }) => ({
  users: many(users),
  patients: many(patients),
  devices: many(devices),
  testSessions: many(testSessions),
  measurements: many(measurements),
  reports: many(reports),
  calibrationRecords: many(calibrationRecords),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  hospital: one(hospitals, {
    fields: [users.hospitalId],
    references: [hospitals.id],
  }),
  patients: many(patients),
  devices: many(devices),
  testSessions: many(testSessions),
  measurements: many(measurements),
  reports: many(reports),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  owner: one(users, {
    fields: [patients.ownerUid],
    references: [users.uid],
  }),
  hospital: one(hospitals, {
    fields: [patients.hospitalId],
    references: [hospitals.id],
  }),
  testSessions: many(testSessions),
  measurements: many(measurements),
  reports: many(reports),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  owner: one(users, {
    fields: [devices.ownerUid],
    references: [users.uid],
  }),
  hospital: one(hospitals, {
    fields: [devices.hospitalId],
    references: [hospitals.id],
  }),
  events: many(deviceEvents),
  calibrationRecords: many(calibrationRecords),
  testSessions: many(testSessions),
  measurements: many(measurements),
}));

export const deviceEventsRelations = relations(deviceEvents, ({ one }) => ({
  device: one(devices, {
    fields: [deviceEvents.deviceId],
    references: [devices.id],
  }),
  user: one(users, {
    fields: [deviceEvents.userUid],
    references: [users.uid],
  }),
}));

export const testSessionsRelations = relations(testSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [testSessions.userUid],
    references: [users.uid],
  }),
  patient: one(patients, {
    fields: [testSessions.patientRecordId],
    references: [patients.id],
  }),
  device: one(devices, {
    fields: [testSessions.deviceId],
    references: [devices.id],
  }),
  hospital: one(hospitals, {
    fields: [testSessions.hospitalId],
    references: [hospitals.id],
  }),
  measurements: many(measurements),
  reports: many(reports),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
  user: one(users, {
    fields: [measurements.userUid],
    references: [users.uid],
  }),
  device: one(devices, {
    fields: [measurements.deviceId],
    references: [devices.id],
  }),
  patient: one(patients, {
    fields: [measurements.patientRecordId],
    references: [patients.id],
  }),
  session: one(testSessions, {
    fields: [measurements.sessionId],
    references: [testSessions.id],
  }),
  hospital: one(hospitals, {
    fields: [measurements.hospitalId],
    references: [hospitals.id],
  }),
}));

export const calibrationRecordsRelations = relations(
  calibrationRecords,
  ({ one }) => ({
    device: one(devices, {
      fields: [calibrationRecords.deviceId],
      references: [devices.id],
    }),
    hospital: one(hospitals, {
      fields: [calibrationRecords.hospitalId],
      references: [hospitals.id],
    }),
    verifiedBy: one(users, {
      fields: [calibrationRecords.verifiedByUid],
      references: [users.uid],
    }),
  }),
);

export const reportsRelations = relations(reports, ({ one }) => ({
  user: one(users, {
    fields: [reports.userUid],
    references: [users.uid],
  }),
  patient: one(patients, {
    fields: [reports.patientRecordId],
    references: [patients.id],
  }),
  session: one(testSessions, {
    fields: [reports.sessionId],
    references: [testSessions.id],
  }),
  hospital: one(hospitals, {
    fields: [reports.hospitalId],
    references: [hospitals.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userUid],
    references: [users.uid],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userUid],
    references: [users.uid],
  }),
  hospital: one(hospitals, {
    fields: [auditLogs.hospitalId],
    references: [hospitals.id],
  }),
}));
