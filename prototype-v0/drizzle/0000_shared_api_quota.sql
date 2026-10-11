CREATE TABLE `api_quota_clock` (
  `key_hash` text PRIMARY KEY NOT NULL,
  `next_at` integer NOT NULL,
  `permit` text NOT NULL,
  `blocked_until` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `api_quota_hours` (
  `key_hash` text NOT NULL,
  `hour` integer NOT NULL,
  `used` integer NOT NULL,
  PRIMARY KEY (`key_hash`, `hour`)
);
