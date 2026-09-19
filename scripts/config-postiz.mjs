#!/usr/bin/env node
/**
 * 一键探测 Postiz 渠道,并自动回填 POSTIZ_INTEGRATION_ID_*
 *
 * 用法:
 *   npm run postiz:channels           # 只查看当前渠道与被识别的平台
 *   npm run postiz:channels -- --write # 把识别到的 id 写回 .env.local
 *
 * 前置条件:
 *   1. Postiz 已启动:  docker compose -f deployments/postiz/docker-compose.yml up -d
 *   2. .env.local 已填 POSTIZ_URL 与 POSTIZ_API_KEY
 *   3. 已在 Postiz UI 完成平台 OAuth(Settings → Channels)
 *
 * ⚠️ 重要:Postiz 只支持海外平台(TikTok/YouTube/X/Instagram/LinkedIn/Facebook 等),
 *   不支持抖音 / 快手 / B站 这些国内平台。国内平台请走项目的手动发布流程
 *   (成片 + 标题/简介/标签/封面已按平台规格生成,人工去平台后台发布)。
 *
 * 注意:只写 .env.local(已被 .gitignore 排除),绝不提交任何密钥。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.local');

/** Postiz 实际支持的海外平台(用于回填 POSTIZ_INTEGRATION_ID_*) */
const PLATFORMS = ['tiktok', 'youtube', 'twitter', 'instagram', 'linkedin', 'facebook', 'bluesky', 'mastodon', 'reddit', 'threads'];

function readEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

function parseEnv(lines) {
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** 与 src/lib/publish/dispatch.ts 的 postizPublicBaseUrl 保持一致 */
function publicBaseUrl(env) {
  const raw = (env.POSTIZ_URL || env.POSTIZ_API_URL || 'https://api.postiz.com').replace(/\/+$/, '');
  return /\/public\/v1$/i.test(raw) ? raw : `${raw}/public/v1`;
}

/** 识别 Postiz 真实支持的海外平台(注意:tiktok 是国际版,不是抖音) */
function inferPlatformHint(input) {
  const text = String(input || '').toLowerCase();
  if (/(youtube|谷歌视频|油管)/.test(text)) return 'youtube';
  if (/(instagram|\binsta\b|\bins\b)/.test(text)) return 'instagram';
  if (/(linkedin|领英)/.test(text)) return 'linkedin';
  if (/(facebook|脸书)/.test(text)) return 'facebook';
  if (/(tiktok|tik tok)/.test(text)) return 'tiktok';
  if (/(bluesky|bsky)/.test(text)) return 'bluesky';
  if (/(mastodon)/.test(text)) return 'mastodon';
  if (/(reddit)/.test(text)) return 'reddit';
  if (/(threads)/.test(text)) return 'threads';
  if (/(twitter|推特|\bx\b)/.test(text)) return 'twitter';
  return 'unknown';
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['integrations', 'data', 'items', 'results']) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        const nested = extractArray(value);
        if (nested.length) return nested;
      }
    }
  }
  return [];
}

function pickString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNestedString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const nested = pickString(value, ['name', 'identifier', 'type', 'id']);
      if (nested) return nested;
    }
  }
  return undefined;
}

function normalize(payload) {
  return extractArray(payload)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = pickString(item, ['id', '_id', 'integrationId', 'identifier']);
      if (!id) return null;
      const name = pickString(item, ['name', 'title', 'label', 'username']) ?? id;
      const provider = pickNestedString(item, ['provider', 'social', 'service', 'platform']);
      const type = pickNestedString(item, ['type', 'platformType', 'identifier', 'settings']);
      return { id, name, provider, type, platformHint: inferPlatformHint([id, name, provider, type].filter(Boolean).join(' ')) };
    })
    .filter(Boolean);
}

function upsertEnv(lines, updates) {
  const result = [...lines];
  for (const [key, value] of Object.entries(updates)) {
    const idx = result.findIndex((line) => line.trim().startsWith(`${key}=`));
    if (idx === -1) result.push(`${key}=${value}`);
    else result[idx] = `${key}=${value}`;
  }
  return result;
}

