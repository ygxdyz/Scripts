/*
------------------------------------------
@Date: 2026.08.28
@Description: 同程旅行 APP 签到 + 任务 (多账号多端版)
new Env("同程旅行APP");
cron 30 9 * * * tc_trip_app.js

脚本兼容：Surge、QuantumultX、Loon、Shadowrocket、Node.js

变量 tc_trip_app_data，多账号JSON数组（每个元素 = APP signIndex 请求头，含 phone/apptoken/device）
获取方式：打开同程旅行APP → 领福利 → 点击签到，命中 signIndex 请求后自动保存
存储键汇总：
  tc_trip_app_data = 账号配置(JSON数组)，抓包自动按 phone 去重更新
  is_debug         = 调试开关 true/1/yes/on
防风控：抓包与请求时自动丢弃动态签名头(secsign/aenc/denc/dp/reqdata/apmat)，
        只保留长效静态凭证(apptoken/sec-token/device/cookie/phone)，避免重放过期签名被风控

# Surge
[Script]
同程APP抓包 = type=http-request,pattern=^https:\/\/app\.17u\.cn\/welfarecenter\/index\/signIndex,requires-body=0,max-size=0,script-path=脚本路径
[MITM]
hostname = app.17u.cn

# Loon
[Script]
http-request ^https:\/\/app\.17u\.cn\/welfarecenter\/index\/signIndex script-path=脚本路径, requires-body=false, timeout=10

# Quantumult X
[rewrite_local]
^https:\/\/app\.17u\.cn\/welfarecenter\/index\/signIndex url script-request-header 脚本路径

# Shadowrocket
[Script]
http-request ^https:\/\/app\.17u\.cn\/welfarecenter\/index\/signIndex script-path=脚本路径

[MITM]
hostname = app.17u.cn

⚠️【免责声明】
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
------------------------------------------
*/
"use strict";

const $ = new Env("同程旅行APP");
const BASE_URL = 'https://app.17u.cn/welfarecenter';
const KEY_ACCOUNTS = 'tc_trip_app_data';   // 账号数组(每个=signIndex请求头) JSON
const KEY_DEBUG = 'is_debug';              // 调试开关 true/1/yes/on
let is_debug = /^(true|1|yes|on)$/i.test($.getdata(KEY_DEBUG) || '');

/** 存储读写(四端兼容) */
function storeGet(k, d) { try { const v = $.getdata(k); return v === null || v === undefined || v === '' ? d : v; } catch (e) { return d; } }
function storeSet(k, v) { try { $.setdata(v, k); } catch (e) {} }

function mask(s, n) { return String(s || '').length > (n || 8) ? String(s || '').slice(0, 4) + '…' + String(s || '').slice(-4) : String(s || ''); }
function shortId(s) { return String(s || '').slice(0, 6) + '…'; }

/* 丢弃动态签名/环境头, 只保留长效静态凭证 → 避免重放过期签名触发风控 */
function normalizeHeaders(headers) {
  const next = {};
  const drop = new Set([
    'host', 'content-length', 'accept-encoding', 'connection', 'traceparent',
    // 动态签名/加密/时间戳字段(每次请求由App重新生成, 不能静态重放)
    'aenc', 'denc', 'dp', 'reqdata', 'secsign', 'apmat', 'secsignature'
  ]);
  Object.keys(headers || {}).forEach(function (k) {
    const lk = String(k).toLowerCase();
    const v = headers[k];
    if (!drop.has(lk) && v !== undefined && v !== null && v !== '') next[lk] = v;
  });
  return next;
}

