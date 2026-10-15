import type { Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { handleDiagnosis } from '../lib/handler';
export default (request: Request, context: Context) =>
  handleDiagnosis(request, {
    env: (name) => Netlify.env.get(name),
    pool: () => getDatabase().pool,
    ip: context.ip || 'unknown-network',
  });
