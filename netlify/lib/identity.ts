import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const mac = (key: string, value: string) =>
  createHmac('sha256', key).update(value).digest('hex');
// Key never leaves the Function. Cookies contain only a random ID and signature.
export function visitorIdentity(
  request: Request,
  key: string,
  ip: string,
  date = new Date(),
) {
  const cookie =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('fp_visitor='))
      ?.slice(11) || '';
  const [candidate, signature] = cookie.split('.');
  const valid =
    /^[a-f0-9-]{36}$/.test(candidate || '') &&
    /^[a-f0-9]{64}$/.test(signature || '') &&
    timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(mac(key, 'visitor:' + candidate)),
    );
  const id = valid ? candidate : randomUUID(),
    day = date.toISOString().slice(0, 10);
  return {
    visitorHash: mac(key, 'quota:' + day + ':' + id),
    networkHash: mac(key, 'network:' + day + ':' + ip),
    cookie: `fp_visitor=${id}.${mac(key, 'visitor:' + id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
  };
}