/** HTTP 封装(手机多端) */
function httpReq(method, url, headers, body) {
  return new Promise((resolve) => {
    const opts = { url, headers: Object.assign({}, normalizeHeaders(headers), { 'content-type': 'application/json' }), body: body ? JSON.stringify(body) : '{}', timeout: 15000 };
    if (method === 'post') $.post(opts, (err, resp, data) => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); } });
    else $.get(opts, (err, resp, data) => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); } });
  });
}
function postApi(headers, path, body) { return httpReq('post', path.startsWith('http') ? path : BASE_URL + path, headers, body || {}); }
function getApi(headers, path) { return httpReq('get', path.startsWith('http') ? path : BASE_URL + path, headers, null); }

function getTodayDate() { return $.time('yyyy-MM-dd'); }

/**
 * 单账号签到+任务 (参考官方版)
 */
async function processOne(h, index) {
  const phone = h.phone || h.Phone || '账号' + index;
  const log = (...a) => $.log(`[${mask(phone, 4)}] ${a.join(' ')}`);
  const results = [];
  let signSuccess = false, tokenInvalid = false;

  // 1. signIndex: 判断token+获取里程
  const signIndexRes = await postApi(h, '/index/signIndex', {});
  if (!signIndexRes) { log('signIndex 无响应'); results.push(`[${mask(phone)}] 无响应`); return results; }
  if (signIndexRes.code !== 2200) {
    log('⚠️ token 失效，需重新抓包(APP领福利页签到)');
    results.push(`[${mask(phone)}] ❌ token失效`);
    return results;
  }
  const todaySign = signIndexRes.data && signIndexRes.data.todaySign;
  const mileage = (signIndexRes.data && signIndexRes.data.mileageBalance && signIndexRes.data.mileageBalance.mileage) || 0;
  log(`今日${todaySign ? '✅已签' : '⬜未签'}，剩余里程 ${mileage}`);

  // 2. 签到 (signNew 走 native bridge 带实时签名, 后台脚本无法完整复现; 仅尝试, 失败多为"当天已签"或bridge限制)
  if (todaySign) { signSuccess = true; }
  else {
    // 需将 yy-MM-dd 传给 signNew (H5: extendParam{type,day})
    const day = $.time('yy-MM-dd');
    const signRes = await postApi(h, '/index/signNew', { type: 1, day: day });
    if (signRes && signRes.code === 2200) { log('✅ 签到成功'); signSuccess = true; }
    else log('签到未通过(可能当天已签或需APP native bridge): ' + (signRes && (signRes.message || signRes.code)));
  }

  // 3. 任务列表 (明文可用; startV2→finish→receive)
  const taskListRes = await postApi(h, '/task/taskList?version=11.0.7', {});
  if (taskListRes && taskListRes.code === 2200 && Array.isArray(taskListRes.data)) {
    // 只做后台可完成的任务: 已在做(started)且可完成状态(state===2)或可领(CAN_RECEIVE)
    const tasks = taskListRes.data.filter(t => t && t.buttonEnum === 'CAN_RECEIVE');
    if (tasks.length) log(`可领任务 ${tasks.length} 项`);
    for (const task of tasks) {
      const { taskCode, title, browserTime, id: taskInfoId } = task;
      // 1) 尝试直接领取 (若已可领)
      const recvDirect = await postApi(h, '/task/receive', { id: taskInfoId ? taskInfoId : taskCode });
      if (recvDirect && recvDirect.code === 2200) { log(`✅ 直接领取【${title}】`); continue; }
      // 2) startV2 开任务
      log(`开始任务【${title}】`);
      const startRes = await postApi(h, '/task/startV2', { taskCode });
      let taskId = startRes && startRes.data;
      // startV2 返回可能是 {id} 或 {taskId} 或纯字符串
      if (startRes && startRes.data && typeof startRes.data === 'object') taskId = startRes.data.id || startRes.data.taskId || taskId;
      if ((startRes && startRes.code === 2200 && taskId) || (startRes && startRes.data)) {
        if (!taskId && startRes.data && typeof startRes.data === 'object') taskId = startRes.data.id || startRes.data.taskId;
        if (browserTime) { log(`  浏览 ${browserTime} 秒`); await $.wait((browserTime || 1) * 1000); }
        let finishOk = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const finishRes = await postApi(h, '/task/finish', { id: taskId || taskCode });
          if (finishRes && finishRes.code === 2200) { finishOk = true; break; }
          if (attempt < 2) await $.wait(2000 * (attempt + 1));
        }
        if (finishOk) {
          const recvRes = await postApi(h, '/task/receive', { id: taskId || taskCode });
          log(recvRes && recvRes.code === 2200 ? `✅ 完成任务【${title}】并领奖` : `✅ 完成任务【${title}】(待手动领奖)`);
        } else log(`任务【${title}】完成失败`);
      } else {
        log(`任务【${title}】开启失败: ` + (startRes && (startRes.message || startRes.code)));
      }
    }
  } else log('任务列表获取失败');

  // 4. 结算里程
  const mileageRes = await postApi(h, '/index/signIndex', {});
  if (mileageRes && mileageRes.code === 2200 && mileageRes.data) {
    const d = mileageRes.data;
    const cycleSighNum = d.cycleSighNum;
    const mileage2 = (d.mileageBalance && d.mileageBalance.mileage) || 0;
    const todayMileage = (d.mileageBalance && d.mileageBalance.todayMileage) || 0;
    log(`本月签到 ${cycleSighNum} 天，今日 +${todayMileage} 里程，余额 ${mileage2}`);
    results.push(`[${mask(phone)}] ` + (signSuccess ? '✅' : '⬜') + ` 本月签${cycleSighNum}天 里程${mileage2}(+${todayMileage})`);
  } else {
    results.push(`[${mask(phone)}] ${signSuccess ? '✅ done' : '⬜'}`);
  }
  return results;
}

