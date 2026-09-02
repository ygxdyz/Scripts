/*
------------------------------------------
@Date: 2026.09.01
@Description: 伴光生活签到
new Env("伴光生活签到");
cron 15 8 * * * bantime_checkin.js

脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，不支持青龙

变量 bantime_data，多账号JSON数组格式
字段: {"token":"Bearer后面的token值","note":"备注(手机号等)"}
获取方式：打开伴光生活小程序 → 触发业务接口(request-header) 或 重新登录(response-body) 自动获取

[rewrite_local]
^https:\/\/mini-api\.bantime\.com\/ url script-request-header https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/bantime.js

[Script]
http-request ^https:\/\/mini-api\.bantime\.com\/ script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/bantime.js, tag=伴光生活抓包

[MITM]
hostname = mini-api.bantime.com

新增账号抓包(需重登, 响应体拿token)：
[rewrite_local]
^https:\/\/mini-api\.bantime\.com\/api\/v1\/login$ url script-response-body https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/bantime.js

存储键:
  bantime_data = 账号token数组 (JSON数组 [{token,note}])
  is_debug     = 调试开关 (true/1/yes/on 开启, 其余关闭)

1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/

// ===== Env 实例化 (函数声明提升, 可提前使用) =====
let $ = new Env('伴光生活签到');

// ===== 远端通知 (先加载，await后再跑业务) =====
!(async function () {
  await printDisclaimer();
  if (typeof $request !== 'undefined') { capturePacket(); return; }
  await main();
})().catch((e) => {
  $.log('运行异常: ' + (e && e.message || e));
  $.done();
});

// ===== 配置 =====
const DATA_KEY = 'bantime_data';
const HOST = 'https://mini-api.bantime.com';
const DEBUG = /^(true|1|yes|on)$/i.test($.getval('is_debug') || '');

function maskString(s) {
  if (!s) return '';
  s = String(s);
  if (s.length <= 8) return s.slice(0, 2) + '***';
  return s.slice(0, 3) + '****' + s.slice(-4);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const sdelay = (min, max) => delay(min + Math.floor(Math.random() * (max - min)));

function getAccounts() {
  const raw = $.getval(DATA_KEY);
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.filter(x => x && x.token); } catch (e) {} }
  return [];
}
function saveAccounts(accounts) {
  $.setval(JSON.stringify(accounts), DATA_KEY);
  if (DEBUG) $.log(`[存储] bantime_data 已更新, 共 ${accounts.length} 账号`);
}

// ===== 抓包入口 (支持 request-header 业务接口 + response-body login) =====
function capturePacket() {
  const url = $request.url || '';
  const headers = $request.headers || {};
  const accounts = getAccounts();
  let newToken = '';
  // ① request-header: 业务接口请求头拿 Authorization (老用户打开即触发, 推荐)
  if (url.includes('mini-api.bantime.com') && !url.includes('/api/v1/login')) {
    newToken = (headers['Authorization'] || headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  }
  // ② response-body: /api/v1/login 响应体拿 token (重登时触发)
  if (!newToken && url.includes('/api/v1/login')) {
    try {
      const body = ($response && $response.body) || '';
      const json = JSON.parse(body);
      newToken = (json.data && json.data.data && json.data.data.token) || (json.data && json.data.token) || (json.token) || '';
    } catch (e) {}
  }
  if (newToken) {
    if (!accounts.some(a => a.token === newToken)) {
      accounts.unshift({ token: newToken, note: '' });
      saveAccounts(accounts);
      $.log(`[抓包] 捕获新账号 token=${maskString(newToken)}`);
    } else {
      $.log(`[抓包] 已存在 token=${maskString(newToken)}, 跳过`);
    }
  }
  $.done();
}

class UserInfo {
  constructor(token) { this.token = token; this.points = 0; this.note = ''; }
  async call(method, path, body, tag) {
    await sdelay(1500, 2500);
    const opts = {
      url: HOST + path,
      headers: { 'Authorization': 'Bearer ' + this.token, 'Content-Type': 'application/json' },
    };
    if (method === 'POST' && body) opts.body = JSON.stringify(body);
    return new Promise((resolve) => {
      (method === 'POST' ? $.post : $.get)(opts, function (err, resp, data) {
        if (err) return resolve({ _err: err.message || '网络错误' });
        let json;
        try { json = JSON.parse(data); } catch (e) { return resolve({ _err: '响应非JSON' }); }
        if (DEBUG) $.log(`  [${tag}] ${method} ${path}: ` + JSON.stringify(json).slice(0, 400));
        resolve(json);
      });
    });
  }
  async check(responded, path, fine) {
    if (responded._err) return null;
    return responded;
  }
}

async function main() {
  const accounts = getAccounts();
  $.log(`\n伴光生活 账号 ${accounts.length} 个 ${DEBUG ? '(调试开)' : ''}`);
  if (!accounts.length) {
    $.log('\n⚠️ 未配置账号, 请先打开伴光生活小程序触发抓包获取 token');
    $.done();
    return;
  }
  let ok = 0, fail = 0;
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const note = acc.note || ('账号' + (i + 1));
    $.log(`\n============= ${note} =============`);
    const u = new UserInfo(acc.token);
    try {
      // 1. 查询今日签到状态
      const st = await u.call('GET', '/user/check_today_status', null, '签到状态');
      if (st._err) throw new Error(st._err);
      const isSigned = !!(st && st.success);
      // 2. 查积分/用户信息
      const info = await u.call('GET', '/user/get_user_info', null, '用户信息');
      if (info && !info._err && info.success && info.data) u.points = info.data.points || 0;

      // 3. 未签到则签到 (+10)
      if (!isSigned) {
        const sign = await u.call('POST', '/point/add_user_points', { point_type: 'checkIn', number: 10, note: todayDate(), order_id: '' }, '签到');
        if (sign && !sign._err && sign.success) {
          $.log(`  ✅ 签到成功 +10 积分`);
          u.points += 10;
        } else {
          $.log(`  ❌ 签到失败: ${(sign && (sign.message || sign.msg)) || ''}`);
        }
        try { await u.call('POST', '/user/check_in_with_date', { check_in_date: todayDate() }, '日期'); } catch (e) {}
      } else {
        $.log(`  ⬜ 今日已签到`);
      }

      // 4. 跳过广告/任务模拟加奖励 (dailyLogin/videoAd/videoAd2/videoAd3)
      //    原理: 看广告加分 = POST /point/add_user_points {point_type,number,note} 普通接口, 直接调即跳过广告领奖励
      //    服务端如校验真实观看会失败, 记录并跳过不影响主流程
      const TODAY = todayDate();
      const adTasks = [
        { t: '每日登录', type: 'dailyLogin', n: 10 },
        { t: '首页视频', type: 'videoAd', n: 15 },
        { t: '故事广告2', type: 'videoAd2', n: 10 },
        { t: '故事广告3', type: 'videoAd3', n: 10 },
      ];
      const batch = await u.call('GET', '/point/check_today_points_batch', null, '任务状态');
      const doneMap = (batch && batch.data) ? batch.data : {};
      if (DEBUG) $.log(`  今日任务状态: ` + JSON.stringify(doneMap).slice(0, 200));
      for (const ad of adTasks) {
        const finished = doneMap[ad.type] === true || doneMap[ad.type] === 1;
        if (finished) { $.log(`  ⬜ ${ad.t} 已完成`); continue; }
        const r = await u.call('POST', '/point/add_user_points', { point_type: ad.type, number: ad.n, note: TODAY, order_id: '' }, '任务:' + ad.t);
        if (r && !r._err && r.success) {
          $.log(`  ✅ 跳过广告 领取 ${ad.t} 奖励 ${ad.n} 分`);
          u.points += ad.n;
        } else {
          $.log(`  ⬜ ${ad.t} 未领(服务端校验或已完成): ${(r && (r.message || r.msg)) || ''}`);
        }
      }

      // 5. 签到统计 → 领取可用奖励
      const stats = await u.call('GET', '/user/check_in_stats', null, '签到统计');
      if (stats && !stats._err) {
        const rewards = [
          { name: '连续签到', code: stats.streak_reward_code, status: stats.streak_reward_status },
          { name: '当月满签', code: stats.monthly_reward_code, status: stats.monthly_reward_status },
          { name: '上月满签', code: stats.previous_monthly_reward_code, status: stats.previous_monthly_reward_status },
        ];
        for (const rw of rewards) {
          if (rw.code && String(rw.status).toLowerCase() === 'available') {
            const cr = await u.call('POST', '/user/claim_reward', { reward_code: rw.code }, '领奖励');
            if (cr && !cr._err && cr.success) $.log(`  🎁 ${rw.name}奖励 领取成功`);
            else $.log(`  ⬜ ${rw.name}奖励 失败: ${(cr && (cr.message || cr.msg)) || ''}`);
          }
        }
      }

      // 6. 重新查积分
      const info2 = await u.call('GET', '/user/get_user_info', null, '积分查询');
      if (info2 && !info2._err && info2.success && info2.data) u.points = info2.data.points || u.points;
      $.log(`  📊 积分: ${u.points} 分`);
      ok++;
      // 成功通知
      $.notify('伴光生活签到', `✅ ${note}`, `签到完成, 积分 ${u.points} 分`);
    } catch (e) {
      $.log(`  ❌ 异常: ${e.message}`);
      $.notify('伴光生活签到', `账号 ${note}`, '异常: ' + (e.message || ''));
      fail++;
    }
    if (i < accounts.length - 1) await sdelay(3000, 4000);
  }
  $.log(`\n============= 运行汇总 =============`);
  $.log(`共 ${accounts.length} 个账号, 成功 ${ok} 个, 失败 ${fail} 个`);
  $.done();
}

function todayDate() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// ===== 远端通知 =====
async function printDisclaimer() {
  const urls = [
    'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/notice.json',
    'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/tip.json',
  ];
  const fetchOne = (u) => new Promise((resolve) => {
    $.http.get({ url: u, timeout: 8000 }, function (err, resp, data) {
      try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
    });
  });
  const [notice, tip] = await Promise.all([fetchOne(urls[0]), fetchOne(urls[1])]);
  if (notice && notice.notice) $.log(`\n【公告】\n${notice.notice}\n`);
  if (tip && tip.tip) $.log(`【提示】\n${tip.tip}\n`);
}

// ===== Env 框架 (多端自包含, 标准 chavyleung 风格) =====
if (typeof $environment !== 'undefined' && $environment['surge-version']) {
  $task = undefined;
}
function isNode() { return typeof require !== 'undefined' && !(typeof $httpClient !== 'undefined') && !(typeof $task !== 'undefined'); }

function Env(name) {
  this.name = name;
  this.isNode = isNode();
  this.logs = [];
  this.log = function (...m) { console.log(...m); };
  this.getval = function (k) { return ($.isNode ? (process.env[k] || '') : (typeof $persistentStore !== 'undefined' ? $persistentStore.read(k) : $prefs.valueForKey(k))) || ''; };
  this.setval = function (v, k) { if ($.isNode) process.env[k] = v; else if (typeof $persistentStore !== 'undefined') $persistentStore.write(v, k); else if (typeof $prefs !== 'undefined') $prefs.setValueForKey(v, k); };
  this.notify = function (t, s, b) {
    if ($.isNode) { console.log(`[通知] ${t} | ${s} | ${b}`); }
    else if (typeof $notification !== 'undefined') { $notification.post(t, s, b); }
    else if (typeof $notify !== 'undefined') { $notify(t, s, b); }
    else console.log(`[通知] ${t} | ${s} | ${b}`);
  };
  this.done = function (body) { if (typeof $done !== 'undefined') $done(body || {}); else {} };
  this.http = {
    get: (o, cb) => httpRequest(o, cb, 'GET'),
    post: (o, cb) => httpRequest(o, cb, 'POST'),
    put: (o, cb) => httpRequest(o, cb, 'PUT'),
  };
  this.get = (o, cb) => httpRequest(o, cb, 'GET');
  this.post = (o, cb) => httpRequest(o, cb, 'POST');
}
function httpRequest(o, cb, method) {
  if (typeof $httpClient !== 'undefined') {
    const done = (err, resp, data) => cb ? cb(err, resp, data) : null;
    if (typeof ($httpClient[method.toLowerCase()]) !== 'undefined') {
      $httpClient[method.toLowerCase()](o, (err, resp, data) => { const s = err ? undefined : { statusCode: resp && resp.status ? resp.status : resp.statusCode, status: resp && resp.status }; done(err, resp, data); });
      return;
    }
  }
  if (typeof $task !== 'undefined') {
    $task.fetch({ url: o.url, method, headers: o.headers, body: o.body, timeout: (o.timeout || 15000) / 1000 })
      .then((resp) => { cb(null, { statusCode: resp.statusCode, status: resp.statusCode }, resp.body); })
      .catch((err) => cb(err, null, ''));
    return;
  }
  if (isNode()) {
    const http = require(o.url.startsWith('https') ? 'https' : 'http');
    const urlObj = new URL(o.url);
    const opt = { method, hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: o.headers || {} };
    if (o.body) opt.headers['Content-Length'] = Buffer.byteLength(o.body);
    const req = http.request(opt, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => d += c);
      res.on('end', () => cb(null, { statusCode: res.statusCode, status: res.statusCode }, d));
    });
    req.on('error', (e) => cb(e, null, ''));
    if (o.body) req.write(o.body);
    req.end();
    return;
  }
  cb(new Error('no http client'), null, '');
}
