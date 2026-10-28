/**
 * ============================================================
 *  贴吧去广告·单文件版 v2.3
 *  一个文件 = 重写规则 + 信息流手术脚本(纯重写, 无分流)
 * ============================================================
 *  覆盖: 开屏 / 首页+进吧信息流内嵌广告 / 帖子楼层间广告 /
 *        现金红包浮窗 / 第三方广告联盟(穿山甲/百度联盟/快手/广点通)
 *
 *  使用(共3步):
 *  ① 本文件放入「On My iPhone/Quantumult X/Scripts」目录;
 *  ② 上传本文件到仓库, 仓库 raw 链接添加到 QX → 风车 → 重写 → 引用
 *     (删除旧的 tieba_ad_rewrite.list 引用, 仓库只留这一个文件);
 *  ③ 完成。手术规则指向本地 tieba_feed.js(即本文件)。
 *  签到脚本 tieba_sign.js 及其配置完全不受影响。
 *
 *  原理: QX 加载重写引用时逐行解析, 跳过无法识别的JS代码行,
 *  读取下方规则块中的 hostname 指令与重写规则; script-response-body
 *  规则指向本地本文件, QX 将其作为脚本执行信息流手术。
 *  手术: 广告由服务端混入内容protobuf(实测63KB广告容器, 含ad_id/
 *  afd来源/FC|分类/ad_source_type JSON特征), 递归解析整支剔除,
 *  正常帖子字节级无损; 任何解析异常 → 原样放行(fail-safe)。
 * ============================================================
 */

