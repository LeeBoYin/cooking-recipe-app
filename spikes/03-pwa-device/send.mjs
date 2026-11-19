// 用法：把手機上的訂閱資料存成 subscription.json，執行 node send.mjs
import webpush from 'web-push';
import { readFileSync } from 'node:fs';
const pub = readFileSync('vapid-public.txt', 'utf8').trim();
const priv = readFileSync('vapid-private.txt', 'utf8').trim();
webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'https://example.invalid', pub, priv);   // 部署後設成測試頁的網址
const sub = JSON.parse(readFileSync('subscription.json', 'utf8'));
const res = await webpush.sendNotification(sub, JSON.stringify({ title: '叮！大廚想到點子了', body: '這是一則測試推播。' }));
console.log('送出結果', res.statusCode);
