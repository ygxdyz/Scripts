// cron: 0 30 8 * * *
// new Env('海天美味馆');

/*
------------------------------------------
Name: 海天美味馆（Haday / xkmm）
Author: xingjian；多端化: Minis
Date: 2026-08-17；适配 2026-08-21；v3增强 2026-09-01
Desc:
- 品牌自研 javashop，非微盟/有赞
- 签到：拉今日题目 quiz/today → AI/规则选题 → 提交选项下标（答对高级分）
- 签到 activity_code、抽奖 activityCode 运行时自动拉取
- v3 (2026-08-28): 抽奖活动取码走新逻辑 GET /pages/promote-activities/current/popup
  → extractActivityFromPromote() 提取 page_type → verifyActivityCode() 验证 (status=1 ✅)
  → 全部无效回退旧逻辑 (/pages/params + setting + list)
- v3 (2026-08-28): 活动码默认最新 (jfcj尾部数字最大, 验证有效才用; HT_LUCKY_ID 可覆盖)
- v3 (2026-08-28): 助力调度 v4 确定性环形分配 — helper_i 帮环上固定后3位
  (i+1,i+2,i+3)%m, 索引固定不splice(dead标记); 本地N>=4 → 数学保证全员3/3
- v3 (2026-08-28): hub v2 跨设备计数 — 助力成功回传 {code,ok}→hits+1,
  pull 过滤 hits>=3 已满码; HT_HUB_URL 可覆盖码库地址
- v3 (2026-08-28): token 失效自动删除 (dropAccount, 4触发点幂等, 手机端回写/Node提示)
- v3: 助力码中转 (CF Workers码库 v2, X-Hub-Key 鉴权, 仅交换一次性码不出token)
- 本脚本仅供学习参考

[脚本兼容]
Surge、QuantumultX、Loon、Shadowrocket、Node.js（青龙/Panel）

[多端特性]
- 请求层 Env 封装：自动适配 $httpClient(Surge/Loon/小火箭) / $task(QX) / Node fetch
- 存储：$persistentStore(Surge/Loon/小火箭) + $prefs(QX) + Node json，键名见下
- 通知：$notification(Surge/Loon/小火箭) / $notify(QX) / Node 兜底
- 抓包捕获登录态：rewrite 拦截自动存 token（无需 YYB_GO 取码服务）

[存储键]
HT_DATA       - 账号数组 JSON：[{name, token, token2, uuid}]
                token=买家API授权, token2=社区API授权, uuid=设备标识(20位随机)
HT_DEBUG      - 调试开关（is_debug，true=打印完整JSON/响应）
HT_APPID      - 可选，覆盖小程序 AppID（默认 wx7a890ea13f50d7b6）
HT_LUCKY_ID   - 可选，覆盖抽奖活动 ID（多个逗号分隔）；不填自动获取
HT_FOLLOW_UID - 可选，覆盖关注官号 likeUserId
HT_HELP_CODES - 可选，手动填朋友助力码 JSON 数组 [{share_code, from, activityId}]，入池被调度消耗
AI_KEY        - 可选，OpenAI/兼容 API 密钥（签到答题用）
AI_URL        - 可选，兼容 API 地址（如 https://api.openai.com/v1 或完整 .../chat/completions）
AI_MODEL      - 可选，模型名，默认 gpt-4o-mini

[助力池]
- 取码: GET /lucky/task/share/code/{活动ID} → share_code 现取现用不落盘
- 出力: POST /lucky/task/share/code/success/{对方码} form:{}
- 调度 v4: helper_i 帮环上后3位 (i+1,i+2,i+3)%m 的本地码, 每码恰被3个不同helper帮
  · 助力成功 → 码留队(等满3) + 回传hub hits+1
  · 次数上限(最多3名/已完成3名) → break 换helper
  · 好友任务已完成/已满 → 码标dead(其他helper跳过)
  · 当天只能给该用户助力一次 → 仅该helper跳过不出队
  · 不可以为自己助力 → 修正码归属后跳过(新旧标识兼容)
  · 活动不匹配 → 跳过不耗额度(切换期不帮旧活动码)
- 码库: https://ht-hub.sansuiwong.icu/codes (反代→ht-hub worker, X-Hub-Key 鉴权,
  POST按from去重合并; v2支持POST {code,ok}→hits+1, GET带hits, hits>=3=已满)
- 平台规则: 出力上限=3名/天/账号; 单码需3个不同账号各帮1次; 非有效助力不计数;
  同日重跑全部"已完成"无新增 → 3/3须当天首跑; 2号=1/3, 3号=2/3, 4+号才3/3
- ⚠️注意: HUB_KEY 为共享凭据(非个人信息), 脚本不要公开分享

[失效自删]
- token 失效(未登录/401/403/token过期) → 自动从 HT_DATA 删除并回写 + 通知
- Node 环境变量无法写盘, 打印提示手动更新 HT_DATA

[近期改动] 2026-08-28
1. 活动取码: popup → page_type → verifyActivityCode(status=1), 默认最新, 失败回退旧逻辑
2. 调度v4: 环形确定性分配替代贪心(修尾部饥饿), 本地N>=4全员3/3
3. hub v2: hits计数/mark/满码过滤(需服务端已部署v2 worker)
4. token失效自动删除; 10处无参catch修复(Loon兼容); 

[抓包配置]
打开海天美味馆小程序，触发登录（会请求 wechat/mini/login 或 phoneNew/login），
或打开"我的"页面（members 接口带 token）。登录/用户信息接口响应都含 access_token。
⚠️ 脚本会【原样返回响应体】（$done({body})），不篡改任何数据，小程序登录不受影响。

Surge:
  [Script]
  http-response ^https?://(cmallapi\.xkmm\.cn|cmallapi\.haday\.cn)/buyer-api/(wechat/mini/(login|phoneNew/login)(?:[?/]|$)|members(?!/)|pages/params(?:[?/]|$)|sign/activity/code(?:[?/]|$)|sign/activity/quiz/today(?:[?/]|$)|sign/activity/member/info) script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/HT.js, requires-body=true
  [MITM]
  hostname = %APPEND% cmallapi.xkmm.cn, cmallapi.haday.cn

QuantumultX:
  [rewrite_local]
  ^https?://(cmallapi\.xkmm\.cn|cmallapi\.haday\.cn)/buyer-api/(wechat/mini/(login|phoneNew/login)(?:[?/]|$)|members(?!/)|pages/params(?:[?/]|$)|sign/activity/code(?:[?/]|$)|sign/activity/quiz/today(?:[?/]|$)|sign/activity/member/info) url script-response-body https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/HT.js
  [mitm]
  hostname = cmallapi.xkmm.cn, cmallapi.haday.cn

Loon:
  [Script]
  http-response ^https?://(cmallapi\.xkmm\.cn|cmallapi\.haday\.cn)/buyer-api/(wechat/mini/(login|phoneNew/login)(?:[?/]|$)|members(?!/)|pages/params(?:[?/]|$)|sign/activity/code(?:[?/]|$)|sign/activity/quiz/today(?:[?/]|$)|sign/activity/member/info) script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/HT.js, requires-body=true
  [MITM]
  hostname = cmallapi.xkmm.cn, cmallapi.haday.cn

Shadowrocket:
  [Script]
  http-response ^https?://(cmallapi\.xkmm\.cn|cmallapi\.haday\.cn)/buyer-api/(wechat/mini/(login|phoneNew/login)(?:[?/]|$)|members(?!/)|pages/params(?:[?/]|$)|sign/activity/code(?:[?/]|$)|sign/activity/quiz/today(?:[?/]|$)|sign/activity/member/info) script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/HT.js, requires-body=true, max-size=0
  [MITM]
  hostname = cmallapi.xkmm.cn, cmallapi.haday.cn

[Node 运行]
HT_DATA='[{"name":"账号备注","token":"抓包得到的token","uuid":"20位随机"}]' HT_API_HOST='https://cmallapi.xkmm.cn/buyer-api|https://cmallwap.xkmm.cn/haday' node ht_multi.js
（HT_API_HOST 可省略，默认 xkmm + haday；AI_KEY/AI_URL/AI_MODEL 可选开 AI 判题）

[重要 - Loon 请求超时修复]
海天 API 是纯国内服务，若 Loon 把 $httpClient 请求走了代理（国外节点），
所有请求会 Request timeout。务必在 Loon 分流规则加直连（可选参数在 Script 里）：
  [Rule]
  DOMAIN-SUFFIX,xkmm.cn,DIRECT
  DOMAIN-SUFFIX,haday.cn,DIRECT
（Loon App: 配置→分流规则→添加，类型"域名后缀"，值 xkmm.cn / haday.cn，策略"直连"）
抓包(MITM)不受影响，cron 定时跑必须走直连才通。

[解包要点]
- appid: wx7a890ea13f50d7b6
- 登录(原，供抓包理解): 已绑定 POST /wechat/mini/login?code&uuid ；新号 POST /wechat/mini/phoneNew/login?edata&iv&code&uuid
- 签到: GET /sign/activity/code → GET /sign/activity/quiz/today → POST /sign/activity/sign {quiz_id,quiz_question_id,activity_code,answer,fill_date}
- 抽奖活动取码(v3): GET /pages/promote-activities/current/popup → page_type → 验证 /lucky/task/package/{code} (status=1)
- 抽奖: GET /lucky/activity/setting + /lucky/activity 取当期 ID (旧逻辑回退)

⚠️【免责声明】
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除。
3、请勿将此脚本用于任何商业或非法目的。
4、此脚本涉及应用与本人无关，对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
------------------------------------------
*/

