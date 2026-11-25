CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_uid" text NOT NULL,
	"actor_role" text DEFAULT 'consumer' NOT NULL,
	"hospital_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"ip_address" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"calibration_code" text NOT NULL,
	"device_id" integer NOT NULL,
	"hospital_id" integer,
	"sensor_channel" text NOT NULL,
	"calibration_date" timestamp DEFAULT now() NOT NULL,
	"calibration_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"calibration_status" text DEFAULT 'passed' NOT NULL,
	"verified_by_uid" text,
	"verified_by_name" text,
	"next_due_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_records_calibration_code_unique" UNIQUE("calibration_code")
);
--> statement-breakpoint
CREATE TABLE "device_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" integer NOT NULL,
	"user_uid" text NOT NULL,
	"event_type" text NOT NULL,
	"connection_mode" text DEFAULT 'ble' NOT NULL,
	"error_code" text,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"hospital_id" integer,
	"device_name" text NOT NULL,
	"device_identifier" text NOT NULL,
	"device_model" text DEFAULT 'Hema Nexus Multi-Port v1' NOT NULL,
	"firmware_version" text,
	"hardware_revision" text,
	"connection_type" text DEFAULT 'ble' NOT NULL,
	"status" text DEFAULT 'paired' NOT NULL,
	"calibration_status" text DEFAULT 'uncalibrated' NOT NULL,
	"sensor_channels" jsonb,
	"last_connected_at" timestamp,
	"last_communication_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" serial PRIMARY KEY NOT NULL,
	"hospital_code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"contact_email" text,
	"contact_phone" text,
	"registration_number" text,
	"account_status" text DEFAULT 'active' NOT NULL,
	"owner_uid" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hospitals_hospital_code_unique" UNIQUE("hospital_code")
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_uid" text NOT NULL,
	"device_id" integer,
	"patient_record_id" integer,
	"session_id" integer,
	"hospital_id" integer,
	"test_type" text NOT NULL,
	"test_name" text NOT NULL,
	"measured_value" double precision NOT NULL,
	"secondary_value" double precision,
	"unit" text NOT NULL,
	"measured_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"data_source" text NOT NULL,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"validation_status" text DEFAULT 'validated' NOT NULL,
	"reference_range_snapshot" jsonb,
	"idempotency_key" text,
	"notes" text,
	"raw_packet_hex" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "measurements_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_uid" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"category" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"hospital_id" integer,
	"uhid" text NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" text,
	"sex" text,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_uid" text NOT NULL,
	"patient_record_id" integer,
	"session_id" integer,
	"hospital_id" integer,
	"report_code" text NOT NULL,
	"title" text NOT NULL,
	"patient_name" text NOT NULL,
	"patient_id" text NOT NULL,
	"measurement_ids" jsonb NOT NULL,
	"includes_simulated_data" boolean DEFAULT false NOT NULL,
	"report_file_location" text,
	"verification_status" text DEFAULT 'verified' NOT NULL,
	"generated_by_uid" text,
	"generated_by_name" text,
	"summary_notes" text,
	"device_snapshot" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reports_report_code_unique" UNIQUE("report_code")
);
--> statement-breakpoint
CREATE TABLE "test_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_code" text NOT NULL,
	"user_uid" text NOT NULL,
	"patient_record_id" integer,
	"device_id" integer,
	"hospital_id" integer,
	"operator_name" text,
	"test_mode" text DEFAULT 'simulated' NOT NULL,
	"session_status" text DEFAULT 'in_progress' NOT NULL,
	"completion_status" text DEFAULT 'incomplete' NOT NULL,
	"selected_parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_details" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_sessions_session_code_unique" UNIQUE("session_code")
);
--> statement-breakpoint
CREATE TABLE "test_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"test_name" text NOT NULL,
	"category" text NOT NULL,
	"port_number" integer,
	"unit" text NOT NULL,
	"secondary_unit" text,
	"availability_status" text NOT NULL,
	"sensing_method" text NOT NULL,
	"description" text NOT NULL,
	"instructions" jsonb NOT NULL,
	"reference_range_config" jsonb NOT NULL,
	"accent_color" text DEFAULT '#2563EB' NOT NULL,
	CONSTRAINT "test_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"phone" text,
	"date_of_birth" text,
	"patient_code" text NOT NULL,
	"avatar_url" text,
	"password_hash" text,
	"role" text DEFAULT 'consumer' NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"hospital_id" integer,
	"preferences" jsonb DEFAULT '{"theme":"light","unitSystem":"conventional","notificationsEnabled":true,"deviceAlertsEnabled":true,"autoSyncBle":true,"shareQrIncludeEmergencyInfo":false}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_verified_by_uid_users_uid_fk" FOREIGN KEY ("verified_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_owner_uid_users_uid_fk" FOREIGN KEY ("owner_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_patient_record_id_patients_id_fk" FOREIGN KEY ("patient_record_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_owner_uid_users_uid_fk" FOREIGN KEY ("owner_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_patient_record_id_patients_id_fk" FOREIGN KEY ("patient_record_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_uid_users_uid_fk" FOREIGN KEY ("generated_by_uid") REFERENCES "public"."users"("uid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_patient_record_id_patients_id_fk" FOREIGN KEY ("patient_record_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_user_uid_idx" ON "audit_logs" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "audit_logs_hospital_id_idx" ON "audit_logs" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "calibration_records_device_id_idx" ON "calibration_records" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "calibration_records_hospital_id_idx" ON "calibration_records" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "calibration_records_status_idx" ON "calibration_records" USING btree ("calibration_status");--> statement-breakpoint
CREATE INDEX "device_events_device_id_idx" ON "device_events" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_events_user_uid_idx" ON "device_events" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "device_events_created_at_idx" ON "device_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "devices_owner_uid_idx" ON "devices" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "devices_hospital_id_idx" ON "devices" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "devices_identifier_idx" ON "devices" USING btree ("device_identifier");--> statement-breakpoint
CREATE INDEX "hospitals_owner_uid_idx" ON "hospitals" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "hospitals_name_idx" ON "hospitals" USING btree ("name");--> statement-breakpoint
CREATE INDEX "measurements_user_uid_idx" ON "measurements" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "measurements_measured_at_idx" ON "measurements" USING btree ("measured_at");--> statement-breakpoint
CREATE INDEX "measurements_test_type_idx" ON "measurements" USING btree ("test_type");--> statement-breakpoint
CREATE INDEX "measurements_patient_id_idx" ON "measurements" USING btree ("patient_record_id");--> statement-breakpoint
CREATE INDEX "measurements_session_id_idx" ON "measurements" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "measurements_hospital_id_idx" ON "measurements" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "notifications_user_uid_idx" ON "notifications" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "patients_owner_uid_idx" ON "patients" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "patients_hospital_id_idx" ON "patients" USING btree ("hospital_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_owner_uhid_idx" ON "patients" USING btree ("owner_uid","uhid");--> statement-breakpoint
CREATE INDEX "reports_user_uid_idx" ON "reports" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "reports_patient_id_idx" ON "reports" USING btree ("patient_record_id");--> statement-breakpoint
CREATE INDEX "reports_hospital_id_idx" ON "reports" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "test_sessions_user_uid_idx" ON "test_sessions" USING btree ("user_uid");--> statement-breakpoint
CREATE INDEX "test_sessions_patient_id_idx" ON "test_sessions" USING btree ("patient_record_id");--> statement-breakpoint
CREATE INDEX "test_sessions_hospital_id_idx" ON "test_sessions" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "test_sessions_started_at_idx" ON "test_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_hospital_id_idx" ON "users" USING btree ("hospital_id");