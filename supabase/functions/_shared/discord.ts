// Gọi Discord API + xác thực chữ ký request Interactions.
import nacl from 'npm:tweetnacl@1.0.3';

const API = 'https://discord.com/api/v10';
const UA = 'DiscordBot (https://github.com/huyphluuanh/op-crawler, 0.1)';

const hex = (s: string) => new Uint8Array(s.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

export function verifySignature(body: string, signature: string | null, timestamp: string | null): boolean {
  const key = Deno.env.get('DISCORD_PUBLIC_KEY');
  if (!key || !signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(timestamp + body), hex(signature), hex(key));
  } catch {
    return false;
  }
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  footer?: { text: string };
}

export interface MessageBody {
  content?: string;
  embeds?: Embed[];
  allowed_mentions?: { parse?: string[]; users?: string[] };
}

export interface Attachment {
  name: string;
  data: string;
  type?: string;
}

async function send(method: string, path: string, body: MessageBody, files: Attachment[] = [], bot = false) {
  const headers: Record<string, string> = { 'User-Agent': UA };
  if (bot) headers.Authorization = `Bot ${Deno.env.get('DISCORD_BOT_TOKEN')}`;
  let payload: BodyInit;
  if (files.length) {
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify({
      ...body,
      attachments: files.map((f, i) => ({ id: i, filename: f.name })),
    }));
    files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.data], { type: f.type ?? 'text/plain' }), f.name));
    payload = fd;
  } else {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  if (!res.ok) throw new Error(`Discord ${method} ${path.split('/')[1]} → ${res.status}: ${await res.text()}`);
}

/** Sửa tin nhắn "đang xử lý…" của lệnh (token hiệu lực 15 phút). */
export const editOriginal = (appId: string, token: string, body: MessageBody, files?: Attachment[]) =>
  send('PATCH', `/webhooks/${appId}/${token}/messages/@original`, body, files);

export const followup = (appId: string, token: string, body: MessageBody, files?: Attachment[]) =>
  send('POST', `/webhooks/${appId}/${token}`, body, files);

export const channelMessage = (channelId: string, body: MessageBody, files?: Attachment[]) =>
  send('POST', `/channels/${channelId}/messages`, body, files, true);

const TOKEN_TTL_MS = 14 * 60 * 1000;

/**
 * Gửi tin nhắn cho job: trong 14 phút đầu dùng token của lệnh (không cần quyền gì),
 * sau đó (crawl lâu) gửi thẳng vào kênh bằng bot.
 */
export async function notifyJob(
  job: { created_at: string; discord_app_id: string | null; discord_token: string | null; discord_channel_id: string | null },
  body: MessageBody,
  files?: Attachment[],
) {
  const fresh = Date.now() - new Date(job.created_at).getTime() < TOKEN_TTL_MS;
  if (fresh && job.discord_app_id && job.discord_token) {
    try {
      return await followup(job.discord_app_id, job.discord_token, body, files);
    } catch (e) {
      console.error('followup failed, fallback to channel', e);
    }
  }
  if (job.discord_channel_id) return await channelMessage(job.discord_channel_id, body, files);
}

export const COLOR = { info: 0x3b82f6, ok: 0x22c55e, warn: 0xf59e0b, err: 0xef4444 };