// Node 专用模块延迟加载（手机端无 require，仅 Node 分支使用）

// ============================================================
// Env 框架（多端兼容：Surge / Loon / QX / Shadowrocket / Node）
// ============================================================
function Env(t, e) {
  return new (class {
    constructor(t, e) {
      this.name = t;
      this.http = null;
      this.data = null;
      this.dataFile = "box.dat";
      this.logs = [];
      this.isMute = false;
      this.isNeedRewrite = false;
      this.logSeparator = "\n";
      this.isMuteLog = false;
      this.startTime = new Date();
      Object.assign(this, e);
      this.log("", `🔔${this.name}, 开始!`);
    }
    getEnv() {
      return (typeof $environment != 'undefined' && $environment && $environment['surge-version']) ? 'Surge'
        : (typeof $environment != 'undefined' && $environment && $environment['stash-version']) ? 'Stash'
        : (typeof $task != 'undefined' && $task) ? 'Quantumult X'
        : (typeof $loon != 'undefined' && $loon) ? 'Loon'
        : (typeof $rocket != 'undefined' && $rocket) ? 'Shadowrocket'
        : (typeof module != 'undefined' && module && module.exports) ? 'Node.js'
        : void 0;
    }
    isNode() { return "Node.js" === this.getEnv(); }
    isQuanX() { return "Quantumult X" === this.getEnv(); }
    isSurge() { return "Surge" === this.getEnv(); }
    isLoon() { return "Loon" === this.getEnv(); }
    isShadowrocket() { return "Shadowrocket" === this.getEnv(); }
    isStash() { return "Stash" === this.getEnv(); }
    toObj(t, e = null) { try { return JSON.parse(t); } catch(_) { return e; } }
    toStr(t, e = null) { try { return JSON.stringify(t, ...(e ? [e] : [])); } catch(_) { return null; } }
    getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)); } catch(_) {} return s; }
    setjson(t, e) { try { return this.setdata(JSON.stringify(t), e); } catch(_) { return false; } }
    lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (const k of i) { if (o === null || o === undefined) return s; o = o[k]; } return o === undefined ? s : o; }
    lodash_set(t, e, s) { const keys = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (let i = 0; i < keys.length - 1; i++) { const k = keys[i]; if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[k]; } o[keys[keys.length - 1]] = s; return t; }
    getdata(t) {
      let e = this.getval(t);
      if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), o = s ? this.getval(s) : ""; if (o) try { e = this.lodash_get(JSON.parse(o), i, ""); } catch(_) {} }
      return e;
    }
    setdata(t, e) {
      if (/^@/.test(e)) { const [, i, o] = /^@(.*?)\.(.*?)$/.exec(e), r = this.getval(i), a = i ? (r === "null" ? null : r) || "{}" : "{}"; try { const obj = JSON.parse(a); this.lodash_set(obj, o, t); this.setval(JSON.stringify(obj), i); return true; } catch(_) { return false; } }
      return this.setval(t, e);
    }
    getval(t) {
      switch (this.getEnv()) {
        case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t);
        case "Quantumult X": return $prefs.valueForKey(t);
        case "Node.js": this.data = this.loaddata(); return this.data[t];
        default: return this.data && this.data[t] || null;
      }
    }
    setval(t, e) {
      switch (this.getEnv()) {
        case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e);
        case "Quantumult X": return $prefs.setValueForKey(t, e);
        case "Node.js": this.data = this.loaddata(); this.data[e] = t; this.writedata(); return true;
        default: return this.data && this.data[e] || null;
      }
    }
    loaddata() {
      if (!this.isNode()) return {};
      const path = require("path"), fs = require("fs");
      const t = path.resolve(this.dataFile), s = fs.existsSync(t);
      if (!s) return {};
      try { return JSON.parse(fs.readFileSync(t)); } catch(_) { return {}; }
    }
    writedata() {
      if (this.isNode()) { const fs = require("fs"); fs.writeFileSync(this.dataFile, JSON.stringify(this.data)); }
    }
    get(t, e = (() => {})) {
      if (this.isQuanX()) {
        return $task.fetch(t).then((r => { const { statusCode: s, headers: h, body: b } = r; e(null, { status: s, statusCode: s, headers: h, body: b }, b); }), (err => e(err && err.error || "UndefinedError")));
      }
      $httpClient.get(t, ((err, resp, body) => { if (!err && resp) { resp.status = resp.status || resp.statusCode; resp.statusCode = resp.statusCode || resp.status; resp.body = body; } e(err, resp, body); }));
    }
    post(t, e = (() => {})) {
      if (this.isQuanX()) {
        t.method = "POST";
        return $task.fetch(t).then((r => { const { statusCode: s, headers: h, body: b } = r; e(null, { status: s, statusCode: s, headers: h, body: b }, b); }), (err => e(err && err.error || "UndefinedError")));
      }
      $httpClient.post(t, ((err, resp, body) => { if (!err && resp) { resp.status = resp.status || resp.statusCode; resp.statusCode = resp.statusCode || resp.status; resp.body = body; } e(err, resp, body); }));
    }
    wait(t) { return new Promise((r => setTimeout(r, t))); }
    done(t = {}) {
      this.log("", `🔔${this.name}, 结束! 🕛 ${((new Date() - this.startTime) / 1000).toFixed(0)} 秒`);
      switch (this.getEnv()) {
        case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break;
        case "Node.js": process.exit(1);
      }
    }
    log(...t) { if (t.length > 0) this.logs = [...this.logs, ...t]; console.log(t.map((x => x === undefined ? "undefined" : String(x))).join(this.logSeparator)); }
    logErr(t, e) { this.log("", `❗️${this.name}, 错误!`, e || "", t && t.message ? t.message : t, t && t.stack || ""); }
    msg(t = this.name, s = "", i = "", o = {}) {
      if (this.isMute) return;
      try {
        if (this.isNode()) { console.log(`[${t}] ${s} ${i}`.trim()); return; }
        if (typeof $notification !== 'undefined' && $notification) { $notification.post(t, s, i, o); return; }
        if (typeof $notify !== 'undefined' && $notify) { $notify(t, s, i, o); return; }
        console.log(`[${t}] ${s} ${i}`.trim());
      } catch (e) { console.log(`[${t}] ${s} ${i}`.trim()); }
    }
  })(t, e);
}
const $ = new Env("海天美味馆");
const isNode = $.isNode();

// 存储键（GLOBAL 约定：多端持久化）
const ckName = "HT_DATA";
const DEBUG_KEY = "HT_DEBUG";
// Node 环境变量安全读取（手机端无 process）
function env(k) { return (typeof process !== 'undefined' && process.env && process.env[k]) || undefined; }
function getDebug() {
  try {
    const v = isNode ? process.env.HT_DEBUG : $.getdata(DEBUG_KEY);
    return /^(true|1|yes|on|TRUE)$/i.test(String(v || '').trim());
  } catch(_) { return false; }
}
const isDebug = getDebug();
function debug(...a) { if (isDebug) $.log(...a); }

// 读取账号（多端：HT_DATA 存储键 / Node 环境变量）
function loadAccounts() {
  if (isNode) {
    const envCk = process.env.HT_DATA;
    if (envCk) {
      const parsed = $.toObj(envCk);
      if (Array.isArray(parsed)) return parsed;
      // 兼容旧格式: 每行 name#token 或 name,token
      return String(envCk).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, token] = l.split(/[#,，]/);
        return { name: (name || '').trim(), token: (token || '').trim() };
      }).filter((x) => x.token);
    }
    return [];
  }
  const arr = $.getjson(ckName, []);
  return Array.isArray(arr) ? arr : [];
}
function saveAccounts(arr) {
  if (isNode) return; // Node 用环境变量，不写盘
  $.setjson(arr || [], ckName);
}

// 失效账号自动删除 (2026-08-28): 按 token 精确匹配移除并回写, 幂等
// 返回 true=确实删除了; false=未删除(无此token/Node环境变量不可删)
function dropAccount(user) {
  try {
    if (!user || !user.token) return false;
    const arr = loadAccounts();
    const before = arr.length;
    const remain = arr.filter((a) => a.token !== user.token);
    const masked = '末6位 ' + String(user.token).slice(-6);
    if (remain.length !== before) {
      saveAccounts(remain);
      if (isNode) {
        console.log(`🗑️ [${user.userName}] token(${masked}) 已失效，Node环境变量无法自动删除 → 请手动更新 HT_DATA 移除该账号`);
      } else {
        console.log(`🗑️ [${user.userName}] token(${masked}) 已失效，已自动从 ${ckName} 删除，请重新抓包`);
      }
      notifyMsg.push(`[${user.userName}] token 已失效(${masked})，已自动删除，请重新抓包`);
      return true;
    }
    // 账号不存在(可能已被删) 或 Node环境变量: 只提示不报错
    if (isNode) console.log(`⚠️ [${user.userName}] token 已失效(${masked})，请在 HT_DATA 环境变量中手动移除该账号`);
    return false;
  } catch (e) {
    console.log(`⚠️ 失效账号删除失败: ${e.message || e}`);
    return false;
  }
}

