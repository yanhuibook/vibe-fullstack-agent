import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'profiles/warehouse-mysql84.json');
const promptPath = path.join(root, 'init-prompt.md');

test('profile adds operation_logs table and log fields', async () => {
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  assert.ok(profile.data_model.tables.includes('operation_logs'));
  const fields = profile.data_model.operation_log_fields;
  assert.ok(Array.isArray(fields));
  for (const name of ['admin_id', 'action', 'target_type', 'target_id', 'detail', 'ip', 'created_at']) {
    assert.ok(fields.includes(name), `operation_log_fields missing ${name}`);
  }
  assert.ok(profile.data_model.operation_log_rules.some((rule) => /state-changing/.test(rule)));
});

test('profile describes system settings with save and restore defaults', async () => {
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  const settings = profile.system_settings;
  const keys = settings.fields.map((field) => field.key);
  for (const key of [
    'platform_name',
    'default_warning_threshold',
    'notification_enabled',
    'default_category_id',
    'operation_log_retention_days',
    'low_stock_email_enabled',
    'low_stock_email_recipients',
    'low_stock_email_send_time'
  ]) {
    assert.ok(keys.includes(key), `system_settings missing ${key}`);
  }
  const retention = settings.fields.find((field) => field.key === 'operation_log_retention_days');
  assert.equal(retention.default, 90);
  const sendTime = settings.fields.find((field) => field.key === 'low_stock_email_send_time');
  assert.equal(sendTime.default, '09:00');
  assert.match(settings.save, /POST \/api\/admin\/settings/);
  assert.match(settings.restore_defaults, /POST \/api\/admin\/settings\/restore-defaults/);
  assert.match(settings.restore_defaults, /second explicit confirmation/);
});

test('profile defines scheduled daily low-stock email and log cleanup', async () => {
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  const tasks = profile.scheduled_tasks;
  assert.ok(Array.isArray(tasks));
  const emailTask = tasks.find((task) => task.name === 'daily-low-stock-email');
  assert.ok(emailTask);
  assert.match(emailTask.time, /09:00/);
  assert.match(emailTask.command, /php think low-stock:email/);
  assert.match(emailTask.behavior, /stock_quantity <= warning_threshold/);
  const cleanupTask = tasks.find((task) => task.name === 'operation-log-cleanup');
  assert.ok(cleanupTask);
  assert.match(cleanupTask.command, /php think operation-log:cleanup/);
});

test('profile keeps SMTP credentials out of the repository', async () => {
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  assert.ok(profile.mail.env_keys.includes('MAIL_PASSWORD'));
  assert.match(profile.mail.credentials_source, /local project \.env only/);
  assert.ok(profile.mail.rules.some((rule) => /placeholders only/.test(rule)));
  assert.ok(profile.safety.some((rule) => /SMTP passwords/.test(rule)));
});

test('generation prompt requires the system settings page and mail placeholders', async () => {
  const prompt = await fs.readFile(promptPath, 'utf8');
  assert.match(prompt, /System settings page/);
  assert.match(prompt, /POST \/api\/admin\/settings\/restore-defaults/);
  assert.match(prompt, /operation_logs/);
  assert.match(prompt, /php think low-stock:email/);
  assert.match(prompt, /MAIL_PASSWORD/);
  assert.match(prompt, /second explicit confirmation/);
  assert.match(prompt, /Linux crontab line and a Windows scheduled-task example/);
});
