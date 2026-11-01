CREATE TABLE `job_descriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`job_id` integer NOT NULL,
	`text` text,
	`html` text,
	`method` text,
	`fetched_at` integer,
	`error` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_descriptions_job_id_unique` ON `job_descriptions` (`job_id`);--> statement-breakpoint
CREATE TABLE `job_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`job_id` integer NOT NULL,
	`profile_version` integer NOT NULL,
	`matcher_version` text NOT NULL,
	`status` text NOT NULL,
	`result` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_matches_job_id_unique` ON `job_matches` (`job_id`);--> statement-breakpoint
CREATE TABLE `job_pulls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`added` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	`malformed` integer DEFAULT 0 NOT NULL,
	`not_modified` integer DEFAULT false NOT NULL,
	`window_days` integer,
	`error` text,
	`etag` text
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source` text NOT NULL,
	`source_listing_id` text NOT NULL,
	`company` text NOT NULL,
	`company_url` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`locations` text NOT NULL,
	`terms` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`degrees` text NOT NULL,
	`sponsorship` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`ats_type` text NOT NULL,
	`date_posted` integer NOT NULL,
	`date_updated` integer NOT NULL,
	`active` integer NOT NULL,
	`first_seen_pull_id` integer,
	`last_seen_pull_id` integer,
	`user_status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`first_seen_pull_id`) REFERENCES `job_pulls`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_seen_pull_id`) REFERENCES `job_pulls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_listing` ON `jobs` (`source`,`source_listing_id`);--> statement-breakpoint
CREATE INDEX `jobs_active` ON `jobs` (`active`);--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`action` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ok` integer NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resume_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resume_id` integer NOT NULL,
	`draft` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`llm_call_id` integer,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`llm_call_id`) REFERENCES `llm_calls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`file_path` text NOT NULL,
	`original_name` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`extracted_text` text DEFAULT '' NOT NULL
);