// 多端请求封装（替代 axios，自动适配 $httpClient / $task / Node fetch）
function httpRequest(opts) {
  const method = (opts.method || 'get').toLowerCase();
  let url = opts.url;
  if (opts.params && Object.keys(opts.params).length) {
    const qs = Object.entries(opts.params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  let body = opts.data;
  if (body !== undefined && typeof body === 'object' && !(body instanceof FormData)) {
    const ct = (opts.headers || {})['Content-Type'] || '';
    body = ct.includes('urlencoded')
      ? Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&')
      : JSON.stringify(body);
  }
  // 统一响应解析: 文本 -> 尝试JSON, 失败返回原文 (三端共用这一个出口)
  const parse = (t) => { try { return JSON.parse(t); } catch(_) { return t; } };
  const timeout = opts.timeout || 20000;

  return new Promise((resolve, reject) => {
    const done = (err, text) => err ? reject(new Error(err.message || String(err))) : resolve(parse(text));

    if ($.isNode()) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      fetch(url, { method: method.toUpperCase(), headers: opts.headers || {}, body, signal: ctl.signal })
        .then((r) => r.text().then((t) => { clearTimeout(timer); done(null, t); }))
        .catch((e) => { clearTimeout(timer); done(e); });
      return;
    }
    if (typeof $task !== 'undefined') {
      // QX: timeout单位=秒; 防MITM自拦头
      const h = Object.assign({ 'X-Loon-Skip-Scripting': 'true', 'X-Surge-Skip-Scripting': 'true' }, opts.headers || {});
      const o = { url, headers: h, timeout: Math.floor(timeout / 1000) };
      if (body !== undefined) { o.method = method.toUpperCase(); o.body = typeof body === 'string' ? body : JSON.stringify(body); }
      $task.fetch(o).then((r) => done(null, r.bodyBytes || r.body), (e) => done(e && e.error || e));
      return;
    }
    if (typeof $httpClient !== 'undefined' && $httpClient) {
      // Loon/Surge/SR: timeout单位=毫秒; 防MITM自拦头
      const h = Object.assign({ 'X-Loon-Skip-Scripting': 'true', 'X-Surge-Skip-Scripting': 'true' }, opts.headers || {});
      const o = { url, headers: h, timeout };
      if (body !== undefined) o.body = typeof body === 'string' ? body : JSON.stringify(body);
      const m = method.toUpperCase();
      const cb = (err, _, b) => done(err, typeof b === 'string' ? b : JSON.stringify(b || ''));
      if ($httpClient[m.toLowerCase()]) $httpClient[m.toLowerCase()](o, cb);
      else $httpClient.get(o, cb);
      return;
    }
    reject(new Error('no http adapter'));
  });
}

// 抓包捕获：拦截登录/用户信息接口自动存 token（替代 YYB_GO）
// 返回 true=确实捕获到并存储了 token；false=无有效捕获（应继续走 cron）
async function captureToken() {
  try {
    if (typeof $request === 'undefined' || typeof $response === 'undefined') return false;
    const reqHeaders = Object.keys($request.headers || {}).reduce((o, k) => { o[k.toLowerCase()] = $request.headers[k]; return o; }, {});
    const body = $response.body;
    const url = String($request.url || '');
    if (!body) return false;
    let resObj = null;
    try { resObj = typeof body === 'string' ? JSON.parse(body) : body; } catch(_) { return false; }
    if (!resObj || typeof resObj !== 'object') return false;

    const token = resObj.access_token || resObj.accessToken || (resObj.data && (resObj.data.access_token || resObj.data.accessToken));
    const uuid = reqHeaders['uuid'] || '';
    if (!token) {
      console.log(`[抓包] 响应无 access_token（url=${shortUrl(url)}）——检查是否拦截了正确的登录/用户接口`);
      return false;
    }

    const arr = loadAccounts();
    const d = resObj.data || resObj;
    const name = d.nickname || d.uname || d.mobile || (d.uid != null ? String(d.uid) : '') || uuid.slice(-6);
    const idx = arr.findIndex((a) => a.token === token);
    const entry = { name: name || '', token, uuid, token2: '' };
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    saveAccounts(arr);
    const masked = String(token).slice(-6);
    $.msg('海天美味馆', `🎉账号[${name}] token 已更新(末6位 ${masked})`, '');
    console.log(`[抓包] 已保存账号 ${name} token(末6 ${masked})`);
    return true;
  } catch (e) {
    console.log(`[抓包] 捕获失败: ${e.message || e}`);
    return false;
  }
}

const APP_ID = env('HT_APPID') || $.getdata('HT_APPID') || 'wx7a890ea13f50d7b6';
const API_HOSTS = (function () {
  // Node 测试/自定义：HT_API_HOST 覆盖（格式 buyer|community 以分号分隔多 host）
  if (isNode && env('HT_API_HOST')) {
    return String(env('HT_API_HOST')).split(';').map((h, i) => {
      const [buyer, community] = h.split('|');
      return { buyer: buyer.trim(), community: (community || buyer).trim(), name: 'custom' + (i + 1) };
    });
  }
  return [
    { buyer: 'https://cmallapi.xkmm.cn/buyer-api', community: 'https://cmallwap.xkmm.cn/haday', name: 'xkmm' },
    { buyer: 'https://cmallapi.haday.cn/buyer-api', community: 'https://cmallwap.haday.cn/haday', name: 'haday' }
  ];
})();
let PREFERRED_HOST = API_HOSTS[0];
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.75(0x18004b46) NetType/WIFI Language/zh_CN';
const REFERER = `https://servicewechat.com/${APP_ID}/0/page-frame.html`;
const FOLLOW_UID = env('HT_FOLLOW_UID') || $.getdata('HT_FOLLOW_UID') || '2f03a8263da24c7dafb6afc703eadf2c';
const ENV_LUCKY_IDS = String(env('HT_LUCKY_ID') || $.getdata('HT_LUCKY_ID') || '')
  .split(/[,，\s]+/)
  .map(s => s.trim())
  .filter(Boolean);
const AI_KEY = String(env('AI_KEY') || $.getdata('AI_KEY') || '').trim();
const AI_URL = String(env('AI_URL') || $.getdata('AI_URL') || '').trim();
const AI_MODEL = String(env('AI_MODEL') || $.getdata('AI_MODEL') || 'gpt-4o-mini').trim();
const AI_ENABLED = !!(AI_KEY && AI_URL);
// 同题答案缓存：本轮第一个账号答对/答错后，后续账号共用，避免 AI 同题异答
const quizAnswerCache = new Map();

function quizCacheKey(question, list) {
  const opts = (list || []).map((it) => itemText(it)).join('|');
  return String(question || '').trim() + '##' + opts;
}

function getCachedQuizPick(question, list) {
  const hit = quizAnswerCache.get(quizCacheKey(question, list));
  if (!hit || hit.index == null) return null;
  return {
    index: hit.index,
    text: itemText(list[hit.index]),
    reason: hit.reason || '同题缓存',
    list
  };
}

function setCachedQuizPick(question, list, index, reason) {
  if (index == null || index < 0) return;
  quizAnswerCache.set(quizCacheKey(question, list), { index, reason: reason || '同题缓存' });
}

// 账号列表：从 HT_DATA 存储键 / Node 环境变量读取（替代 YYB_GO）
const ACCOUNTS = loadAccounts();
const SERVERS = ACCOUNTS.map((a) => a.name || a.token);

// 抓包模式不检查账号（捕获时可能还没有）；cron 模式无账号才退出
// 注意：Loon cron 时 $request/$response 是空对象 {}，必须用真实响应体判断
const isCaptureMode = (typeof $response !== 'undefined' && $response && $response.body &&
  typeof $request !== 'undefined' && $request && $request.url);
const NO_ACCOUNT = (!SERVERS.length && !isCaptureMode);
if (NO_ACCOUNT) {
  const msg = '未配置账号 HT_DATA（抓包打开小程序自动捕获，或手动填 [{"name":"","token":"","uuid":""}]）';
  console.error(msg);
  // 手机端无账号也发通知，避免"开始即结束"无任何提示
  try {
    if (!isNode) $.msg('海天美味馆', '未配置账号', '请抓包打开小程序自动捕获 token（HT_DATA）');
  } catch (e) {}
  if (isNode && typeof process !== 'undefined') { process.exit(1); }
  else if (typeof $done !== 'undefined') { $done({}); }
  // 不 throw；靠 NO_ACCOUNT 让入口 IIFE 提前 return，避免 Loon 顶层异常中止
}

const notifyMsg = [];
let succCount = 0;
const sharePool = []; // { activityId, share_code, from }

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randSleep(minMs, maxMs) {
  await sleep(randInt(minMs, maxMs));
}

function guid20() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function maskPhone(p) {
  p = String(p || '');
  if (p.length === 11 && /^\d+$/.test(p)) return p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  return p || '';
}

function parseAccountIndex() {
  // 账号索引号（从存储读账号时用）。原 YYB_GO parseYybGoEntry 已移除
  return 0;
}

function unwrap(res) {
  if (!res || typeof res !== 'object') return res;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data) && (
    res.data.access_token || res.data.accessToken || res.data.activity_code ||
    res.data.task_list || res.data.consum_point !== undefined || res.data.uid
  )) {
    return res.data;
  }
  return res;
}

function unwrapQuiz(res) {
  if (!res || typeof res !== 'object') return res;
  const inner = res.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    if (inner.quiz_id != null || inner.answer_list || inner.question_img || inner.id != null) return inner;
    if (inner.data && typeof inner.data === 'object') return unwrapQuiz(inner);
  }
  return res;
}

