-- "Shared with everyone in the account" was stored as the principal type 'workspace'; that is now 'tenant'.
UPDATE drive_access SET principal_type = 'tenant' WHERE principal_type = 'workspace';
