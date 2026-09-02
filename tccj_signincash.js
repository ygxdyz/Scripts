/*
------------------------------------------
@Date: 2026.09.02
@Description: 同程旅行-签到现金(赚积分·抵车费同体系)
new Env("同程签到现金");
cron 15 8 * * * tclx_signincash.js

脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，不支持青龙

变量 signInCash_data，多账号JSON数组格式(自动抓包捕获, 也可手动填):
[{"actId":"活动ID(XXXXXXXXXXXXXXX)","unionId":"用户unionId","idenId":"活动页openId","remark":"备注"}]
获取方式：打开同程旅行小程序 → 签到现金页面 → 触发 activity/signInCash/getIndexInfo 自动捕获

抓包配置 (recommended: response-body):
Loon:
  [Script]
  http-response ^https://cvg.17usoft.com/activity/signInCash/ script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/tccj_signincash.js, requires-body=true, enable=true
  [MITM]
  hostname = cvg.17usoft.com
Surge:
  [Script]
  同程签到现金 = type=http-response, pattern=^https://cvg.17usoft.com/activity/signInCash/, requires-body=1, script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/tccj_signincash.js
  [MITM]
  hostname = %APPEND% cvg.17usoft.com
Quantumult X:
  [rewrite_local]
  ^https://cvg.17usoft.com/activity/signInCash/ url script-response-body https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/tccj_signincash.js
  [mitm]
  hostname = cvg.17usoft.com
Shadowrocket:
  [Script]
  http-response ^https://cvg.17usoft.com/activity/signInCash/ script-path=https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/tccj_signincash.js requires-body=true, max-size=0, enable=true
  [MITM]
  hostname = cvg.17usoft.com

功能：每日签到(积分+5) + 浏览任务自动完成领积分 + 分享任务尝试 + 积分兑换(开 is_exchange=true 自动按积分换里程/现金)
存储键: signInCash_data(账号JSON数组) / is_exchange(is_exchange=true自动换买得起/填prizeId如"6167,7729"只换指定, 默认关) / is_debug(调试)

⚠️【免责声明】
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/
const $ = new Env("同程签到现金");
const ckName = "signInCash_data";
const API = "https://cvg.17usoft.com/activity/signInCash";

// ================= Env 精简框架 =================
function Env(name) {
  return new (class {
    constructor(name) { this.name = name; this.logs = []; }
    getval(key, def = '') { try { return ($.isNode ? process.env[key] : (typeof $persistentStore !== 'undefined' ? $persistentStore.read(key) : (typeof $prefs !== 'undefined' ? $prefs.getValue(key) : def))) || def } catch (e) { return def } }
    setval(val, key) { try { if ($.isNode) { process.env[key] = val; return true } return typeof $persistentStore !== 'undefined' ? $persistentStore.write(val, key) : (typeof $prefs !== 'undefined' ? $prefs.setValue(val, key) : false) } catch (e) { return false } }
    getjson(key, def = {}) { try { const t = this.getval(key, ''); return t ? JSON.parse(t) : def } catch (e) { return def } }
    setjson(val, key) { try { return this.setval(JSON.stringify(val), key) } catch (e) { return false } }
    get = (url, cb) => this.httpRequest('GET', url, null, cb);
    post = (url, body, cb) => this.httpRequest('POST', url, body, cb);
    httpRequest(method, url, body, cb) {
      const headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x18003030) NetType/4G Language/zh_CN miniProgram/wx624dc2cce62f7008', 'Content-Type': 'application/json' };
      if (typeof $task !== 'undefined') { $task.fetch({ method, url, headers, body: body ? JSON.stringify(body) : body }).then(r => cb(null, r.body, r.statusCode), e => cb(e)); return }
      if (typeof $httpClient !== 'undefined') { const b = body ? JSON.stringify(body) : body; $httpClient[method.toLowerCase()]({ url, headers, body: b }, (e, r, d) => cb(e, d)); return }
      if ($.isNode) { const u = new URL(url); const https = require('https'); const http = require('http'); const mod = u.protocol === 'https:' ? https : http; const opt = { method, hostname: u.hostname, path: u.pathname + u.search, headers }; const req = mod.request(opt, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => cb(null, d)); }); req.on('error', cb); if (body) req.write(JSON.stringify(body)); req.end(); }
    }
    wait(t) { return new Promise(r => setTimeout(r, t * 1e3)) }
    log(...a) { const s = a.join(' '); console.log(s); this.logs.push(s) }
    msg(sub, body, desc) { try { if ($.isNode) { this.log(sub, body); return } if (typeof $notification !== 'undefined') $notification.post(sub, body, desc); else if (typeof $notify !== 'undefined') $notify(sub, body, desc) } catch (e) { } }
    done() { try { typeof $done !== 'undefined' && $done({}) } catch (e) { } }
  })(name);
}

// ================= 工具 =================
const maskString = (s) => { try { const t = String(s || ''); return t.length > 8 ? t.slice(0, 4) + '****' + t.slice(-4) : t } catch (e) { return s } };
const isDebugOn = () => /^(true|1|yes|on)$/i.test(String($.getval('is_debug', '')).trim());

// ================= 远端通知 (GLOBAL规范: CDN+30min缓存+await) =================
const REMOTE_NOTICE_URLS = [
  'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/notice.json',
  'https://cdn.jsdelivr.net/gh/kwypn/Hi@main/tip.json'
];
async function printDisclaimer() {
  try {
    const now = Date.now();
    if (now - (parseInt($.getval('noticeTs', '0')) || 0) < 30 * 60 * 1000) return; //30分钟内不重复请求
    const fetchOne = u => new Promise(r => $.get(u, (e, d) => r({ ok: !e && !!d && d.indexOf('{') >= 0, txt: d || '' })));
    let results = await Promise.all(REMOTE_NOTICE_URLS.map(fetchOne));
    // 失败一轮全部重拉 (确保完整拉取到才继续业务)
    if (results.some(x => !x.ok)) {
      $.log('[远端通知] 首拉未完整, 重试一轮...');
      results = await Promise.all(REMOTE_NOTICE_URLS.map(fetchOne));
    }
    for (const r of results) {
      try { const j = JSON.parse(r.txt); if (j && j.notice) $.log(`📢 远端通知: ${j.notice}`) } catch (e) { }
    }
    $.setval(String(now), 'noticeTs');
  } catch (e) { /* 加载失败不影响运行 */ }
}

