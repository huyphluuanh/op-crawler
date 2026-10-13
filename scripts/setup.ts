// Cài đặt / cập nhật toàn bộ hệ thống bằng 1 lệnh: `npm run setup`
//  1. Đọc DISCORD_BOT_TOKEN + APIFY_TOKEN từ secrets.local.env (không commit)
//  2. Kiểm tra token, đưa secrets lên Supabase, deploy 2 Edge Function
//  3. Trỏ Discord Interactions Endpoint về Supabase, đăng ký lệnh, in link mời bot vào server
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { COMMANDS } from '../supabase/functions/_shared/commands.ts';

export const PROJECT_REF = 'xphjrfuogetlvgxvclzp';
const SECRETS_FILE = 'secrets.local.env';
const DISCORD = 'https://discord.com/api/v10';
// Xem kênh + gửi tin + nhúng link + đính kèm file
const BOT_PERMISSIONS = 1024 + 2048 + 16384 + 32768;

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function supabase(args: string[]) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE') || k === 'AI_AGENT' || k === 'NO_COLOR') delete env[k];
  const r = spawnSync('npx.cmd', ['supabase', ...args], { stdio: 'inherit', shell: true, env });
  if (r.status !== 0) throw new Error(`supabase ${args[0]} ${args[1] ?? ''} thất bại`);
}

async function discord(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(DISCORD + path, {
    method,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (setup, 0.1)' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Discord ${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  let env = readEnv(SECRETS_FILE);
  if (!env.DISCORD_BOT_TOKEN || !env.APIFY_TOKEN) {
    if (!existsSync(SECRETS_FILE)) {
      writeFileSync(SECRETS_FILE, 'DISCORD_BOT_TOKEN=\nAPIFY_TOKEN=\n');
    }
    console.log(`→ Notepad sẽ mở file ${SECRETS_FILE}: dán 2 token vào sau dấu "=", bấm Ctrl+S, đóng Notepad.`);
    spawnSync('notepad.exe', [SECRETS_FILE], { stdio: 'inherit' });
    env = readEnv(SECRETS_FILE);
    if (!env.DISCORD_BOT_TOKEN || !env.APIFY_TOKEN) {
      throw new Error(`Chưa có đủ DISCORD_BOT_TOKEN và APIFY_TOKEN trong ${SECRETS_FILE}.`);
    }
  }

  console.log('→ Kiểm tra token Discord…');
  const app = await discord('GET', '/applications/@me', env.DISCORD_BOT_TOKEN);
  console.log(`  Bot: ${app.name} (id ${app.id})`);

  console.log('→ Kiểm tra token Apify…');
  const apify = await fetch('https://api.apify.com/v2/users/me', { headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` } });
  if (!apify.ok) throw new Error(`Token Apify không hợp lệ (${apify.status}).`);
  console.log(`  Apify: ${(await apify.json()).data.username}`);

  if (!env.WEBHOOK_SECRET) {
    env.WEBHOOK_SECRET = randomBytes(24).toString('hex');
    writeFileSync(SECRETS_FILE, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  }

  console.log('→ Tạo / cập nhật bảng database…');
  for (const file of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
    supabase(['db', 'query', '--linked', '--project-ref', PROJECT_REF, '-f', `supabase/migrations/${file}`]);
  }

  console.log('→ Đưa secrets lên Supabase…');
  const tmp = 'supabase/.secrets.tmp.env';
  writeFileSync(tmp, [
    `DISCORD_BOT_TOKEN=${env.DISCORD_BOT_TOKEN}`,
    `DISCORD_PUBLIC_KEY=${app.verify_key}`,
    `DISCORD_APP_ID=${app.id}`,
    `APIFY_TOKEN=${env.APIFY_TOKEN}`,
    `WEBHOOK_SECRET=${env.WEBHOOK_SECRET}`,
  ].join('\n') + '\n');
  try {
    supabase(['secrets', 'set', '--env-file', tmp, '--project-ref', PROJECT_REF]);
  } finally {
    unlinkSync(tmp);
  }

  console.log('→ Deploy Edge Functions…');
  supabase(['functions', 'deploy', 'discord', '--project-ref', PROJECT_REF, '--no-verify-jwt', '--use-api']);
  supabase(['functions', 'deploy', 'apify-webhook', '--project-ref', PROJECT_REF, '--no-verify-jwt', '--use-api']);

  console.log('→ Trỏ Discord Interactions Endpoint…');
  const endpoint = `https://${PROJECT_REF}.supabase.co/functions/v1/discord`;
  // Function mới deploy có thể cần vài giây mới nhận request → thử lại vài lần
  for (let attempt = 1; ; attempt++) {
    try {
      await discord('PATCH', '/applications/@me', env.DISCORD_BOT_TOKEN, { interactions_endpoint_url: endpoint });
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log('→ Đăng ký lệnh…');
  const registered = await discord('PUT', `/applications/${app.id}/commands`, env.DISCORD_BOT_TOKEN, COMMANDS);
  console.log(`  ${registered.map((c: { name: string }) => c.name).join(', ')}`);

  const invite = `https://discord.com/oauth2/authorize?client_id=${app.id}&scope=bot+applications.commands&permissions=${BOT_PERMISSIONS}`;
  writeFileSync('invite-link.txt', invite + '\n');
  console.log(`\n✅ Xong. Link mời bot vào server Discord (đã lưu ở invite-link.txt):\n${invite}\n`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message ?? e}`);
  process.exit(1);
});