/** 主流程: 多账号循环 */
async function main() {
  let accounts = [];
  try { accounts = JSON.parse(storeGet(KEY_ACCOUNTS, '[]')); if (!Array.isArray(accounts)) accounts = [accounts]; } catch (e) { accounts = []; }
  // 清理无效 + 按 phone 去重
  accounts = accounts.filter(a => a && typeof a === 'object' && (a.apptoken || a['sec-token'] || a.security_t));
  const byPhone = new Map();
  accounts.forEach(a => { const k = a.phone || a.Phone || a.apptoken || 'x'; const ex = byPhone.get(k); if (!ex || (a.captureAt || '') > (ex.captureAt || '')) byPhone.set(k, a); });
  accounts = Array.from(byPhone.values());
  storeSet(KEY_ACCOUNTS, JSON.stringify(accounts));
  if (!accounts.length) { console.log('未找到账号，请先在APP领福利页签到抓包'); return; }
  console.log(`\n[INFO] 同程APP 签到任务 | 账号 ${accounts.length} 个\n`);

  const notifyMsg = [];
  let succ = 0;
  for (let i = 0; i < accounts.length; i++) {
    const h = accounts[i];
    const phone = h.phone || h.Phone || ('账号' + (i + 1));
    console.log(`\n------------- 账号${i + 1} ${mask(phone)} -------------\n`);
    try {
      const r = await processOne(h, i + 1);
      notifyMsg.push(...r);
      succ++;
    } catch (e) { console.log(`账号${i + 1} 异常: ` + (e && e.message)); notifyMsg.push(`[${mask(phone)}] 异常`); }
    if (i < accounts.length - 1) await $.wait(2000 + Math.random() * 3000);
  }
  const title = `共${accounts.length}个账号,成功${succ}个`;
  console.log('\n' + title + '\n');
  try { $.msg('同程APP签到', '', (notifyMsg.length ? notifyMsg.join('\n') : title)); } catch (e) {}
}

