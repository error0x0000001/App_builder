-- Record attachments belonged to the object records that no longer exist: remove their folders and file rows (conversation folders are untouched).
DELETE FROM drive_stars WHERE (item_type = 'file' AND item_id IN (SELECT id FROM drive_files WHERE record_object IS NOT NULL AND record_object <> '@chat'))
  OR (item_type = 'folder' AND item_id IN (SELECT id FROM drive_folders WHERE kind IN ('records', 'record')));--> statement-breakpoint
DELETE FROM drive_files WHERE record_object IS NOT NULL AND record_object <> '@chat';--> statement-breakpoint
DELETE FROM drive_folders WHERE kind IN ('records', 'record');
