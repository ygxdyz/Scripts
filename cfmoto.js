/*
new Env('春风摩托');
@Date: 2026-10-10

@Description:
春风摩托 每日签到、会员任务、疯狂星期五自动抽奖，积分可兑换实物
积分显示已修复：当前积分为可用积分(自动扣除已使用/已过期部分)，并提示即将过期积分

获取 Cookie 方式：cfmoto app - 我的

[rewrite_local]
# 获取 Cookie
^https:\/\/c\.cfmoto\.com\/jv\/user\/user_info url script-response-body https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/cfmoto.js, requires-body=true, tag=春风摩托Cookie

# 开屏广告
^https:\/\/c\.cfmoto\.com\/cfmotoservermall\/app\/ad$ url reject-dict

# 弹窗广告
^https:\/\/c\.cfmoto\.com\/cfmotoservermall\/app\/popwindow url reject-dict

[mitm]
hostname = c.cfmoto.com

 */

// env.js 全局
const $ = new Env("春风摩托");
const ckName = "cfmoto_data";
//-------------------- 一般不动变量区域 -------------------------------------
const Notify = 1;//0为关闭通知,1为打开通知,默认为1
const notify = $.isNode() ? require('./sendNotify') : '';
let envSplitor = ["@"]; //多账号分隔符
var userCookie = ($.isNode() ? process.env[ckName] : $.getdata(ckName)) || '';
let userList = [];
let userIdx = 0;
let userCount = 0;

// 调试
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
// 为多用户准备的通知数组
$.notifyList = [];
// 为通知准备的空数组
$.notifyMsg = [];