// ========== 入口: MiTM 抓包 or Cron 执行 ==========
(async function () {
  if (typeof $request !== 'undefined' && $request && $request.url && $request.headers) {
    try {
      const url = $request.url || '';
      if (/\/welfarecenter\/index\/signIndex/.test(url) && $request.method !== 'OPTIONS') {
        // 丢弃动态签名头(secsign等), 只存长效静态凭证, 避免重放过期签名触发风控
        const h = normalizeHeaders($request.headers);
        let accounts = [];
        try { accounts = JSON.parse(storeGet(KEY_ACCOUNTS, '[]')); if (!Array.isArray(accounts)) accounts = [accounts]; } catch (e) { accounts = []; }
        accounts = accounts.filter(a => a && typeof a === 'object');
        const phone = h.phone || h.Phone || (h.apptoken ? shortId(h.apptoken) : '账号');
        h.captureAt = new Date().toISOString();
        // 按 phone 去重更新
        const idx = accounts.findIndex(a => (a.phone || a.Phone) === phone);
        if (idx >= 0) accounts[idx] = h; else accounts.push(h);
        storeSet(KEY_ACCOUNTS, JSON.stringify(accounts));
        console.log('[抓包] 更新账号: phone=' + mask(phone));
        $.msg($.name, '获取同程APP账户成功', mask(phone));
      } else {
        if (is_debug) console.log('[抓包] 跳过非signIndex请求: ' + url);
      }
    } catch (e) { console.log('[抓包] 解析失败: ' + (e && e.message)); }
    $.done({});
    return;
  }
  // Cron 模式
  try { await printDisclaimer(); } catch (e) {}
  await main();
  $.done({});
})().catch(e => { console.log((e && e.message) || e); $.done({}); });

// ========== 远端通知 ==========
async function printDisclaimer() {
  const urls = [
    'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/notice.json',
    'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/tip.json'
  ];
  try {
    const results = await Promise.all(urls.map(async (url) => {
      const resp = await new Promise((resolve, reject) => {
        $.http.get({ url, headers: { 'User-Agent': '' } }).then(r => resolve(r.body), reject);
      });
      return JSON.parse(resp);
    }));
    results.forEach(r => { if (r && r.notice) $.log(r.notice); });
  } catch (e) {}
}