async function main() {
  const write = process.argv.includes('--write');
  const lines = readEnvFile(ENV_FILE);
  if (!lines) {
    console.error('✗ 未找到 .env.local。请先 cp .env.example .env.local 并填写 POSTIZ_URL / POSTIZ_API_KEY。');
    process.exit(1);
  }
  const env = parseEnv(lines);
  const apiKey = (env.POSTIZ_API_KEY || '').trim();
  if (!apiKey) {
    console.error('✗ .env.local 缺少 POSTIZ_API_KEY。请先在 Postiz 生成 API Key 并填入。');
    process.exit(1);
  }

  const baseUrl = publicBaseUrl(env);
  const url = `${baseUrl}/integrations`;
  console.log(`→ 探测 ${url}`);

  let payload;
  try {
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.error(`✗ Postiz 返回 HTTP ${response.status}。`);
      console.error('  请确认:1) Postiz 已启动 2) API Key 正确 3) POSTIZ_URL 指向正确(自托管默认 http://localhost:5000/api)');
      if (response.status === 401 || response.status === 403) {
        console.error('');
        console.error('  最常见原因:Postiz 容器是重建的,数据库 volume 也是新的,旧 API Key 已失效。');
        console.error('  处理:打开 http://localhost:5000 → 注册/登录 → Settings → 生成新的 API Key,');
        console.error('  然后在指挥舱「辅助 → 本机配置中心」更新 POSTIZ_API_KEY,或手动改 .env.local 后重启 dev server。');
      }
      process.exit(2);
    }
    payload = await response.json().catch(() => []);
  } catch (error) {
    console.error('✗ 无法连接 Postiz:', error?.message || error);
    console.error('  启动命令: docker compose -f deployments/postiz/docker-compose.yml up -d');
    process.exit(2);
  }

  const integrations = normalize(payload);
  if (!integrations.length) {
    console.log('⚠️  Postiz API 可用,但没有返回任何已连接渠道。');
    console.log('   请先在 Postiz UI(Settings → Channels)完成海外平台(如 TikTok / YouTube / X)的 OAuth 授权,再重跑本命令。');
    console.log('');
    console.log('   另:抖音 / 快手 / B站 这些国内平台 Postiz 不支持,请走项目的手动发布流程。');
    process.exit(3);
  }

  console.log(`✓ 读取到 ${integrations.length} 个渠道:\n`);
  for (const item of integrations) {
    const tags = [item.provider, item.type].filter(Boolean).join(' / ');
    console.log(`  - ${item.id}  ${item.name}${tags ? `  [${tags}]` : ''}  → ${item.platformHint}`);
  }

  const updates = {};
  const unmatched = [];
  for (const platform of PLATFORMS) {
    const candidate = integrations.find((item) => item.platformHint === platform);
    if (candidate) updates[`POSTIZ_INTEGRATION_ID_${platform.toUpperCase()}`] = candidate.id;
    else unmatched.push(platform);
  }

  console.log('');
  if (Object.keys(updates).length) {
    console.log('将写入:');
    for (const [key, value] of Object.entries(updates)) console.log(`  ${key}=${value}`);
  }
  if (unmatched.length) {
    console.log(`\n⚠️  未能自动识别: ${unmatched.join('、')}`);
    console.log('   渠道名的 id/名称里没带上平台关键词,请按上面列表手动填入对应字段。');
  }

  console.log('\n📌 说明:Postiz 只支持海外平台。抖音/快手/B站 请走项目「手动发布」流程,不依赖 Postiz。');

  if (!write) {
    console.log('\n(只读模式。加 --write 会把以上 id 写回 .env.local)');
    return;
  }
  if (!Object.keys(updates).length) {
    console.log('\n没有可写入的 id,已跳过写回。');
    return;
  }

  const next = upsertEnv(lines, updates);
  fs.writeFileSync(ENV_FILE, next.join('\n'), 'utf8');
  console.log(`\n✓ 已写入 ${ENV_FILE}`);
  console.log('  重启 dev server 让 Next 读取新环境变量: npm run dev');
}

main().catch((error) => {
  console.error('✗ 未预期错误:', error);
  process.exit(1);
});
