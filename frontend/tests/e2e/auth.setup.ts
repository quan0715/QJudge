import { test as setup } from '@playwright/test';
import { loginViaAPI } from '../helpers/auth.helper';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.join(__dirname, '../../.auth');

// Ensure auth directory exists
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

const roles = ['admin', 'teacher', 'student'] as const;

for (const role of roles) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    // Using loginViaAPI for speed, which handles localStorage token and user data
    await loginViaAPI(page, role);
    
    // Navigate to a protected page to verify and ensure session is active
    await page.goto('/dashboard');
    
    // Save storage state for this role
    await page.context().storageState({ path: path.join(authDir, `${role}.json`) });
  });
}
