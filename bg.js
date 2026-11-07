/* SudaTab · 后台抓图标字节
   ------------------------------------------------------------
   扩展页里的 <img> 能显示远程 favicon，但 canvas 一读像素就被浏览器
   判成跨域污染（SecurityError），也就没法量「图里到底留了多少白边」。
   这里用扩展的后台权限把同一张图 fetch 回来，转成 data URL 交给页面 ——
   data URL 是本地数据，页面那边可以放心读像素。
   拿不到就返回 null，页面保持原样，不影响图标显示。 */

const MAX_BYTES = 512 * 1024;

function toDataUrl(buf, type) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return 'data:' + (type || 'image/png') + ';base64,' + btoa(bin);
}

async function grab(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) { return null; }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (type && !/^image\//i.test(type)) { return null; }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_BYTES) { return null; }
    return toDataUrl(buf, type || 'image/png');
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const memo = new Map();

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!msg || msg.type !== 'icon-bytes' || typeof msg.url !== 'string') { return; }
  if (!/^https?:/i.test(msg.url)) { send(null); return; }
  if (memo.has(msg.url)) { send(memo.get(msg.url)); return; }

  grab(msg.url).then((data) => {
    if (memo.size > 300) { memo.clear(); }
    memo.set(msg.url, data);
    send(data);
  });
  return true;   /* 异步回复 */
});
