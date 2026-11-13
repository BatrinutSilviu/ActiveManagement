// Database backups: their list, backing up now, and downloading one (see backup.js).
import express from 'express';
import { resolve } from 'node:path';
import { BACKUP_DIR, BACKUP_NAME, backupStatus, makeBackup } from '../backup.js';
import { need } from '../http.js';

export const router = express.Router({ caseSensitive: true });

router.get('/backups', (req, res) => res.json(backupStatus()));

router.post('/backups', (req, res) => res.json({ name: makeBackup('manual') }));

router.get('/backups/:name/download', (req, res) => {
  need(BACKUP_NAME.test(req.params.name), 'Unknown backup');
  res.download(resolve(BACKUP_DIR, req.params.name), `active-${req.params.name}`, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Backup not found' });
  });
});