function shortUrl(u) {
  const s = String(u || '');
  if (!/^https?:\/\//.test(s)) return s;
  return s.split('/').pop() || s.slice(-40);
}

function summarizeQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return String(quiz);
  const out = {};
  for (const k of Object.keys(quiz)) {
    const v = quiz[k];
    if (typeof v === 'string' && /^https?:\/\//.test(v)) out[k] = shortUrl(v);
    else out[k] = v;
  }
  return JSON.stringify(out);
}

function flagTrue(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE' || v === 'Y' || v === 'yes';
}

function itemText(it) {
  if (it == null) return '';
  if (typeof it !== 'object') return String(it);
  return String(
    it.answer != null ? it.answer
      : (it.content != null ? it.content
        : (it.name != null ? it.name
          : (it.text != null ? it.text : '')))
  );
}

function yesNoIndex(list) {
  const texts = list.map((it) => String(itemText(it)).trim());
  return {
    yes: texts.findIndex((t) => /^(是|对|正确)$/.test(t)),
    no: texts.findIndex((t) => /^(否|错|错误)$/.test(t))
  };
}

// quiz/today 常把每个选项 correct 打成 false，判断题靠题干猜
function guessByQuestion(question, list) {
  const q = String(question || '').replace(/\s+/g, '');
  if (!q) return null;
  const yn = yesNoIndex(list);
  if (yn.yes < 0 || yn.no < 0) return null;
  if (/越多越好|越[^？?]{0,10}越好|可以随便|可以过量|没有保质期|没有过期|发霉还能|不用看日期|都一样|没有区别|可以替代盐|开封后不用|不用冷藏|直接火烧/.test(q)) {
    return { index: yn.no, reason: '判断题误区→否' };
  }
  // 「是一种…吗 / 是不是…工艺吗」一类多为「是」
  if (/是一种|是不是一种|属于一种|属于.*工艺|是一种.*工艺/.test(q)) {
    return { index: yn.yes, reason: '判断题常识→是' };
  }
  if (/吗/.test(q) && /需要冷藏|要冷藏|是酿造|有保质期|含蚝汁|含有黄豆/.test(q) && !/不需要|不用|不是|没有/.test(q)) {
    return { index: yn.yes, reason: '判断题常识→是' };
  }
  return null;
}

function resolveChatCompletionsUrl(base) {
  let u = String(base || '').trim();
  if (!u) return '';
  u = u.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(u)) return u;
  if (/\/v1$/i.test(u)) return u + '/chat/completions';
  return u + '/chat/completions';
}

async function askQuizAi(question, list) {
  if (!AI_ENABLED) return null;
  const url = resolveChatCompletionsUrl(AI_URL);
  if (!url) return null;
  const options = list.map((it, i) => `${i}. ${itemText(it)}`).join('\n');
  const prompt =
    '你是海天美味馆签到答题助手。根据常识判断唯一正确答案。\n' +
    '只输出 JSON，不要其它文字，格式：{"index":数字,"reason":"简短理由"}\n' +
    'index 必须是选项编号（从 0 开始）。\n\n' +
    `题目：${question || '(无题干)'}\n` +
    `选项：\n${options}`;
  try {
    console.log(`  AI判题: model=${AI_MODEL}`);
    const aiResp = await httpRequest({
      method: 'post',
      url,
      headers: {
        Authorization: 'Bearer ' + AI_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      data: JSON.stringify({
        model: AI_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You answer Chinese true/false quizzes. Reply with JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const data = aiResp;
    const content =
      (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      (data && data.output_text) ||
      '';
    const text = String(content || '').trim();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch (e2) {}
      }
    }
    if (!parsed || parsed.index === undefined || parsed.index === null) {
      console.log(`  AI判题无法解析: ${text.slice(0, 160)}`);
      return null;
    }
    const idx = Number(parsed.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
      console.log(`  AI判题下标无效: ${parsed.index}`);
      return null;
    }
    return {
      index: idx,
      text: itemText(list[idx]),
      reason: 'AI: ' + (parsed.reason || AI_MODEL),
      list
    };
  } catch (e) {
    console.log(`  AI判题异常: ${e.message || e}`);
    return null;
  }
}

async function pickQuizAnswer(quiz) {
  if (!quiz || typeof quiz !== 'object') return { index: 0, reason: '无题目' };
  let list = quiz.answer_list || quiz.answerList || quiz.options || [];
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (e) { list = []; }
  }
  if ((!Array.isArray(list) || !list.length) && quiz.answers) {
    try { list = JSON.parse(quiz.answers); } catch (e) { list = []; }
  }
  if (!Array.isArray(list) || !list.length) return { index: 0, reason: '无选项', list: [] };

  const flagKeys = [
    'is_correct', 'isCorrect', 'correct', 'is_right', 'isRight', 'right',
    'is_answer', 'isAnswer', 'true_flag', 'trueFlag'
  ];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it || typeof it !== 'object') continue;
    for (const k of flagKeys) {
      if (flagTrue(it[k])) {
        return { index: i, text: itemText(it), reason: k + '=true', list };
      }
    }
    for (const k of Object.keys(it)) {
      if (/correct|right|is_answer/i.test(k) && flagTrue(it[k])) {
        return { index: i, text: itemText(it), reason: k + '=true', list };
      }
    }
  }

  const cand = [
    quiz.correct_answer, quiz.correctAnswer, quiz.right_answer, quiz.rightAnswer,
    quiz.correct_index, quiz.correctIndex, quiz.answer_index, quiz.right_index
  ];
  for (const ans of cand) {
    if (ans === undefined || ans === null || ans === '') continue;
    if (typeof ans === 'boolean') continue;
    if (typeof ans === 'number' || /^\d+$/.test(String(ans))) {
      const idx = Number(ans);
      if (idx >= 0 && idx < list.length) {
        return { index: idx, text: itemText(list[idx]), reason: '题干correct=' + ans, list };
      }
    }
    const s = String(ans);
    const idx = list.findIndex((it, n) => {
      if (String(n) === s) return true;
      if (it && typeof it === 'object' && (String(it.id) === s || String(it.key) === s)) return true;
      return itemText(it) === s;
    });
    if (idx >= 0) return { index: idx, text: itemText(list[idx]), reason: '匹配正确答案文本', list };
  }

  // 接口不泄漏正确答案时：同题缓存 → AI → 本地规则 → 第 0 项
  const qText = quiz.question || quiz.title || '';
  const cached = getCachedQuizPick(qText, list);
  if (cached) return cached;

  if (AI_ENABLED) {
    const aiPick = await askQuizAi(qText, list);
    if (aiPick) {
      setCachedQuizPick(qText, list, aiPick.index, 'AI首次作答缓存');
      return aiPick;
    }
  }

  const guessed = guessByQuestion(qText, list);
  if (guessed) {
    setCachedQuizPick(qText, list, guessed.index, guessed.reason);
    return { index: guessed.index, text: itemText(list[guessed.index]), reason: guessed.reason, list };
  }

  const blob = [quiz.answer_img, quiz.answerImg, quiz.question_img, quiz.questionImg]
    .map((u) => decodeURIComponent(shortUrl(u)))
    .join(' ');
  if (blob) {
    const idx = list.findIndex((it) => {
      const t = itemText(it);
      return t && blob.indexOf(t) >= 0;
    });
    if (idx >= 0) return { index: idx, text: itemText(list[idx]), reason: '图片文件名含选项', list };
  }

  return {
    index: 0,
    text: itemText(list[0]),
    reason: AI_ENABLED ? 'AI失败且无规则, 暂选第0项' : '未配置AI且无规则, 暂选第0项',
    list
  };
}

function pickToken(res) {
  if (!res || typeof res !== 'object') return '';
  const d = unwrap(res) || {};
  return d.access_token || d.accessToken || res.access_token || res.accessToken || '';
}

function isTokenDead(res) {
  if (res == null) return false;
  const code = res.code != null ? String(res.code) : '';
  const msg = String(res.message || res.msg || res.errorMsg || '');
  if (code === '401' || code === '403' || code === '1001') return true;
  return /未登录|登录失效|token.*(过期|失效)|请重新登录|access.?token/i.test(msg) && !/成功/.test(msg);
}

function collectCodes(node, bag) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(x => collectCodes(x, bag));
    return;
  }
  if (typeof node !== 'object') return;
  const now = Date.now();
  const end = Number(node.end_time || node.endTime || 0);
  if (end > 1000000000000 && end < now) return;
  if (end > 1000000000 && end < 1000000000000 && end * 1000 < now) return;
  const keys = ['activity_code', 'activityCode', 'lucky_activity_code', 'luckyActivityCode'];
  for (const k of keys) {
    const v = node[k];
    if (typeof v === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(v)) bag.add(v);
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectCodes(v, bag);
  }
}