// ================= UserInfo =================
class UserInfo {
  constructor(user, index) {
    this.index = index;
    this.actId = user.actId || '';
    this.unionId = user.unionId || '';
    this.idenId = user.idenId || '';
    this.userName = user.remark || `账号${index}`;
    this.ckStatus = false;
  }
  async fetch(o) {
    return new Promise(resolve => {
      const opts = { url: o.url, type: o.type || 'post', dataType: 'json', body: o.body };
      $.post(opts.url, opts.body, (err, data) => {
        try { resolve(JSON.parse(data)) } catch (e) { resolve(null) }
      });
    });
  }
  base() { return { actId: this.actId, unionId: this.unionId, idenId: this.idenId } }
  // 签到
  async signIn() {
    const res = await this.fetch({ url: API + '/signIn', body: this.base() });
    const d = res && res.data;
    if (res && res.code == 1000 && d) $.log(`[${this.userName}] ✅签到: +${d.rewardPoints}分, 余额${d.pointsBalance}, 连续${d.consecutiveDays}天, 累计${d.signedDays}/${d.requiredSignedDays || 5}天`);
    else if (res) $.log(`[${this.userName}] ⬜签到: ${res.message || JSON.stringify(res).slice(0, 80)}`);
  }
  // 首页状态; 返回 false=非受邀/风险用户(跳过)
  async getIndexInfo() {
    const res = await this.fetch({ url: API + '/getIndexInfo', body: this.base() });
    const d = res && res.data;
    if (res && res.code == 1000 && d) {
      if (d.riskUser === true || !d.pointsBalance) {
        $.log(`[${this.userName}] ⚠️ 非受邀/风险用户(riskUser=true), 活动不可用, 跳过该账号`);
        return false;
      }
      $.log(`[${this.userName}] 📊签到现金: 状态=${d.actionStatus} 积分=${d.pointsBalance} 已签${d.signedDays}/${d.requiredSignedDays}天 补签卡=${d.availableMakeupCards} 抽奖解锁=${d.drawOpenTime || '-'}`);
      if (d.actionStatus === 'SIGNED') $.log(`[${this.userName}]   (今日已签到)`);
    }
    return true;
  }
  // 任务列表
  async getTaskInfo() {
    const res = await this.fetch({ url: API + '/getTaskInfo', body: this.base() });
    return (res && res.data && res.data.taskList) || [];
  }
  // 完成任务 → 返回 {code, rid}
  async completeTask(taskType) {
    const res = await this.fetch({ url: API + '/completeTask', body: Object.assign({}, this.base(), { taskType }) });
    if (res && res.code == 1000 && res.data) return { code: 1000, rid: res.data };
    return { code: res && res.code, msg: res && res.message };
  }
  // 领取任务奖励
  async claimTaskReward(taskRecordId) {
    const res = await this.fetch({ url: API + '/claimTaskReward', body: Object.assign({}, this.base(), { taskRecordId }) });
    const d = res && res.data;
    if (res && res.code == 1000 && d) $.log(`[${this.userName}] 🎁领奖励: +${d.rewardPoints}分, 余额${d.pointsBalance}`);
    else if (res) $.log(`[${this.userName}] 🎁领奖励: ${res.message || JSON.stringify(res).slice(0, 80)}`);
  }
  // 兑换列表 (is_exchange=true换买得起的; 填prizeId数字如"6167"或"6167,7729"只换指定)
  async getExchangeInfo(doExchange, exVal) {
    const res = await this.fetch({ url: API + '/getExchangeInfo', body: this.base() });
    const d = res && res.data;
    if (res && res.code == 1000 && d) {
      const balance = d.pointsBalance;
      const list = d.prizeList || [];
      $.log(`[${this.userName}] 🛒兑换列表(积分${balance}分, 刷新${d.stockResetTime || ''}):`);
      for (const p of list) {
        $.log(`   id=${p.prizeId} ${p.prizeName} ${p.pointsCost}分 剩${p.remainingStock}${p.redeemed ? '(已兑)' : ''}${p.couldExchange ? ' ✅' : ''}`);
      }
      $.log(`   填 is_exchange=${list.length ? list[0].prizeId : 'x'} 自动兑换指定奖品(多个用逗号: id,id)`);
      if (!doExchange || balance <= 0) return;
      // 用户指定prizeId(数字) → 只换指定; 否则按pointsCost升序换买得起的
      const targetIds = /^d+([,，]d+)*$/.test(exVal) ? exVal.split(/[,，]/).map(Number) : null;
      let can;
      if (targetIds) can = list.filter(p => targetIds.indexOf(p.prizeId) >= 0 && p.remainingStock > 0 && !p.redeemed && p.pointsCost <= balance);
      else can = list.filter(p => p.remainingStock > 0 && !p.redeemed && p.pointsCost <= balance).sort((a, b) => a.pointsCost - b.pointsCost);
      if (!can.length) { $.log(`[${this.userName}] ⬜自动兑换: ${targetIds ? '指定奖品不可兑(积分不足/售罄)' : '无买得起的奖品'}`); return }
      for (const p of can) {
        const r = await this.fetch({ url: API + '/exchangePrize', body: Object.assign({}, this.base(), { prizeId: p.prizeId, pointsCost: p.pointsCost }) });
        if (r && r.code == 1000) { $.log(`[${this.userName}] 🎁兑换成功: ${p.prizeName}(id=${p.prizeId}) -${p.pointsCost}分`); await $.wait(3); }
        else if (r) { $.log(`[${this.userName}] 🎁兑换${p.prizeName}: ${r.message || '失败'}`); break; }
      }
    }
  }
  // 主流程
  async main() {
    try {
      this.ckStatus = true;
      const ok = await this.getIndexInfo(); //非受邀(riskUser) → 跳过
      if (!ok) return;
      await this.signIn();
      await $.wait(3); //任务链延迟(GLOBAL铁律)
      // 任务: 浏览类(BROWSE)自动完成; 分享类(HELP)尝试(实测1009需真实助力)
      const tasks = await this.getTaskInfo();
      for (const t of tasks) {
        if (t.completed) { $.log(`[${this.userName}] 📋 ${t.title}: 已完成(${t.progress}/${t.targetCount})`); continue; }
        if (t.completionMode == 'BROWSE' || t.completionMode == 'DEFAULT') {
          $.log(`[${this.userName}] 📋 任务: ${t.title} +${t.rewardPoints}分 (${t.completionMode})`);
          const r = await this.completeTask(t.type);
          await $.wait(3);
          if (r && r.code == 1000) { await this.claimTaskReward(r.rid); await $.wait(3); }
          else $.log(`[${this.userName}] ⬜ ${t.title}: ${(r && r.msg) || '完成失败'}`);
        } else if (t.completionMode == 'HELP') {
          // 分享助力: completeTask实测返回1009"不可由页面直接完成", 走一次看是否开放
          const r = await this.completeTask(t.type);
          if (r && r.code == 1000) { $.log(`[${this.userName}] 🎉${t.title} 直通成功!`); await this.claimTaskReward(r.rid); await $.wait(3); }
          else $.log(`[${this.userName}] ⬜ ${t.title}: ${(r && r.msg) || '分享助力需好友, 不可自动'}`);
        } else {
          $.log(`[${this.userName}] ⬜ ${t.title}: ${t.completionMode} 不可自动, 跳过`);
        }
      }
      await $.wait(3);
      const exVal = String($.getval('is_exchange', '')).trim(); //is_exchange: true=自动换买得起的 / 填prizeId如"6167,7729"只换指定
      const doExchange = /^(true|1|yes|on|d+([,，]d+)*)$/i.test(exVal);
      await this.getExchangeInfo(doExchange, exVal);
    } catch (e) { $.log(`[${this.userName}][ERROR] ${e}`) }
  }
}

