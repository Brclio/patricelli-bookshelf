CREATE TABLE `purchases` (
	`owner` text NOT NULL,
	`edition` text NOT NULL,
	PRIMARY KEY(`owner`, `edition`)
);