/* ============ 重写规则块(QX重写引用解析, 逐行读取; JS代码行自动跳过) ============ */
var QX_RULES = `
# MitM 主机名(自动并入)
hostname = tiebac.baidu.com, api-access.pangolin-sdk-toutiao-b.com, afd.baidu.com, afdconf.baidu.com, mbd.baidu.com, nadvideo2.baidu.com, rpe.xdplt.com, cd.xdplt.com, *.ubixioe.com, mssdk.volces.com, p66-ad.adkwai.com, open.e.kuaishou.com, feed-image.baidu.com, sdkquic.e.qq.com

# ── 贴吧自有广告接口(直接拒绝) ──
^https?:\/\/tiebac\.baidu\.com\/c\/f\/ad\/getSplashAd url reject-dict
^https?:\/\/tiebac\.baidu\.com\/c\/f\/ad\/getFeedAd url reject-dict
^https?:\/\/tiebac\.baidu\.com\/c\/b\/ad\/adBid url reject-dict
^https?:\/\/tiebac\.baidu\.com\/c\/s\/adNewLog url reject
^https?:\/\/tiebac\.baidu\.com\/c\/s\/adLog url reject

# ── 内容手术(广告内嵌在内容protobuf里, 由本文件的手术代码剔除) ──
^https?:\/\/tiebac\.baidu\.com\/c\/f\/excellent\/personalized url script-response-body tieba_feed.js
^https?:\/\/tiebac\.baidu\.com\/c\/f\/frs\/[a-z]+ url script-response-body tieba_feed.js
^https?:\/\/tiebac\.baidu\.com\/c\/u\/user\/profile url script-response-body tieba_feed.js
# 右下角浮窗/H5弹窗/广告竞位(配置在 /c/s/sync 的 floating_icon/h5_pop_ups/ad_num_competition)
^https?:\/\/tiebac\.baidu\.com\/c\/s\/sync url script-response-body tieba_feed.js

# ── 第三方广告联盟域名(重写层拒绝, 无需分流) ──
^https?:\/\/api-access\.pangolin-sdk-toutiao-b\.com url reject
^https?:\/\/afd\.baidu\.com url reject
^https?:\/\/afdconf\.baidu\.com url reject
^https?:\/\/mbd\.baidu\.com url reject
^https?:\/\/nadvideo2\.baidu\.com url reject
^https?:\/\/feed-image\.baidu\.com url reject
^https?:\/\/rpe\.xdplt\.com url reject
^https?:\/\/cd\.xdplt\.com url reject
^https?:\/\/[a-z0-9-]+\.ubixioe\.com url reject
^https?:\/\/mssdk\.volces\.com url reject
^https?:\/\/p66-ad\.adkwai\.com url reject
^https?:\/\/open\.e\.kuaishou\.com url reject
^https?:\/\/sdkquic\.e\.qq\.com url reject
`;
(function () {
  'use strict';

  /* ---------- protobuf 最小解析器 ---------- */
  var POW = [1, 128, 16384, 2097152, 268435456, 34359738368];
  function readVarint(b, i) {
    var v = 0;
    for (var k = 0; k < 10; k++) {
      if (i + k >= b.length) return null;
      var x = b[i + k];
      if (k < 6) v += (x & 0x7f) * POW[k];
      if (!(x & 0x80)) return { v: v, next: i + k + 1 };
    }
    return null;
  }
  function parseFields(b) {
    var fs = [], i = 0, n = b.length;
    while (i < n) {
      var rs = i;
      var t = readVarint(b, i);
      if (!t) return null;
      var num = Math.floor(t.v / 8), wire = t.v % 8;
      i = t.next;
      if (num === 0) return null;
      if (wire === 0) { var v = readVarint(b, i); if (!v) return null; fs.push({ num: num, wire: 0, rs: rs, vs: i, ve: v.next }); i = v.next; }
      else if (wire === 1) { if (i + 8 > n) return null; fs.push({ num: num, wire: 1, rs: rs, vs: i, ve: i + 8 }); i += 8; }
      else if (wire === 2) { var L = readVarint(b, i); if (!L || L.v > n || i + (L.next - i) + L.v > n) return null; fs.push({ num: num, wire: 2, rs: rs, vs: L.next, ve: L.next + L.v }); i = L.next + L.v; }
      else if (wire === 5) { if (i + 4 > n) return null; fs.push({ num: num, wire: 5, rs: rs, vs: i, ve: i + 4 }); i += 4; }
      else return null; /* wire 3/4/7: 已废弃类型, 放弃手术保证安全 */
    }
    return fs;
  }

  /* ---------- 广告特征识别(仅统计message的直接字段, 避免误伤深层) ---------- */
  function bytesOf(s) {
    var u = [];
    for (var i = 0; i < s.length; i++) u.push(s.charCodeAt(i));
    return u;
  }
  function startsWith(v, s) {
    if (v.length < s.length) return false;
    for (var i = 0; i < s.length; i++) if (v[i] !== s.charCodeAt(i)) return false;
    return true;
  }
  function contains(v, s) {
    var n = s.length;
    if (v.length < n) return false;
    for (var i = 0; i <= v.length - n; i++) {
      var ok = true;
      for (var j = 0; j < n; j++) { if (v[i + j] !== s.charCodeAt(j)) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }
  function isDigits(v, min, max) {
    if (v.length < min || v.length > max) return false;
    for (var i = 0; i < v.length; i++) if (v[i] < 48 || v[i] > 57) return false;
    return true;
  }
  /* 广告item特征(来自真实抓包): field21='afd'来源, field26='FC|分类', field29=ad JSON,
     field13/14=成对ad_id; 电商广告含 tieba://vendor/ad/ 跳转 */
  function adScore(b) {
    var fs = parseFields(b);
    if (!fs) return -1; /* 非合法message(多为字符串字段) */
    var score = 0, f13 = false, f14 = false;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (f.wire !== 2) continue;
      var v = b.subarray(f.vs, f.ve);
      if (startsWith(v, '{"ad_source_type')) score += 3;
      if (startsWith(v, '{"goods_style')) score += 3;
      if (v.length < 2048 && contains(v, 'tieba://vendor/ad/')) score += 3; /* 仅小值子串搜索, 防止父容器误判 */
      if (startsWith(v, 'FC|')) score += 3;
      if (v.length === 3 && v[0] === 97 && v[1] === 102 && v[2] === 100) score += 2; /* 'afd' */
      if (f.num === 13 && isDigits(v, 11, 16)) f13 = true;
      if (f.num === 14 && isDigits(v, 11, 16)) f14 = true;
    }
    if (f13 && f14) score += 2;
    return score;
  }

  /* ---------- 递归手术: 剔除评分>=3的子message, 逐层修复长度 ---------- */
  function filterMsg(b, depth) {
    if (depth > 6 || b.length < 8) return b;
    var fs = parseFields(b);
    if (!fs) return b;
    var parts = [], changed = false;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      var fEnd = (i + 1 < fs.length) ? fs[i + 1].rs : b.length;
      if (f.wire !== 2) { parts.push(b.subarray(f.rs, fEnd)); continue; }
      var v = b.subarray(f.vs, f.ve);
      var sc = adScore(v);
      if (sc >= 3) { changed = true; continue; } /* 整支剔除广告 */
      var child = (sc === -1) ? v : filterMsg(v, depth + 1);
      if (child === v) { parts.push(b.subarray(f.rs, fEnd)); continue; }
      changed = true;
      var head = encVarint(f.num * 8 + 2).concat(encVarint(child.length));
      var seg = new Uint8Array(head.length + child.length);
      for (var h = 0; h < head.length; h++) seg[h] = head[h];
      seg.set(child, head.length);
      parts.push(seg);
    }
    if (!changed) return b;
    var total = 0, k;
    for (k = 0; k < parts.length; k++) total += parts[k].length;
    var res = new Uint8Array(total), off = 0;
    for (k = 0; k < parts.length; k++) { res.set(parts[k], off); off += parts[k].length; }
    return res;
  }
  function encVarint(v) {
    var out = [];
    do { var b = v % 128; v = Math.floor(v / 128); if (v > 0) b += 128; out.push(b); } while (v > 0);
    return out;
  }

  /* ---------- sync: 右下角浮窗 + H5弹窗 + 广告竞位(JSON手术) ---------- */
  function cleanSync() {
    var body = $response.body;
    if (!body) { $done({}); return; }
    var j;
    try { j = JSON.parse(body); } catch (e) { $done({}); return; }
    var n = 0;
    if (j && j.floating_icon) { delete j.floating_icon; n++; }                    /* 右下角「现金红包」浮窗 */
    if (j && j.h5_pop_ups) { delete j.h5_pop_ups; n++; }                          /* H5弹窗(许愿灯/帖子抽奖) */
    if (j && j.ad_num_competition_frs) { j.ad_num_competition_frs = 0; n++; }     /* 吧内feed广告竞位数 */
    if (j && j.ad_num_competition_personalize) { j.ad_num_competition_personalize = 0; n++; } /* 首页feed广告竞位数 */
    if (n) {
      console.log('[贴吧净化] 已清除 sync 配置: 浮窗/弹窗/广告竞位 共' + n + '项');
      $done({ body: JSON.stringify(j) });
      return;
    }
    $done({});
  }
  /* ---------- profile: 现金红包浮窗(JSON手术) ---------- */
  function cleanProfile() {
    var body = $response.body;
    if (!body) { $done({}); return; }
    var j;
    try { j = JSON.parse(body); } catch (e) { $done({}); return; }
    if (j && Array.isArray(j.zone_info)) {
      var zi = j.zone_info.filter(function (x) { return !(x && x.type === 'commerce'); });
      if (zi.length !== j.zone_info.length) {
        console.log('[贴吧净化] 已移除「现金红包」推广位(commerce zone) ' + (j.zone_info.length - zi.length) + '项');
        j.zone_info = zi;
        $done({ body: JSON.stringify(j) });
        return;
      }
    }
    $done({});
  }

  /* ---------- 信息流: protobuf手术 ---------- */
  function cleanFeed() {
    if (!$response.bodyBytes) { $done({}); return; }
    var u8 = new Uint8Array($response.bodyBytes);
    var out = filterMsg(u8, 0);
    if (!out || out === u8) { $done({}); return; } /* 无广告或解析失败 → 原样放行 */
    console.log('[贴吧净化] 信息流广告已剔除: ' + u8.length + 'B → ' + out.length + 'B');
    $done({ bodyBytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) });
  }

  /* ---------- 入口分发 ---------- */
  if (typeof $response === 'undefined') { $done({}); return; }
  var reqUrl = String($request.url || '');
  try {
    if (/\/c\/u\/user\/profile/.test(reqUrl)) { cleanProfile(); return; }
    if (/\/c\/s\/sync/.test(reqUrl)) { cleanSync(); return; }
    if (/\/c\/f\/(excellent\/personalized|frs\/[a-z]+)/.test(reqUrl)) { cleanFeed(); return; }
  } catch (e) {
    console.log('[贴吧净化] 异常放行: ' + String((e && e.message) || e));
  }
  $done({});
})();