// 新取码逻辑 (2026-08-28): 从活动弹窗 popup 响应提取 page_type / 活动码
// 来源: GET /pages/promote-activities/current/popup
function extractActivityFromPromote(d) {
  const out = [];
  const push = (c) => {
    if (c && /^[A-Za-z0-9_-]{4,40}$/.test(c) && !out.includes(c)) out.push(c);
  };
  const walk = (node, depth) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') {
        if (/^page_type$/i.test(k)) push(String(v).split(/[?#&]/)[0]);
        const m = String(v).match(/page_type=([0-9A-Za-z_-]+)/);
        if (m) push(m[1]);
        if (/^(activity_code|activityCode|lucky_activity_code|luckyActivityCode)$/.test(k)) push(String(v));
      } else if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  };
  walk(d, 0);
  return out;
}

class UserInfo {

  constructor(entry, index) {
    const acc = ACCOUNTS[index - 1] || {};
    this.entry = entry;
    this.ref = (acc && acc.name) || String(entry || '');
    this.index = index;
    this.token = (acc && acc.token) || '';
    this.refreshToken = (acc && acc.refreshToken) || '';
    this.hadayToken = (acc && acc.token2) || '';
    this.uuid = (acc && acc.uuid) || guid20();
    this.uid = (acc && acc.uid) || '';
    this.userName = this.ref || ('账号' + index);
    this.ckStatus = true;
    this._reloginTried = false;
    this._dead = false;
    this.luckyIds = [];
    this.host = PREFERRED_HOST;
    this.signNote = '';
  }

  buyerHeaders(contentType) {
    const h = {
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': USER_AGENT,
      Referer: REFERER,
      uuid: this.uuid,
      envVersion: 'release'
    };
    if (contentType) h['Content-Type'] = contentType;
    if (this.token) h.authorization = this.token;
    return h;
  }

  communityHeaders() {
    const h = this.buyerHeaders('application/json');
    if (this.hadayToken) h['X-Haday-Token'] = this.hadayToken;
    return h;
  }

  async request(opts) {
    const method = (opts.method || 'get').toLowerCase();
    const config = {
      method,
      url: opts.url,
      headers: opts.headers,
      timeout: opts.timeout || 20000,
      data: opts.data,
      params: opts.params
    };
    if (opts.params) config.params = opts.params;
    try {
      const data = await httpRequest(config);
      await randSleep(800, 1600);
      return data;
    } catch (e) {
      console.log(`[${this.userName}] 请求失败: ${e.message}`);
      return undefined;
    }
  }

  async buyer(method, path, { json, form, params } = {}) {
    const headers = this.buyerHeaders(json ? 'application/json' : 'application/x-www-form-urlencoded');
    const opts = { method, url: this.host.buyer + path, headers };
    if (json !== undefined) opts.data = JSON.stringify(json);
    else if (form !== undefined) opts.data = typeof form === 'string' ? form : new URLSearchParams(form).toString();
    if (params) opts.params = params;
    return this.request(opts);
  }

  async community(method, path, json) {
    const opts = {
      method,
      url: this.host.community + path,
      headers: this.communityHeaders()
    };
    if (json !== undefined) opts.data = JSON.stringify(json);
    return this.request(opts);
  }

  async withRelogin(fn) {
    let res = await fn();
    if (isTokenDead(res) && !this._reloginTried) {
      this._reloginTried = true;
      console.log(`[${this.userName}] token 失效，尝试重登`);
      if (await this.login()) res = await fn();
    }
    // 重登仍失效（或重登失败）→ 该 token 已作废, 自动从存储删除（幂等）
    if (isTokenDead(res) && this._reloginTried) {
      this.ckStatus = false;
      dropAccount(this);
    }
    return res;
  }

  async login() {
    this.ckStatus = true;
    this._reloginTried = false;
    this._dead = false;
    console.log(`[${this.userName}] 脚本版本 ht-20260821-multi ，签到答题${AI_ENABLED ? '+AI' : ''}`);
    if (!this.token) {
      console.log(`[${this.userName}] 无 token（HT_DATA 未配置），跳过`);
      return false;
    }
    // 直接用存储的 token，验证有效性（调 members 接口）
    try {
      const res = await this.buyer('get', '/members');
      if (isTokenDead(res)) {
        this._dead = true;
        console.log(`[${this.userName}] token 失效，需要重新抓包（打开小程序）`);
        return false;
      }
      const d = unwrap(res) || {};
      if (d.mobile) this.userName = maskPhone(d.mobile);
      else if (d.nickname) this.userName = d.nickname;
      else if (d.uname) this.userName = d.uname;
      if (d.uid) this.uid = String(d.uid);
      // 社区登录（若没存 token2 则现场换）
      if (!this.hadayToken) await this.communityLogin();
      return true;
    } catch (e) {
      console.log(`[${this.userName}] 登录异常: ${e.message}`);
      return false;
    }
  }

  async communityLogin() {
    const res = await this.community('post', '/wx/auth/loginByToken', { access_token: this.token });
    const token = res && (res.data || res.hadayToken || res.token);
    if (typeof token === 'string' && token) {
      this.hadayToken = token;
      // 存回存储，下次直接复用 token2
      const arr = loadAccounts();
      const idx = arr.findIndex((a) => a.token === this.token);
      if (idx >= 0) { arr[idx].token2 = token; saveAccounts(arr); }
      console.log('  社区token: 已获取');
    } else {
      console.log('  社区token: 未获取到，社区任务可能失败');
    }
  }

  async getUserInfo() {
    const res = await this.withRelogin(() => this.buyer('get', '/members'));
    if (isTokenDead(res)) {
      this.ckStatus = false;
      return false;
    }
    const d = unwrap(res) || {};
    if (d.mobile) this.userName = maskPhone(d.mobile);
    else if (d.nickname) this.userName = d.nickname;
    else if (d.uname) this.userName = d.uname;
    if (d.uid) this.uid = String(d.uid);
    return true;
  }

  // 验证活动码: GET /lucky/task/package/{code} 只读探测
  // 响应含 status 字段时 -> 必须 ===1 (✅有效/❌下一步)
  // 无 status 字段时   -> 无"不存在/已结束"等无效标记即视为有效
  async verifyActivityCode(code) {
    try {
      const res = await this.withRelogin(() => this.buyer('get', `/lucky/task/package/${code}`));
      if (res && (String(res.code) === '1003' || String(res.code) === '1009' ||
          /不存在|已结束|已删除|无效/.test(String(res.message || res.msg || res.errorMsg || '')))) {
        return false;
      }
      const st = res ? (res.status !== undefined ? res.status : (res.data && res.data.status)) : undefined;
      return st === undefined ? true : Number(st) === 1;
    } catch (e) { return false; }
  }

  async resolveLuckyIds() {
    if (ENV_LUCKY_IDS.length) {
      this.luckyIds = [...ENV_LUCKY_IDS];
      console.log(`  抽奖活动(环境变量): ${this.luckyIds.join(', ')}`);
      return this.luckyIds;
    }
    // ===== 新逻辑 (2026-08-28): 活动弹窗取码 -> 提取 page_type -> 验证 =====
    try {
      const popup = await this.withRelogin(() => this.buyer('get', '/pages/promote-activities/current/popup'));
      let cands = extractActivityFromPromote(unwrap(popup) || popup || {});
      cands = cands.filter((c) => /^jfcj\d+/i.test(c));
      cands.sort((a, b) => Number((String(b).match(/(\d+)$/) || [])[1] || 0) - Number((String(a).match(/(\d+)$/) || [])[1] || 0));
      for (const c of cands) {
        const ok = await this.verifyActivityCode(c);
        if (ok) { this.luckyIds = [c]; console.log(`  抽奖活动(弹窗): ${c} ✅`); return this.luckyIds; }
        console.log(`  弹窗候选 ${c} 验证失败(status≠1), 继续`);
      }
      if (cands.length) console.log('  弹窗候选均无效, 回退旧逻辑');
    } catch (e) { console.log('  弹窗取码不可用: ' + (e.message || e)); }
    // ===== 旧逻辑回退: /pages/params + setting + list =====
    const bag = new Set();
    try {
      const params = await this.buyer('get', '/pages/params');
      const d = unwrap(params) || params || {};
      const urls = [];
      if (Array.isArray(d.pointsList)) {
        d.pointsList.forEach((item) => { if (item && item.url) urls.push(String(item.url)); });
      }
      if (d.lottery) urls.push(String(d.lottery));
      urls.forEach((u) => {
        const m = u.match(/page_type=([0-9a-zA-Z]+)/);
        if (m) bag.add(m[1]);
      });
    } catch (e) {}
    const setting = await this.withRelogin(() => this.buyer('get', '/lucky/activity/setting'));
    collectCodes(setting, bag);
    const listRes = await this.buyer('get', '/lucky/activity', { params: { page_no: 1, page_size: 50 } });
    collectCodes(listRes, bag);

    // 新增: 从 /pages/version(模块首页配置) 提取活动入口 page_type (HAR实证 module=COMMUNITY 的 link 指向当前月满中秋 jfcj202609)
    try {
      const verRes = await this.withRelogin(() => this.buyer('get', '/pages/version', { params: { module: 'COMMUNITY' } }));
      (function walk(node){
        if(!node) return;
        if(Array.isArray(node)){ node.forEach(walk); return; }
        if(typeof node!=='object') return;
        for(const v of Object.values(node)){
          if(typeof v==='string'){
            const m=v.match(/page_type=([0-9A-Za-z_-]+)/);
            if(m && /^jfcj\d+/i.test(m[1])) bag.add(m[1]);
          } else if(v&&typeof v==='object') walk(v);
        }
      })(unwrap(verRes) || verRes || {});
    } catch (e) { console.log('  取码(version): ' + (e && e.message || e)); }


    // 只保留 jfcj*，按尾部数字倒序，默认只跑最新 1 个（旧活动会报不存在/已结束）
    let jfcj = [...bag].filter((c) => /^jfcj\d+/i.test(c));
    jfcj.sort((a, b) => {
      const na = Number((String(a).match(/(\d+)$/) || [])[1] || 0);
      const nb = Number((String(b).match(/(\d+)$/) || [])[1] || 0);
      return nb - na;
    });
    if (!jfcj.length) jfcj = [...bag];
    this.luckyIds = jfcj.slice(0, 1);
    if (this.luckyIds.length) console.log(`  抽奖活动(自动): ${this.luckyIds.join(', ')}${jfcj.length > 1 ? `（另有 ${jfcj.slice(1).join(', ')} 已跳过）` : ''}`);
    else console.log('  抽奖活动: 未自动到 ID，跳过抽奖任务');
    return this.luckyIds;
  }

  async fetchTodayQuiz() {
    const raw = await this.withRelogin(() => this.buyer('get', '/sign/activity/quiz/today'));
    return unwrapQuiz(raw);
  }

  async doSign() {
    this.signNote = '';
    const info = await this.withRelogin(() => this.buyer('get', '/sign/activity/code', { params: { activityCode: '' } }));
    const d = unwrap(info) || {};
    const activityCode = d.activity_code || d.activityCode;
    if (!activityCode) {
      console.log(`  签到: 活动未开启或接口异常 ${JSON.stringify(info)}`);
      return '';
    }
    console.log(`  签到活动: ${activityCode}`);

    const mi = await this.buyer('get', '/sign/activity/member/info', { params: { activityCode } });
    const member = unwrap(mi) || {};
    const already = !!(member.is_sign);
    const quiz = await this.fetchTodayQuiz();
    const qText = (quiz && (quiz.question || quiz.title)) || '';
    console.log(`  今日题目: ${qText || summarizeQuiz(quiz)}`);

    if (already) {
      const uc = quiz && quiz.user_correct;
      this.signNote = '已签' + (uc === true || uc === 1 ? '(答对)' : uc === false || uc === 0 ? '(答错)' : '');
      console.log('  签到状态: 今日已签到' + (this.signNote.indexOf('答') >= 0 ? ' ' + this.signNote : ''));
    } else {
      const pick = await pickQuizAnswer(quiz);
      const texts = (pick.list || []).map((it, i) => i + ':' + itemText(it));
      console.log(`  选项: ${texts.join(' / ') || '(空)'}`);
      console.log(`  选中: [${pick.index}] ${pick.text || ''} (${pick.reason})`);

      const body = {
        quiz_id: quiz && (quiz.quiz_id != null ? quiz.quiz_id : quiz.quizId),
        quiz_question_id: quiz && (quiz.id != null ? quiz.id : quiz.quiz_question_id),
        activity_code: activityCode,
        answer: pick.index,
        fill_date: ''
      };
      if (body.quiz_id == null || body.quiz_question_id == null) {
        console.log(`  ⚠️ 题目缺 quiz_id/id，仍按小程序字段提交: ${JSON.stringify(body)}`);
      }

      const sign = await this.buyer('post', '/sign/activity/sign', { json: body });
      const ok = sign && (sign.is_sign || sign.code === 200 || sign.success || /成功/.test(String(sign.message || '')));
      console.log(ok ? '  签到状态: ✅ 成功' : `  签到状态: ❌ ${JSON.stringify(sign)}`);

      await sleep(800);
      const after = await this.fetchTodayQuiz();
      const uc = after && after.user_correct;
      const correct = uc === true || uc === 1 || uc === 'true' || uc === '1';
      const wrong = uc === false || uc === 0 || uc === 'false' || uc === '0';
      if (correct) {
        this.signNote = '签到答对';
        console.log('  签到判题: ✅ 答对（高级分）');
        setCachedQuizPick(qText, pick.list || [], pick.index, '答对复核缓存');
      } else if (wrong) {
        this.signNote = '签到答错(1分)';
        console.log(`  签到判题: ⚠️ 答错，只得1分。回包: ${summarizeQuiz(after)}`);
        const opts = pick.list || [];
        if (opts.length === 2) {
          const other = pick.index === 0 ? 1 : 0;
          setCachedQuizPick(qText, opts, other, '答错后改选另一项缓存');
          console.log(`  同题缓存纠正: 后续账号改用 [${other}] ${itemText(opts[other])}`);
        }
      } else {
        this.signNote = ok ? '签到成功' : '签到失败';
        console.log(`  签到判题: user_correct=${String(uc)} ${summarizeQuiz(after)}`);
      }
    }

    try {
      const gift = await this.buyer('post', `/sign/activity/get/gift/${activityCode}`, { json: {} });
      if (gift && (gift.success || gift.code === 200 || /成功|已领取/.test(String(gift.message || '')))) {
        console.log(`  签到礼物: ${gift.message || '已领取'}`);
      }
    } catch (e) {}
    return activityCode;
  }

  async doBrowsePoints() {
    const bp = await this.withRelogin(() => this.buyer('post', '/members/browsePage', { json: {} }));
    console.log(`  浏览页面: ${bp && (bp.message || bp.msg) ? (bp.message || bp.msg) : '✅ 完成'}`);
    await this.buyer('post', '/members/grantPointByFirstCollectMiniApp', { json: {} });
    await this.buyer('post', '/members/share/number/add', { json: {} });
    const seconds = randInt(15, 30);
    const cp = await this.buyer('post', `/members/commnity/brosing/duration/add?seconds=${seconds}`, { json: {} });
    const cpText = typeof cp === 'string' ? cp : JSON.stringify(cp || '');
    console.log(`  浏览社区: ${/403|失败/.test(cpText) ? '❌ 失败' : '✅ 完成'} (${seconds}s)`);
  }

  async doCommunityExtra() {
    if (!this.hadayToken) return;
    try {
      const list = await this.community('post', '/wx/blog/nolikeList?pageSize=10&pageNum=1&types=1&essence=1&showAllUser=1', {});
      const rows = (list && list.data && (list.data.rows || list.data.list)) || [];
      if (rows.length) {
        const blogId = rows[0].id;
        const add = await this.community('post', '/wx/comment/add', {
          blogId,
          comment: '每天来看看，海天味道真不错。',
          pcommentId: '',
          pcommentUserId: '',
          pcommentUserName: '',
          pparentId: ''
        });
        const msg = (add && (add.errorMsg || add.message || add.msg)) || '完成';
        console.log(`  社区评论: ${msg}`);
      } else {
        console.log('  社区评论: 无可用笔记');
      }
    } catch (e) {
      console.log('  社区评论: ' + e.message);
    }
    try {
      const follow = await this.community('post', '/wx/like/follow', { likeUserId: FOLLOW_UID });
      const msg = (follow && (follow.errorMsg || follow.message || follow.msg)) || '完成';
      console.log(`  关注官号: ${msg}`);
    } catch (e) {
      console.log('  关注官号: ' + e.message);
    }
  }

  async collectShareCodes() {
    for (const id of this.luckyIds) {
      const sc = await this.withRelogin(() => this.buyer('get', `/lucky/task/share/code/${id}`));
      const code = sc && sc.share_code;
      if (code) {
        sharePool.push({ activityId: id, share_code: code, from: this.uid || String(this.token).slice(-8) });
        console.log(`  助力码[${id}]: ${code} (from=${this.uid || String(this.token).slice(-8)})`);
      }
    }
  }

  // 单次助力: 只发请求并归一化返回消息, 调度逻辑在 main 的 runMutualHelp
  async assistOne(share_code) {
    const res = await this.buyer('post', `/lucky/task/share/code/success/${share_code}`, { form: {} });
    return String((res && (res.message || res.msg || res.errorMsg || (res.data && res.data.message))) || '');
  }

  async helpOthers() {
    /* 互刷已迁移到 main 阶段的 runMutualHelp 调度, 此处保留空实现以兼容旧调用 */
  }

  async doLuckyTasks(activityId) {
    console.log(`  ---- 抽奖 ${activityId} ----`);
    const tl = await this.withRelogin(() => this.buyer('get', `/lucky/task/package/${activityId}`));
    if (tl && (String(tl.code) === '1003' || String(tl.code) === '1009' || /不存在|已结束|已删除/.test(String(tl.message || '')))) {
      console.log(`  抽奖活动无效: ${tl.message || tl.code}，跳过`);
      return false;
    }
    const tasks = (tl && tl.task_list) || [];
    if (!tasks.length) {
      console.log('  抽奖任务: 无列表');
      return true;
    }
    for (const t of tasks) {
      const remain = (t.today_available_task_number || 0) - (t.today_obtained_task_number || 0);
      console.log(`  任务: ${t.task_name || t.task_key} 剩余${remain}`);
      if (remain <= 0) continue;
      const key = t.task_key;
      if (key === 'LOGIN') {
        const r = await this.buyer('put', `/lucky/task/getLoginOpporturnity/${activityId}`, { json: {} });
        console.log(`  登录领次数: ${r && (r.message || r) ? JSON.stringify(r.message || r) : '完成'}`);
      } else if (key === 'POINT_EXCHANGE') {
        for (let k = 0; k < remain; k++) {
          const redeem = await this.buyer('get', '/lucky/activity/redeem', { params: { activityCode: activityId } });
          console.log(`  积分兑换 (${k + 1}/${remain}): ${redeem && !redeem.code ? '✅' : JSON.stringify(redeem)}`);
          await sleep(1000);
        }
      } else if (key === 'BROWSE_PAGE_TASK' && t.link) {
        const pageUrl = t.link;
        await this.buyer('get', `/lucky/task/browse/page/start/${activityId}`, { params: { pageUrl } });
        const waitMs = randInt(18000, 22000);
        console.log(`  浏览页等待 ${(waitMs / 1000).toFixed(0)} 秒...`);
        await sleep(waitMs);
        const end = await this.buyer('get', `/lucky/task/browse/page/end/${activityId}`, { params: { pageUrl } });
        console.log(`  浏览任务: ${(end && end.message) || '✅ 成功'}`);
      } else if (key === 'SHARE_PAGE_TASK' && t.link) {
        const share = await this.buyer('get', `/lucky/task/share/page/code/${activityId}`, { params: { pageUrl: t.link } });
        const code = share && share.share_code;
        if (code) {
          const ok = await this.buyer('post', `/lucky/task/share/page/code/success/${code}`, { form: {} });
          console.log(`  分享页面: ${(ok && ok.message) || '✅ 成功'}`);
        } else {
          console.log(`  分享页面: ${JSON.stringify(share)}`);
        }
      } else if (key === 'SHARE_LUCKY') {
        console.log('  分享抽奖: 走账号互助');
      } else if (key === 'ADD_COMPANY_WECHAT') {
        console.log('  添加企微: 需人工，跳过');
      }
    }
    return true;
  }

  async doDraw(activityId) {
    console.log('  开始抽奖...');
    let drawCount = 0;
    for (let i = 0; i < 30; i++) {
      const draw = await this.withRelogin(() => this.buyer('get', '/lucky/activity/extract', { params: { activityCode: activityId } }));
      if (!draw) {
        console.log('  抽奖结束/无响应');
        break;
      }
      if (String(draw.code) === '1003' || String(draw.code) === '1009' || /不存在|已结束|已删除/.test(String(draw.message || ''))) {
        console.log(`  抽奖跳过: ${draw.message || draw.code}`);
        return false;
      }
      if (draw.lucky_record_vo) {
        drawCount++;
        const name = draw.lucky_record_vo.prize_name;
        console.log(`    🎁 第${drawCount}次: ${name} (剩余: ${draw.opporturnity})`);
        if (draw.lucky_record_vo.prize_type != 2) {
          notifyMsg.push(`账号【${this.userName}】抽中: ${name}`);
        }
        if (draw.opporturnity <= 0) break;
      } else if (Object.prototype.hasOwnProperty.call(draw, 'opporturnity') && !draw.code) {
        drawCount++;
        console.log(`    🎁 第${drawCount}次: 谢谢参与 (剩余: ${draw.opporturnity})`);
        if (draw.opporturnity <= 0) break;
      } else if (draw.code == '1007' || /不足/.test(String(draw.message || ''))) {
        console.log('    ℹ️ 机会已全部用尽');
        break;
      } else {
        console.log(`    ℹ️ 抽奖结束: ${JSON.stringify(draw)}`);
        break;
      }
      await sleep(2000);
    }
    return true;
  }

  async queryPoints() {
    const p = await this.withRelogin(() => this.buyer('get', '/members/points/current'));
    const d = unwrap(p) || {};
    if (d.consum_point !== undefined) {
      console.log(`  资产查询: 当前拥有 💰 ${d.consum_point} 积分`);
      notifyMsg.push(`账号【${this.userName}】积分: ${d.consum_point}${this.signNote ? ' | ' + this.signNote : ''}`);
      return d.consum_point;
    }
    notifyMsg.push(`账号【${this.userName}】积分:查询失败`);
    return null;
  }

  async runDailyTasks() {
    const parts = [];
    await this.doSign();
    if (this.signNote) parts.push(this.signNote);
    await this.doBrowsePoints();
    await this.doCommunityExtra();
    for (const id of this.luckyIds.slice()) {
      const okTask = await this.doLuckyTasks(id);
      if (okTask === false) {
        this.luckyIds = this.luckyIds.filter((x) => x !== id);
        continue;
      }
      const okDraw = await this.doDraw(id);
      if (okDraw === false) this.luckyIds = this.luckyIds.filter((x) => x !== id);
    }
    const pts = await this.queryPoints();
    if (pts != null) parts.push(`积分 ${pts}`);
    return parts.filter(Boolean).join(' | ');
  }
}

// ============ 远端通知  ============
let sanCache = 0;
let sanNotices = '';
async function printDisclaimer() {
  try {
    if (sanNotices && Date.now() - sanCache < 30 * 60 * 1000) { console.log(sanNotices); return; }
    const urls = [
      'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/notice.json',
      'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/tip.json'
    ];
    const [a, b] = await Promise.all(urls.map((u) => httpRequest({ method: 'get', url: u, timeout: 15000 }).catch((_e) => null)));
    const lines = [];
    const push = (j) => {
      if (j && typeof j === 'object') {
        const v = j.notice || j.tip || j.msg || j.message;
        if (v) lines.push(v);
      }
    };
    push(a);
    push(b);
    if (lines.length) { sanNotices = lines.join('\n'); sanCache = Date.now(); console.log(sanNotices); }
  } catch (_e) {}
}

async function main() {
  await printDisclaimer();
  console.log('\n[INFO] 海天美味馆 ht-20260828-v3  账号 ' + SERVERS.length + ' 个' + (AI_ENABLED ? '  AI判题=开' : '  AI判题=关') + '\n');
  // ===== 网络自测：探测海天 API 是否可达（诊断 Request timeout）=====
  try {
    const probe = await httpRequest({
      method: 'get',
      url: 'https://cmallapi.xkmm.cn/buyer-api/sign/activity/code?activityCode=',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
      timeout: 10000
    });
    const probeText = typeof probe === 'string' ? probe : JSON.stringify(probe || {}).slice(0, 80);
    console.log(`[网络自测] cmallapi.xkmm.cn 可达 ✅ -> ${probeText}`);
  } catch (e) {
    console.log(`[网络自测] ✅❌ cmallapi.xkmm.cn 请求失败: ${e.message}`);
    console.log('[网络自测] 若为 timeout，请检查 Loon 分流规则：DOMAIN-SUFFIX,xkmm.cn,DIRECT 和 haday.cn 直连');
  }
  const users = SERVERS.map((e, i) => new UserInfo(e, i + 1));
  const okUsers = [];

  // 阶段1：先登录全部账号（互助需要先凑齐助力码）
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    console.log(`\n============= 账号${user.index} 登录 =============`);
    console.log(`ref: ${user.ref}\n`);
    if (!(await user.login())) {
      console.log(`\n[账号${user.index} 结果] 登录失败`);
      if (user._dead) {
        dropAccount(user); // token失效 → 自动删除（幂等，重复调用无副作用）
      } else {
        notifyMsg.push(`[${user.userName}] 积分:登录失败，需要重新授权`);
      }
      continue;
    }
    await user.getUserInfo();
    if (!user.ckStatus) {
      console.log(`\n[账号${user.index} 结果] ck失效`);
      notifyMsg.push(`[${user.userName}] 积分:ck已失效，用户需要去登录`);
      dropAccount(user); // token失效 → 自动删除（withRelogin 已删则此处幂等）
      continue;
    }
    okUsers.push(user);
    if (i < users.length - 1) await randSleep(1500, 3500);
  }

  if (!okUsers.length) {
    console.log('\n没有可用账号\n');
    // 全部账号失效时也要把删除通知发出去
    try {
      if (notifyMsg.length) $.msg('海天美味馆', `共${SERVERS.length}个账号,成功0个`, notifyMsg.join('\n'));
    } catch (e) { console.log('通知发送失败: ' + (e.message || e)); }
    return;
  }

  await okUsers[0].resolveLuckyIds();
  const luckyIds = okUsers[0].luckyIds.slice();
  for (const u of okUsers) u.luckyIds = luckyIds.slice();

  console.log('\n====== 收集助力码 ======');
  for (const user of okUsers) {
    console.log(`\n[${user.userName}]`);
    await user.collectShareCodes();
  }

  // ====== 中转同步: 上报我的码 + 拉取他人码 (失败降级本地互刷) ======
  if (HUB_URL.includes('xxxx')) { console.log('[中转] HUB_URL未配置真实子域, 跳过'); }
  else {
    try {
      const resp = await hubPush(sharePool.slice());
      const merged = (resp && Array.isArray(resp.codes)) ? resp.codes : [];
      sharePool.length = 0;
      sharePool.push(...merged);
    } catch (e) {
      console.log(`[中转] 同步失败, 降级本地互刷: ${e.message}`);
    }
  }

  // ====== 外部助力码(手动交换通道): 存储键 HT_HELP_CODES ======
  // 格式: [{"activityId":"jfcjxxx","share_code":"xxx","from":"朋友A"}]
  // 用途: 不用gist时, 朋友把日志里的码发你, 填进来即可被互刷调度消耗
  {
    const extRaw = env('HT_HELP_CODES') || $.getdata('HT_HELP_CODES') || '';
    if (extRaw) {
      try {
        const extList = typeof extRaw === 'string' ? JSON.parse(extRaw) : extRaw;
        const known = new Set(sharePool.map((c) => c.share_code));
        let added = 0;
        for (const c of Array.isArray(extList) ? extList : []) {
          if (c && c.share_code && !known.has(c.share_code)) { sharePool.push(c); added++; }
        }
        if (added) console.log(`[外部码] 新增${added}个朋友的码入池`);
      } catch (e) { console.log('[外部码] 解析失败: ' + e.message); }
    }
  }

  // ====== 互刷助力调度 v4 (2026-08-28 确定性环形分配) ======
  // 本地N>=4 → 数学保证全员3/3: helper_i 帮环上随后3个不同本地码 (Latin式无重复对)
  // 本地N<4   → 本地最多(N-1)次, 富余额度帮外部同活动码(结善缘, 对方设备富余时帮回)
  // 平台约束: 同日重跑无新计数 -> 3/3 须当天首次运行
  const pend = sharePool.slice();
  const myAct = (okUsers[0].luckyIds && okUsers[0].luckyIds[0]) || '';
  const localSet = new Set(okUsers.map((u) => u.uid || String(u.token).slice(-8)));
  const sameAct = pend.filter((it) => !it.activityId || it.activityId === myAct);   // 同活动池
  const crossAct = pend.filter((it) => it.activityId && myAct && it.activityId !== myAct);
  // 服务端hits>=3 的码视为已满(跨设备共享状态), 直接标记跳过
  for (const it of sameAct) if (isFull(it)) it.dead = true;
  const localPool = sameAct.filter((it) => localSet.has(it.from));                  // 本地账号码(闭环用)
  const extPool = sameAct.filter((it) => !localSet.has(it.from));                   // 外部码(富余用)
  const fullCnt = sameAct.filter((x) => x.dead).length;
  console.log(`\n====== 互刷助力 (活动 ${myAct || '未知'}, 同活动 ${sameAct.length} 码: 本地${localPool.length} + 外部${extPool.length}${fullCnt ? `, 已满跳过 ${fullCnt}` : ''}, 跨活动 ${crossAct.length} 跳过) ======`);

  for (let i = 0; i < okUsers.length; i++) {
    const helper = okUsers[i];
    const myId = helper.uid || String(helper.token).slice(-8);
    const helped = new Set();
    let used = 0, limitHit = false;
    // ---- 阶段1: 本地闭环 - helper_i 帮环上固定后3位 (i+1,i+2,i+3)%m ----
    // 索引固定不随出队变化(dead标记替代splice), 保证每码恰被3个不同helper尝试
    const m = localPool.length;
    if (m > 1) {
      for (let step = 1; step <= 3 && !limitHit; step++) {
        const it = localPool[(i + step) % m];
        if (!it || it.from === myId || it.dead) continue;   // 环上自己/已失效 -> 跳过
        if (helped.has(it.share_code)) continue;
        const msg = await helper.assistOne(it.share_code);
        helped.add(it.share_code); used++;
        if (/成功/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}] 助力成功(+1)`);                   // 留队, 其他helper继续
          hubMark(it.share_code, myId);                                             // 回传hub计数(跨设备hits+1)
        } else if (/次数.*(用尽|用完)|上限|最多\d+名|已完成\d+名/.test(msg)) {
          console.log(`  [${myId}] ${msg} -> 换下一个账号`);
          limitHit = true; break;
        } else if (/不可以为自己助力/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}] 自己的旧码(标识不一致), 修正归属`);
          it.from = myId;                                  // 修正后纳入本地闭环
        } else if (/已满|好友任务已完成/.test(msg) && !/当天只能/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}] ${msg}`);
          it.dead = true;                                  // 标记失效(不出队, 保持环形索引)
          hubMark(it.share_code, myId);                    // 已满也mark, 让其他设备提前感知
        } else if (/不存在/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}] ${msg}`);
          it.dead = true;                                  // 码失效 -> 标记
        } else {
          console.log(`  [${myId}] -> [${it.from}] ${msg || '(无返回)'}`);
        }
      }
    }
    // ---- 阶段2: 富余额度帮外部同活动码 (仅本地码不足3个时) ----
    if (!limitHit && used < 3) {
      for (const it of extPool.slice()) {
        if (used >= 3) break;
        if (helped.has(it.share_code)) continue;
        const msg = await helper.assistOne(it.share_code);
        helped.add(it.share_code); used++;
        if (/成功/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}](外部) 助力成功(+1)`);
          hubMark(it.share_code, myId);                                             // 跨设备hits+1
        } else if (/次数.*(用尽|用完)|上限|最多\d+名|已完成\d+名/.test(msg)) {
          console.log(`  [${myId}] ${msg} -> 结束`);
          limitHit = true; break;
        } else if (/已满|好友任务已完成/.test(msg) && !/当天只能/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}] ${msg}`);
          extPool.splice(extPool.indexOf(it), 1);
          sameAct.splice(sameAct.indexOf(it), 1);
          hubMark(it.share_code, myId);                                             // 让其他设备提前感知已满
        } else if (/不存在/.test(msg)) {
          console.log(`  [${myId}] -> [${it.from}] ${msg}`);
          extPool.splice(extPool.indexOf(it), 1);
          sameAct.splice(sameAct.indexOf(it), 1);
        } else {
          console.log(`  [${myId}] -> [${it.from}] ${msg || '(无返回)'}`);
        }
      }
    }
    console.log(`  [${myId}] 本轮助力 ${used} 次`);
  }
  const remainLocal = localPool.filter((x) => !x.dead && (!x.activityId || x.activityId === myAct)).length;
  console.log(`互刷结束: 本地同活动剩余 ${remainLocal} 个 (跨活动 ${crossAct.length} 个不处理)`);

  // 阶段2：按账号串行跑完任务（签到→浏览→互助→抽奖→积分）
  console.log('\n====== 每日任务 ======');
  for (let i = 0; i < okUsers.length; i++) {
    const user = okUsers[i];
    // 同步已被前面账号剔除的无效活动
    user.luckyIds = okUsers[0].luckyIds.slice();
    console.log(`\n============= 账号${user.index}【${user.userName}】任务 =============\n`);
    try {
      const summary = await user.runDailyTasks();
      // 把剔除结果回写给后续账号
      okUsers[0].luckyIds = user.luckyIds.slice();
      succCount++;
      console.log(`\n[账号${user.index} 结果] ${summary || '完成'}`);
    } catch (e) {
      console.log(`  任务异常: ${e.message || e}`);
      console.log(`\n[账号${user.index} 结果] 任务失败: ${e.message || e}`);
      notifyMsg.push(`账号【${user.userName}】任务异常: ${e.message || e}`);
    }
    if (i < okUsers.length - 1) await randSleep(2000, 4000);
  }

  const title = `共${SERVERS.length}个账号,成功${succCount}个,失败${SERVERS.length - succCount}个`;
  console.log(`\n============= 运行汇总 =============`);
  console.log(title);
  if (notifyMsg.length) {
    console.log('');
    notifyMsg.forEach((line) => console.log(line));
  }
  console.log('');
  // 手机端发系统通知（多端统一：成功/失败都弹，空 body 补默认文案）
  const body = [title].concat(notifyMsg).join('\n');
  try {
    $.msg('海天美味馆', title, body || '全部任务完成');
  } catch (e) { console.log('通知发送失败: ' + (e.message || e)); }
}