//---------------------- 疯狂星期五抽奖: H5接口签名工具 ----------------------
// Cfmoto-X-Sign = MD5(SHA1(query+body+appId&nonce&timestamp+appSecret))
// appId/appSecret 为春风H5网页公开JS包中的客户端常量(任何人都可从其官网下载, 非用户隐私, 仅用于周五抽奖请求签名)
const CfmotoCfg = {
  appId: "xFcWmLnA",
  appSecret: "d8a46a5e344327e83b5334f6d1102bbe363579d2"
};
function strToUtf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return bytes;
}
function toHexStr(num) {
  let s = (num >>> 0).toString(16);
  while (s.length < 8) s = '0' + s;
  return s;
}
function rotl(n, s) { return ((n << s) | (n >>> (32 - s))) >>> 0; }
function sha1Hex(input) {
  const msg = strToUtf8Bytes(input);
  const bitLen = msg.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  msg.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Array(80);
  for (let i = 0; i < msg.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = ((msg[i + j * 4] << 24) | (msg[i + j * 4 + 1] << 16) | (msg[i + j * 4 + 2] << 8) | msg[i + j * 4 + 3]) >>> 0;
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const t = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return toHexStr(h0) + toHexStr(h1) + toHexStr(h2) + toHexStr(h3) + toHexStr(h4);
}
function md5Hex(input) {
  function addMod32(a, b) { return (a + b) >>> 0; }
  function cmn(q, a, b, x, s, t) { return addMod32(rotl(addMod32(addMod32(a, q), addMod32(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  const msg = strToUtf8Bytes(input);
  const bitLen = msg.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  msg.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  const S = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
  const K = [];
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  const shifts = [...S[0], ...S[1], ...S[2], ...S[3]];
  for (let i = 0; i < msg.length; i += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) M.push(((msg[i + j * 4] << 24) | (msg[i + j * 4 + 1] << 16) | (msg[i + j * 4 + 2] << 8) | msg[i + j * 4 + 3]) >>> 0);
    const aa = a, bb = b, cc = c, dd = d;
    for (let j = 0; j < 64; j++) {
      let F, g;
      if (j < 16) { F = (b & c) | (~b & d); g = j; }
      else if (j < 32) { F = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
      else if (j < 48) { F = b ^ c ^ d; g = (3 * j + 5) % 16; }
      else { F = c ^ (b | ~d); g = (7 * j) % 16; }
      F = addMod32(addMod32(addMod32(F, a), K[j]), M[g]);
      a = d; d = c; c = b;
      b = addMod32(b, rotl(F, shifts[j]));
    }
    a = addMod32(a, aa); b = addMod32(b, bb); c = addMod32(c, cc); d = addMod32(d, dd);
  }
  return toHexStr(a) + toHexStr(b) + toHexStr(c) + toHexStr(d);
}
function genNonce() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
// 构造H5活动接口所需请求头
function buildCfmotoHeaders(ticket, query, bodyStr, referer, extraHeaders) {
  const nonce = genNonce();
  const timestamp = Date.now();
  const payload = `${query}${bodyStr}appId=${CfmotoCfg.appId}&nonce=${nonce}&timestamp=${timestamp}${CfmotoCfg.appSecret}`;
  const sign = md5Hex(sha1Hex(payload));
  return {
    ...(extraHeaders || {}),
    "Authorization": ticket || '',
    "applet-token": ticket || '',
    "Cfmoto-X-Sign": sign,
    "Cfmoto-X-Sign-Type": "0",
    "Cfmoto-X-Param": `appId=${CfmotoCfg.appId}&nonce=${nonce}&timestamp=${timestamp}`,
    "Origin": "https://c.cfmoto.com",
    ...(referer ? { "Referer": referer } : {})
  };
}

//---------------------- 自定义变量区域 -----------------------------------
//脚本入口函数main()
async function main() {
  try {
    $.log('\n================== 任务 ==================\n');
    for (let user of userList) {
      console.log(`🔷账号${user.index} >> Start work`)
      console.log(`随机延迟${user.getRandomTime()}ms`);
      // 签到
      const integral = await user.signin();
      if (user.ckStatus) {
        let count = 0;
        if (integral !== null) {
          // ---- 今日首次运行: 执行全部每日任务 ----
          await $.wait(user.getRandomTime());
          // 查看签到记录
          const {count: signCount, prize} = (await user.getSignRecord()) || {};
          count = signCount || 0;
          await $.wait(user.getRandomTime());
          if (prize) {
            // 盲盒抽奖
            await user.lottery()
            await $.wait(user.getRandomTime());
          }
          // 限时抽奖
          await user.getLotteryList()
          await $.wait(user.getRandomTime());

          for (let i = 0; i < 3; i++) {
            // 创建帖子
            const postId = await user.createArticle()
            await $.wait(user.getRandomTime());
            // 评论帖子
            await user.postComments(postId)
            await $.wait(user.getRandomTime());
            // 点赞
            await user.thumbsUp(postId)
            await $.wait(user.getRandomTime());
            // 分享帖子
            await user.share(postId)
            await $.wait(user.getRandomTime());
            // 删除帖子
            await user.deletePost(postId)
            await $.wait(user.getRandomTime());
          }
        } else {
          // ---- 今日任务已完成(周五抽奖补跑等重复运行): 跳过每日任务, 仅执行抽奖与查询 ----
          $.log(`✅ 今日任务已完成，跳过每日任务，仅执行周五抽奖`);
          const record = await user.getSignRecord();
          count = record?.count || 0;
        }
        // 疯狂星期五抽奖(活动期间任意一次运行都会自动尝试)
        await $.wait(user.getRandomTime());
        const lotteryPrize = await user.fridayLottery();
        // 查询最新积分: 可用积分(自动扣除已使用/已过期), 累计积分, 即将过期积分
        await $.wait(user.getRandomTime());
        const points = await user.getSignInfo();
        if (integral !== null) {
          $.title = `本次运行共获得${(integral + 36)}积分${lotteryPrize ? `,抽奖${lotteryPrize}` : ''}`;
        } else {
          $.title = lotteryPrize ? `周五抽奖:${lotteryPrize}` : `今日任务已完成`;
        }
        let pointMsg = `「${user.userName}」当前积分(可用):${points?.available ?? '查询失败'}分,累计积分:${points?.total ?? '?'}分,累计签到:${count}天`;
        if (points?.overdue > 0) pointMsg += `\n⚠️ ${points.overdueText || `截止月底有${points.overdue}积分即将过期,请及时使用`}`;
        DoubleLog(pointMsg);
      } else {
        //将ck过期消息存入消息数组
        $.notifyMsg.push(`❌账号${user.userName || user.index} >> Check ck error!`)
      }
      //账号通知
      $.notifyList.push({ "id": user.index, "avatar": user.avatar, "message": $.notifyMsg });
      //清空数组
      $.notifyMsg = [];
    }
  } catch (e) {
    $.log(`⛔️ main run error => ${e}`);
    throw new Error(`⛔️ main run error => ${e}`);
  }
}


class UserInfo {
  constructor(user) {
    //默认属性
    this.index = ++userIdx;
    this.token = user.token || user;
    this.userId = user.userId;
    this.userName = user.userName;
    this.avatar = user.avatar;
    this.ckStatus = true;
    //从Cookie中提取ticket(用于H5活动接口鉴权)
    this.ticket = (String(this.token).match(/ticket=([^;]+)/) || [])[1] || '';
    //请求封装
    this.baseUrl = ``;
    this.host = "https://c.cfmoto.com";
    this.headers = {
      "Cookie": this.token,
      "User-Agent": "'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 cfmoto/1.0.0"
    }
    this.getRandomTime = () => randomInt(1e3, 3e3);
    this.fetch = async (o) => {
      try {
        if (typeof o === 'string') o = { url: o };
        if (o?.url?.startsWith("/")) o.url = this.host + o.url
        const res = await Request({ ...o, headers: o.headers || this.headers, url: o.url || this.baseUrl })
        debug(res, o?.url?.replace(/\/+$/, '').substring(o?.url?.lastIndexOf('/') + 1));
        if (res?.code == 40001) throw new Error(res?.message || `用户需要去登录`);
        return res;
      } catch (e) {
        this.ckStatus = false;
        $.log(`⛔️ 请求发起失败！${e}`);
      }
    }
  }
  //签到
  async signin() {
    try {
      const opts = {
        url: this.host + "/cfmotoservermall/app/integral/task/complete/v1",
        method: "put",
        headers: {
          "Cookie": this.token,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 cfmoto/1.0.0",
          "Content-Type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify({
          completeStatu: 1,
          taskDetail: 8
        })
      }
      let res = await new Promise((resolve, reject) => {
        $.http['post'](opts)
          .then((response) => {
            var resp = response.body;
            try {
              resp = $.toObj(resp) || resp;
            } catch (e) { }
            resolve(resp);
          })
          .catch((err) => reject(err));
      });
      if (res.code == 0) {
        $.log(`✅ 签到任务: 已完成`);
        const point = parseInt(res.data)
        return point
      } else {
        $.log(`✅ 签到任务: 今日已签到`);
        return null
      }
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 签到失败! ${e}`);
    }
  }
  // 开启盲盒
  async lottery() {
    try {
      const opts = {
        url: `/cfmotoservermall/app/user/prize/sign`,
        type: "post",
        dataType: "json",
        body: {}
      }
      let res = await this.fetch(opts);
      if(res?.code == 0) {
        const prizeSignName = res?.data?.prizeSignName
        $.log(`✅ 盲盒抽奖获得: ${prizeSignName}`);
      }else{
        $.log(`⛔️ 盲盒抽奖失败! ${res?.msg}`);
      }
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 盲盒抽奖失败! ${e}`);
    }
  }
  // 创建帖子
  async createArticle() {
    try {
      const opts = {
        url: `/jv/bbs/post/create-v5/`,
        type: "post",
        dataType: "json",
        body: {
          share_content: "",
          media_type: "TEXT",
          longitude: "0.000000",
          latitude: "0.000000",
          share_type: "",
          share_title: "",
          address: "",
          share_product_type: "",
          share_whether_journey: "",
          share_image: "",
          city_code: "",
          is_vote: false,
          content: "加油"
        }
      }
      let res = await this.fetch(opts);
      const postId = res.data.id
      $.log(`✅ 创建帖子： ${postId}`);
      return postId
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 创建帖子失败! ${e}`);
    }
  }
  // 评论帖子
  async postComments(postId) {
    try {
      const opts = {
        url: `/jv/bbs/article/comment-v1/`,
        type: "post",
        dataType: "json",
        body: {
          post_id: postId,
          content: "666"
        }
      }
      await this.fetch(opts);
      $.log(`✅ 评论帖子： ${postId}`)
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 评论帖子失败! ${e}`);
    }
  }
  // 点赞帖子
  async thumbsUp(postId) {
    try {
      const opts = {
        url: `/jv/bbs/post/thumbs_up/${postId}`,
        type: "post",
        dataType: "json",
        body: {}
      }
      await this.fetch(opts);
      $.log(`✅ 点赞帖子： ${postId}`)
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 点赞帖子失败! ${e}`);
    }
  }
  // 删除帖子
  async deletePost(postId) {
    try {
      const opts = {
        url: this.host + "/jv/bbs/post/?id=" + postId,
        method: "delete",
        headers: {
          "Cookie": this.token,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 cfmoto/1.0.0",
          "Content-Type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify({})
      }
      await new Promise((resolve, reject) => {
        $.http['post'](opts)
          .then((response) => {
            var resp = response.body;
            try {
              resp = $.toObj(resp) || resp;
            } catch (e) { }
            resolve(resp);
          })
          .catch((err) => reject(err));
      });
      $.log(`✅ 删除帖子： ${postId}`)
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 删除帖子失败! ${e}`);
    }
  }
  // 分享帖子
  async share(postId) {
    try {
      const opts = {
        url: this.host + "/cfmotoservermall/app/integral/task/complete",
        method: "put",
        headers: {
          "Cookie": this.token,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 cfmoto/1.0.0",
          "Content-Type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify({
          completeStatu: 1,
          taskDetail: 13
        })
      }
      await new Promise((resolve, reject) => {
        $.http['post'](opts)
          .then((response) => {
            var resp = response.body;
            try {
              resp = $.toObj(resp) || resp;
            } catch (e) { }
            resolve(resp);
          })
          .catch((err) => reject(err));
      });
      $.log(`✅ 分享帖子： ${postId}`)
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 分享失败! ${e}`);
    }
  }
  // 查询用户积分信息
  // 修复: integralTotal为累计总积分(不扣除已使用/已过期), integralDisposable为当前可用积分
  async getSignInfo() {
    try {
      const opts = {
        url: `/cfmotoservermall/app/user/integral/current/user/info`,
        type: "get",
        dataType: "json"
      }
      let res = await this.fetch(opts);
      if (res?.code == 0 && res?.data) {
        return {
          available: res.data.integralDisposable, // 可用积分(自动扣除已使用/已过期)
          total: res.data.integralTotal,          // 累计积分
          overdue: res.data.overdueIntegral || 0, // 即将过期积分
          overdueText: res.data.overdueIntegralCopywriting || ''
        }
      }
      return null
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 查询用户信息失败! ${e}`);
    }
  }
  // 疯狂星期五抽奖: 获取弹窗活动入口(每周五更新, 活动id动态获取)
  async getActivityEntry() {
    try {
      let res = await this.fetch({
        url: `/cfmotoservermall/app/popwindow`,
        type: "get",
        params: { position: 0 },
        dataType: "json"
      });
      if (res?.code == 0 && res?.data) {
        const forwardInfo = res.data.forwardInfo || '';
        if (forwardInfo.includes('activity-magicbox')) {
          const idMatch = forwardInfo.match(/[?&]id=(\d+)/);
          if (idMatch) return { id: idMatch[1], referer: forwardInfo, title: res.data.title };
        }
      }
      return null;
    } catch (e) {
      $.log(`⛔️ 查询弹窗活动失败! ${e}`);
      return null;
    }
  }
  // 查询活动详情(抽奖剩余次数/活动时间/已获奖品)
  async getActivityInfo(id) {
    try {
      const headers = buildCfmotoHeaders(this.ticket, `id=${id}`, '', '');
      let res = await this.fetch({
        url: `/cfmotoservermall/app/activity/HomePage`,
        type: "get",
        params: { id: String(id) },
        dataType: "json",
        headers: { ...this.headers, ...headers }
      });
      if (res?.code == 0 && res?.data) return res.data;
      $.log(`⛔️ 查询活动详情失败! ${res?.msg || '未知错误'}`);
      return null;
    } catch (e) {
      $.log(`⛔️ 查询活动详情失败! ${e}`);
      return null;
    }
  }
  // 执行H5活动抽奖
  async activityDraw(id, referer) {
    try {
      const bodyObj = { activityEntryDetailId: String(id) };
      const bodyStr = JSON.stringify(bodyObj);
      const headers = buildCfmotoHeaders(this.ticket, '', bodyStr, referer);
      let res = await this.fetch({
        url: `/cfmotoservermall/app/activity/lottery`,
        type: "post",
        dataType: "json",
        headers: { ...this.headers, ...headers },
        body: bodyObj
      });
      if (res?.code == 0 && res?.data) return { ok: true, ...res.data };
      return { ok: false, msg: res?.msg || '未知错误' };
    } catch (e) {
      return { ok: false, msg: e };
    }
  }
  // 疯狂星期五自动抽奖主流程
  async fridayLottery() {
    try {
      // 1. 获取本周活动入口
      const entry = await this.getActivityEntry();
      if (!entry) {
        $.log(`✅ 当前无弹窗抽奖活动(疯狂星期五为每周五10:00~23:59)`);
        return '';
      }
      const { id, referer } = entry;
      // 2. 查询活动详情
      await $.wait(this.getRandomTime());
      const info = await this.getActivityInfo(id);
      if (!info) return '';
      const detail = info.activityEntryDetailVO || {};
      const actName = detail.activityEntryName || entry.title || '疯狂星期五';
      // 3. 校验活动时间窗口
      const now = Date.now();
      const start = (detail.activityStartTime || '').replace(' ', 'T');
      const end = (detail.activityEndTime || '').replace(' ', 'T');
      if (start && now < new Date(start).getTime()) {
        $.log(`⏳「${actName}」今日${detail.activityStartTime}开始, 请活动开始后再运行(建议添加周五晚间定时任务)`);
        return '';
      }
      if (end && now > new Date(end).getTime()) {
        $.log(`✅「${actName}」本期活动已结束`);
        return '';
      }
      // 4. 校验剩余抽奖次数
      const remaining = Number(info.remainingCount || 0);
      if (remaining <= 0) {
        const drawn = (info.activityActorsList || []).map(a => a.lotteryName).filter(Boolean).join('、');
        $.log(`✅「${actName}」本期已抽过${drawn ? `,获得「${drawn}」` : ''}`);
        return '';
      }
      // 5. 执行抽奖(按剩余次数, 最多5次)
      const prizes = [];
      let drew = 0;
      const times = Math.min(remaining, 5);
      for (let i = 0; i < times; i++) {
        await $.wait(this.getRandomTime());
        const drawRes = await this.activityDraw(id, referer);
        if (drawRes.ok) {
          drew++;
          const prizeName = drawRes.lotteryName || '未知奖品';
          const prizeType = drawRes.lotteryType || '';
          if (prizeType === 'participate') {
            DoubleLog(`🎰「${this.userName}」${actName}抽奖: 未中奖(谢谢参与)`);
          } else {
            prizes.push(prizeName);
            DoubleLog(`🎰「${this.userName}」${actName}抽奖: 获得「${prizeName}」`);
            if (prizeType === 'real') {
              DoubleLog(`🎁 实物奖品请在5天内于App内提交收件地址, 逾期视为弃奖!`);
            }
          }
        } else {
          DoubleLog(`⛔️「${this.userName}」抽奖失败: ${drawRes.msg}`);
          break;
        }
      }
      return prizes.length ? prizes.join('、') : (drew > 0 ? '谢谢参与' : '');
    } catch (e) {
      $.log(`⛔️ 周五抽奖失败! ${e}`);
      return '';
    }
  }
  // 查询签到记录
  async getSignRecord() {
    try {
      const opts = {
        url: `/cfmotoservermall/app/integral/task/signinlist/v1`,
        type: "get",
        params: {
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1
        },
        dataType: "json"
      }
      let res = await this.fetch(opts);
      if (res.code == 0) {
        const count = res?.data?.count
        const prize = res?.data?.prize
        $.log(prize ? `✅ 满足盲盒抽奖条件` : `✅ 未满足盲盒抽奖条件`)
        return {count, prize}
      }
      return null
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 查询签到记录失败! ${e}`);
    }
  }
  // 获取限时抽奖活动列表
  async getLotteryList() {
    try {
      const opts = {
        url: `/jv/bbs/lottery/listgoing/`,
        type: "get",
        params: {},
        dataType: "json"
      }
      let res = await this.fetch(opts);
      if (res.code == 0) {
        const list = res?.data?.list
        if(list && list.length) {
          for(let item of list) {
            if(item.lottery_status_name === "进行中") {
              $.log(`✅ 开始参与限时抽奖活动`)
              await this.getLotteryDetail(item.id)
            }
          }
          if(list[list.length - 1].lottery_status_name !== '进行中') {
            $.log(`✅ 当前无限时抽奖活动`)
          }
        } else {
          $.log(`✅ 当前无限时抽奖活动`)
        }
      }
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 查询限时抽奖活动列表失败! ${e}`);
    }
  }
  // 获取限时抽奖活动详情
  async getLotteryDetail(id) {
    try {
      const opts = {
        url: `/jv/bbs/lottery/${id}/detail/`,
        type: "get",
        params: {},
        dataType: "json"
      }
      let res = await this.fetch(opts);
      if (res.code == 0) {
        const tickitList = res?.data?.lottery_user_ticket_list
        if(!tickitList) {
          await this.lotteryApply(id)
        }
        await this.lotteryShare(id)
      }
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 查询限时抽奖活动详情失败! ${e}`);
    }
  }
  // 报名限时抽奖活动
  async lotteryApply(id) {
    try {
      const opts = {
        url: `/jv/bbs/lottery/${id}/apply/`,
        type: "get",
        params: {},
        dataType: "json"
      }
      let res = await this.fetch(opts);
      if (res.code == 0) {
        $.log(`✅ 报名限时抽奖活动成功!`)
      }
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 报名限时抽奖活动失败! ${e}`);
    }
  }
  // 报名限时抽奖活动
  async lotteryShare(id) {
    try {
      const opts = {
        url: `/jv/bbs/lottery/${id}/share/`,
        type: "get",
        params: {},
        dataType: "json"
      }
      let res = await this.fetch(opts);
      if (res.code == 0) {
        $.log(`✅ 分享限时抽奖活动成功!`)
      }
    } catch (e) {
      this.ckStatus = false;
      $.log(`⛔️ 分享限时抽奖活动失败! ${e}`);
    }
  }
}
async function getCookie() {
  if ($request && $request.method === 'OPTIONS') return;

  const header = ObjectKeys2LowerCase($request.headers);
  const cookie = header.cookie;
  const body = $.toObj($response.body);
  if (!(body?.data)) {
    $.msg($.name, `❌获取Cookie失败!`, "")
    return;
  }

  const { id, nickname, photo } = body?.data;
  const newData = {
    "userId": id,
    "avatar": photo,
    "token": cookie,
    "userName": nickname,
  }

  userCookie = userCookie ? JSON.parse(userCookie) : [];
  const index = userCookie.findIndex(e => e.userId == newData.userId);

  userCookie[index] ? userCookie[index] = newData : userCookie.push(newData);

  $.setjson(userCookie, ckName);
  $.msg($.name, `🎉${newData.userName}更新token成功!`, ``);
}
//-------------------------- 辅助函数区域 -----------------------------------
//请求二次封装
async function Request(o) {
  if (typeof o === 'string') o = { url: o };
  try {
    if (!o?.url) throw new Error('[发送请求] 缺少 url 参数');
    // type => 因为env中使用method处理post的特殊请求(put/delete/patch), 所以这里使用type
    let { url: u, type, headers = {}, body: b, params, dataType = 'form', resultType = 'data' } = o;
    // post请求需要处理params参数(get不需要, env已经处理)
    const method = type ? type?.toLowerCase() : ('body' in o ? 'post' : 'get');
    const url = u.concat(method === 'post' ? '?' + $.queryStr(params) : '');

    const timeout = o.timeout ? ($.isSurge() ? o.timeout / 1e3 : o.timeout) : 1e4
    // 根据jsonType处理headers
    if (dataType === 'json') headers['Content-Type'] = 'application/json;charset=UTF-8';
    // post请求处理body
    const body = b && dataType == 'form' ? $.queryStr(b) : $.toStr(b);
    const request = { ...o, ...(o?.opts ? o.opts : {}), url, headers, ...(method === 'post' && { body }), ...(method === 'get' && params && { params }), timeout: timeout }
    const httpPromise = $.http[method.toLowerCase()](request)
      .then(response => resultType == 'data' ? ($.toObj(response.body) || response.body) : ($.toObj(response) || response))
      .catch(err => $.log(`❌请求发起失败！原因为：${err}`));
    // 使用Promise.race来强行加入超时处理
    return Promise.race([
      new Promise((_, e) => setTimeout(() => e('当前请求已超时'), timeout)),
      httpPromise
    ]);
  } catch (e) {
    console.log(`❌请求发起失败！原因为：${e}`);
  }
};
//生成随机数
function randomInt(n, r) {
  return Math.round(Math.random() * (r - n) + n)
};
//控制台打印
function DoubleLog(data) {
  if (data && $.isNode()) {
    console.log(`${data}`);
    $.notifyMsg.push(`${data}`)
  } else if (data) {
    console.log(`${data}`);
    $.notifyMsg.push(`${data}`)
  }
};
//调试
function debug(t, l = 'debug') {
  if ($.is_debug === 'true') {
    $.log(`\n-----------${l}------------\n`);
    $.log(typeof t == "string" ? t : $.toStr(t) || `debug error => t=${t}`);
    $.log(`\n-----------${l}------------\n`)
  }
};
//对多账号通知进行兼容
async function SendMsgList(l) {
  await Promise.allSettled(l?.map(u => SendMsg(u.message.join('\n'), u.avatar)));
};
//账号通知
async function SendMsg(n, o) {
  n && (0 < Notify ? $.isNode() ? await notify.sendNotify($.name, n) : $.msg($.name, $.title || "", n, {
    "media-url": o
  }) : console.log(n))
};
//将请求头转换为小写
function ObjectKeys2LowerCase(obj) { return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) }
//---------------------- 主程序执行入口 -----------------------------------
!(async () => {
  if (typeof $request != "undefined") {
    await getCookie();
  } else {
    const e = envSplitor.find(o => userCookie.includes(o)) || envSplitor[0];
    userCookie = $.toObj(userCookie) || userCookie.split(e);

    userList.push(...userCookie.map(n => new UserInfo(n)).filter(Boolean));

    userCount = userList.length;
    console.log(`共找到${userCount}个账号`);
    if (userList.length > 0) await main();
  }
})()
  .catch(e => $.notifyMsg.push(e.message || e))
  .finally(async () => {
    await SendMsgList($.notifyList);
    $.done({ ok: 1 });
  });
/** ---------------------------------固定不动区域----------------------------------------- */
// prettier-ignore
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: r, statusCode: a, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: r, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: r, response: a } = t; e(r, a, a && s.decode(a.rawBody, this.encoding)) })) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let r = require("iconv-lite"); this.initGotEnv(t); const { url: a, ...i } = t; this.got[s](a, i).then((t => { const { statusCode: s, statusCode: a, headers: i, rawBody: o } = t, n = r.decode(o, this.encoding); e(null, { status: s, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: s, response: a } = t; e(s, a, a && r.decode(a.rawBody, this.encoding)) })) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
