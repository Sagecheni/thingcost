-- Automated marketplace price tracking is no longer a Chronicle product capability.
-- Tokens whose only authority was the retired scope are removed; mixed-scope tokens
-- keep their remaining permissions without gaining any replacement capability.
DELETE FROM "personal_access_tokens"
WHERE cardinality(array_remove("scopes", 'prices:write')) = 0;
--> statement-breakpoint
UPDATE "personal_access_tokens"
SET "scopes" = array_remove("scopes", 'prices:write')
WHERE 'prices:write' = ANY("scopes");
