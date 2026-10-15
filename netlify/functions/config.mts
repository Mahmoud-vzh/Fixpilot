import type { Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { publicConfig } from '../lib/config';

export default (request: Request, context: Context) => publicConfig(request, {
  env: (name) => Netlify.env.get(name),
  pool: () => getDatabase().pool,
  ip: context.ip || 'unknown-network',
});