function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, i) => { s.call(this, t, (t, s, o) => { t ? i(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 }, this.logLevelPrefixs = { debug: "[DEBUG] ", info: "[INFO] ", warn: "[WARN] ", error: "[ERROR] " }, this.logLevel = "info", this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch(e) { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch(e) { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch(e) {} return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch(e) { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let o = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); o = o ? 1 * o : 20, o = e && e.timeout ? e.timeout : o; const [r, a] = i.split("@"), n = { url: `http://${a}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: o }, headers: { "X-Key": r, Accept: "*/*" }, policy: "DIRECT", timeout: o }; this.post(n, (t, e, i) => s(i)) }).catch(e => this.logErr(e)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch(e) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), o = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, o) : i ? this.fs.writeFileSync(e, o) : this.fs.writeFileSync(t, o) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (const t of i) if (o = Object(o)[t], void 0 === o) return s; return o } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), o = s ? this.getval(s) : ""; if (o) try { const t = JSON.parse(o); e = t ? this.lodash_get(t, i, "") : e } catch(e) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, o] = /^@(.*?)\.(.*?)$/.exec(e), r = this.getval(i), a = i ? "null" === r ? null : r || "{}" : "{}"; try { const e = JSON.parse(a); this.lodash_set(e, o, t), s = this.setval(JSON.stringify(e), i) } catch(e) { const r = {}; this.lodash_set(r, o, t), s = this.setval(JSON.stringify(r), i) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && (this.data[e] = t), !0 } } initGotEnv(e) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, e && (e.headers = e.headers ? e.headers : {}, e && (e.headers = e.headers ? e.headers : {}, void 0 === e.headers.cookie && void 0 === e.headers.Cookie && void 0 === e.cookieJar && (e.cookieJar = this.ckjar))) } get(t, e = (() => {})) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) }); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }, t => e(t && t.error || "UndefinedError")); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { t.headers["set-cookie"] && this.ckjar.setCookieSync(t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(), null), e.cookieJar = this.ckjar } catch(e) { this.logErr(e) } }).then(t => { const { statusCode: i, statusCode: o, headers: r, rawBody: a } = t, n = s.decode(a, this.encoding); e(null, { status: i, statusCode: o, headers: r, rawBody: a, body: n }, n) }, t => { const { message: i, response: o } = t; e(i, o, o && s.decode(o.rawBody, this.encoding)) }) } } post(t, e = (() => {})) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) }); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }, t => e(t && t.error || "UndefinedError")); break; case "Node.js": let i = require("iconv-lite"); this.initGotEnv(t); const { url: o, ...r } = t; this.got[s](o, r).then(t => { const { statusCode: s, statusCode: o, headers: r, rawBody: a } = t, n = i.decode(a, this.encoding); e(null, { status: s, statusCode: o, headers: r, rawBody: a, body: n }, n) }, t => { const { message: s, response: o } = t; e(s, o, o && i.decode(o.rawBody, this.encoding)) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let i = t[s]; null != i && "" !== i && ("object" == typeof i && (i = JSON.stringify(i)), e += `${s}=${i}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", i = "", o = {}) { const r = t => { const { $open: e, $copy: s, $media: i, $mediaMime: o } = t; switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { const r = {}; let a = t.openUrl || t.url || t["open-url"] || e; a && Object.assign(r, { action: "open-url", url: a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; if (n && Object.assign(r, { action: "clipboard", text: n }), i) { let t, e, s; if (i.startsWith("http")) t = i; else if (i.startsWith("data:")) { const [t] = i.split(";"), [, o] = i.split(","); e = o, s = t.replace("data:", "") } else { e = i, s = (t => { const e = { JVBERi0: "application/pdf", R0lGODdh: "image/gif", R0lGODlh: "image/gif", iVBORw0KGgo: "image/png", "/9j/": "image/jpg" }; for (var s in e) if (0 === t.indexOf(s)) return e[s]; return null })(i) } Object.assign(r, { "media-url": t, "media-base64": e, "media-base64-mime": o ?? s }) } return Object.assign(r, { "auto-dismiss": t["auto-dismiss"], sound: t.sound }), r } case "Loon": { const s = {}; let o = t.openUrl || t.url || t["open-url"] || e; o && Object.assign(s, { openUrl: o }); let r = t.mediaUrl || t["media-url"]; return i?.startsWith("http") && (r = i), r && Object.assign(s, { mediaUrl: r }), s } case "Quantumult X": { const o = {}; let r = t["open-url"] || t.url || t.openUrl || e; r && Object.assign(o, { "open-url": r }); let a = t["media-url"] || t.mediaUrl; i?.startsWith("http") && (a = i), a && Object.assign(o, { "media-url": a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; return n && Object.assign(o, { "update-pasteboard": n }), o } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, i, r(o)); break; case "Quantumult X": $notify(e, s, i, r(o)); break; case "Node.js": break }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } debug(...t) { this.logLevels[this.logLevel] <= this.logLevels.debug && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.debug}${t.map(t => t ?? String(t)).join(this.logSeparator)}`)) } info(...t) { this.logLevels[this.logLevel] <= this.logLevels.info && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.info}${t.map(t => t ?? String(t)).join(this.logSeparator)}`)) } warn(...t) { this.logLevels[this.logLevel] <= this.logLevels.warn && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.warn}${t.map(t => t ?? String(t)).join(this.logSeparator)}`)) } error(...t) { this.logLevels[this.logLevel] <= this.logLevels.error && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.error}${t.map(t => t ?? String(t)).join(this.logSeparator)}`)) } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.map(t => t ?? String(t)).join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, e, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, e, void 0 !== t.message ? t.message : t, t.stack); break } } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1); break } } }(t, e) }