// ============ 助力码中转 (Cloudflare Workers 码库) ============
// HUB_URL 可用 HT_HUB_URL(环境变量/存储键)覆盖, 默认反代
const HUB_URL = env('HT_HUB_URL') || $.getdata('HT_HUB_URL') || 'https://ht-hub.sansuiwong.icu/codes';
const HUB_KEY = '9cb6f3a4e6fb7dda4ec2c6f997a5978e';

async function hubPull() {
  const res = await httpRequest({ method: 'get', url: HUB_URL, headers: { 'X-Hub-Key': HUB_KEY }, timeout: 20000 });
  const list = Array.isArray(res) ? res : (res && Array.isArray(res.codes) ? res.codes : []);
  // 只保留脚本格式码(share_code); 客户端ht-hub.js推的{code}记录跳过, 避免 /success/undefined
  const ok = list.filter((c) => c && typeof c.share_code === 'string' && c.share_code);
  if (ok.length !== list.length) console.log(`[中转] 跳过 ${list.length - ok.length} 条非脚本格式码(客户端工具推送)`);
  return ok;
}

async function hubPush(myCodes) {
  const mine = myCodes.map((c) => ({ ...c, ts: Date.now() }));
  // 合并在服务端完成: 同from只留最新(新码hits重置0)
  return httpRequest({
    method: 'post',
    url: HUB_URL,
    headers: { 'X-Hub-Key': HUB_KEY, 'Content-Type': 'application/json' },
    data: JSON.stringify(mine),
    timeout: 20000,
  });
}