// ================= 抓包入库 =================
function getCookie() {
  try {
    let body = {};
    try { body = $.toObj($request.body) || {} } catch (e) { }
    if (!(body.actId && body.unionId && body.idenId)) {
      try { body = $.toObj(decodeURIComponent(escape(atob($request.body)))) || {} } catch (e) { }
    }
    const actId = body.actId || '';
    const unionId = body.unionId || '';
    const idenId = body.idenId || '';
    if (!(actId && unionId && idenId)) { $.log(`[抓包] body解析失败(len=${String($request.body || '').length})`); $.done(); return }
    const arr = $.getjson(ckName, []);
    const idx = arr.findIndex(e => e.unionId == unionId && e.actId == actId);
    const nd = { actId, unionId, idenId, remark: body.remark || idenId.slice(-8) };
    if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], nd);
    else arr.push(nd);
    $.setjson(arr, ckName);
    $.msg($.name, `🎉账号[${nd.remark}]捕获成功! 共${arr.length}个`, '');
  } catch (e) { $.log(`[抓包][ERROR] ${e}`) }
  $.done();
}

// ================= 入口 =================
$.toObj = (s) => { try { return JSON.parse(s) } catch (e) { return null } };
$.isNode = typeof process !== 'undefined' && !!process.versions && !!process.versions.node;
!(async function () {
  // 抓包入口: request-header / response-body 双模式兼容 (Loon cron时 $request={})
  const isCapture = typeof $request != 'undefined' && $request && typeof $request.url == 'string' && $request.url.indexOf('/activity/signInCash/') >= 0;
  if (isCapture) { getCookie(); return }
  await printDisclaimer(); //远端通知: 必须等待加载完成后才运行业务 (GLOBAL强制)
  const uc = $.getjson(ckName, []);
  $.log(`${$.name}, 开始! 检测到 ${uc.length} 个账号`);
  if (!uc.length) { $.log('请先打开同程旅行小程序-签到现金页抓包'); $.done(); return }
  for (let i = 0; i < uc.length; i++) {
    if (i > 0) await $.wait(5); //账号间延迟
    const user = new UserInfo(uc[i], i + 1);
    await user.main();
  }
  $.log(`${$.name}, 结束!`);
  $.done();
})();
