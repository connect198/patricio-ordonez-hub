import type { Config } from '@netlify/functions';
import { json, route } from './_lib/http';
import { requireStaff } from './_lib/auth';

export const config: Config = { path: '/api/status' };

/** Tells managers which server-side integrations are configured (never reveals values). */
export default route(['GET'], async (req) => {
  await requireStaff(req, null, 'staff');
  return json({
    jotform: !!process.env.JOTFORM_API_KEY,
    credentials: (process.env.CREDENTIAL_PEPPER ?? '').length >= 32,
    siteUrl: process.env.PUBLIC_SITE_URL || null,
    formId: process.env.JOTFORM_FORM_ID || null,
  });
});