// 助力成功 → 回传hub计数 (hits+1, 跨设备共享"该码已满"信息); 失败静默不影响主流程
async function hubMark(share_code, from) {
  try {
    await httpRequest({
      method: 'post',
      url: HUB_URL,
      headers: { 'X-Hub-Key': HUB_KEY, 'Content-Type': 'application/json' },
      data: JSON.stringify({ code: share_code, ok: true, from: from || '' }),
      timeout: 15000,
    });
  } catch (_e) {}
}

// 码是否已被帮满(服务端hits>=3 或 旧版无hits字段视为未满)
function isFull(it) {
  return !!(it && typeof it.hits === 'number' && it.hits >= 3);
}


!(async () => {
  // 无账号且非抓包：已在顶层 done/exit，直接结束
  if (typeof NO_ACCOUNT !== 'undefined' && NO_ACCOUNT) return;
  // 抓包模式：仅当确实捕获到 token 才结束（防 Loon cron 注入空对象误判）
  // 无 token 时继续走 cron 任务，保证任何环境都不会"开始即结束"
  if (typeof $response !== 'undefined' && $response && $response.body &&
      typeof $request !== 'undefined' && $request && $request.url) {
    // 抓包模式：先尝试捕获 token，然后【总是】原样返回响应体
    // （script-response-body 必须 $done 且不能丢弃 body，否则小程序登录/请求被破坏）
    const captured = await captureToken();
    const respBody = (typeof $response !== 'undefined' && $response) ? $response.body : undefined;
    if (typeof $done !== 'undefined') $done({ body: respBody });
    if (captured) return;
    console.log('[抓包] 响应无 token，已原样放行');
    return;
  }
  // cron 模式：跑任务
  await main();
})().catch((e) => console.log(e && e.message ? e.message : e));
