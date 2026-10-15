import fs from 'node:fs';
import path from 'node:path';
const bundle = process.argv.includes('--bundle');
const excluded = new Set([
  'node_modules',
  '.git',
  '.netlify',
  'coverage',
  'dist',
]);
const rules = {
  provider_key:
    /\b(?:AIza[\w-]{30,}|sk-(?:proj-|svcacct-)?[\w-]{20,}|gh[pousr]_[\w]{30,}|github_pat_[\w]{20,}|AKIA[A-Z0-9]{16})/,
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  credential_in_url: /:\/\/[^\s/:]+:[^\s/@]{4,}@/,
  credential_literal:
    /(?:api[_-]?key|auth[_-]?token|access[_-]?token|password)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{16,}['"]/i,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
};
const findings = [];
let files = 0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(p);
      continue;
    }
    if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example')
      findings.push({ file: p, kind: 'environment_file' });
    const bytes = fs.readFileSync(p);
    if (bytes.includes(0)) continue;
    files++;
    const text = bytes.toString('utf8');
    for (const [kind, re] of Object.entries(rules))
      for (const [i, line] of text.split('\n').entries())
        if (re.test(line)) findings.push({ file: p, line: i + 1, kind });
    if (bundle) {
      for (const forbidden of [
        'GEMINI_API_KEY',
        'x-goog-api-key',
        'generativelanguage.googleapis.com',
      ])
        if (text.includes(forbidden))
          findings.push({ file: p, kind: 'server_only_identifier' });
      const key = process.env.GEMINI_API_KEY;
      if (
        key &&
        [
          key,
          Buffer.from(key).toString('base64'),
          encodeURIComponent(key),
        ].some((v) => text.includes(v))
      )
        findings.push({ file: p, kind: 'configured_secret' });
    }
  }
}
scan(bundle ? 'dist' : '.');
console.log(
  JSON.stringify(
    {
      scope: bundle ? 'built frontend' : 'source and config',
      textFiles: files,
      findings,
    },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
