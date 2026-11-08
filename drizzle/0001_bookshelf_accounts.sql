CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`password_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_key_unique` ON `accounts` (`username_key`);--> statement-breakpoint
CREATE TABLE `account_auth_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_auth_limits_expiry` ON `account_auth_limits` (`expires`);--> statement-breakpoint
CREATE TABLE `account_sites_imports` (
	`sites_owner` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_sites_imports_account_id_unique` ON `account_sites_imports` (`account_id`);--> statement-breakpoint
CREATE TABLE `account_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_sessions_expiry` ON `account_sessions` (`expires`);