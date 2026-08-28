/*
 * 台铃每日签到 - Quantumult X 版本（含通知中心）
 *
 * 限制：QX 无 RSA/AES 加密能力，/v8/auth/login 必须放弃
 * 妥协：Bearer token 由用户抓包获取，存 BoxJs 持久化
 * 触发：iOS 微信打开台铃小程序（rewrite 拦截 servicewechat.com）
 * 通知：签到完成后弹 1 条结果到 QX 通知中心
 *
 * BoxJs 配置：
 *   tlg_token        Bearer token（不含 "Bearer " 前缀）
 *   plusplus_token   PushPlus token（可选，留空=不推送）
 */

const $ = new Env()

// ========== BoxJs 读取配置 ==========
const TLG_TOKEN = $.read("tlg_token") || ""
const PUSH_TOKEN = $.read("plusplus_token") || ""

// ========== 常量 ==========
const BASE = "https://www.tailgdd.com"
const APPID = "wx58780772f47ac08c"
const CLIENT_ID = "63baf6871f7aee49dbe800e7672b2bec"
const ICON_OK = "✅"
const ICON_FAIL = "❌"
const ICON_WARN = "⚠️"
const ICON_INFO = "ℹ️"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf2541c37) XWEB/25364",
  "Content-Type": "application/json",
  "Accept": "*/*",
  "xweb_xhr": "1",
  "Referer": `https://servicewechat.com/${APPID}/7/page-frame.html`,
  "Accept-Language": "zh-CN,zh;q=0.9"
}

const SOCIAL_HEADERS = { ...HEADERS, clientid: CLIENT_ID, "client-origin": "h5" }

const TASK_NAME = {
  like_comment_trend: "每日点赞",
  trend_share: "每日分享",
  social_view: "社区浏览",
  product_view: "商品浏览",
  product_add_cart: "商品加购"
}

// ========== 状态 ==========
let log = []
let successCount = 0
let failCount = 0
let tokenExpired = false
let totalAward = 0

// ========== 工具 ==========
function pad(s) { return s < 10 ? "0" + s : "" + s }
function nowStr() {
  const d = new Date()
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
}
function today() {
  const d = new Date()
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
}
function monthStart() { return today().substring(0, 7) + "-01" }
function mask(s) { return (!s || s.length <= 12) ? s : s.substring(0, 6) + "..." + s.substring(s.length - 6) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function logLine(icon, msg) {
  const line = `${icon} ${msg}`
  console.log(line)
  log.push(line)
}

// ========== HTTP ==========
async function http(method, url, body) {
  const opts = {
    url,
    method,
    headers: { ...HEADERS, authorization: "Bearer " + TLG_TOKEN }
  }
  if (body) opts.body = JSON.stringify(body)
  return await $.http[method.toLowerCase()](opts).then(r => {
    try { return JSON.parse(r.body) }
    catch { return { code: -1, msg: (r.body || "").substring(0, 300) } }
  })
}

async function socialGet(url) {
  return await $.http.get({
    url,
    headers: { ...SOCIAL_HEADERS, authorization: "Bearer " + TLG_TOKEN }
  }).then(r => {
    try { return JSON.parse(r.body) }
    catch { return { code: -1, msg: (r.body || "").substring(0, 300) } }
  })
}

// ========== 推送 ==========
async function pushPlus(title, content) {
  if (!PUSH_TOKEN) return logLine(ICON_WARN, "未配置 PushPlus，跳过推送")
  try {
    await $.http.post({
      url: "https://www.pushplus.plus/send",
      body: JSON.stringify({ token: PUSH_TOKEN, title, content, template: "txt" })
    })
    logLine(ICON_OK, "PushPlus 推送完成")
  } catch (e) {
    logLine(ICON_FAIL, `PushPlus 推送失败: ${e}`)
  }
}

// ========== 业务 ==========
async function checkTokenAlive() {
  const r = await http("POST", `${BASE}/v8/auth/user/info`, {})
  return r && (r.code === 200 || r.code === 0)
}

async function doSign() {
  const signDate = today()
  const status = await http("POST", `${BASE}/v1/api/shop/app/integral/sign/verifySign`, { signDate })
  if (status.code !== 0) {
    failCount++
    return logLine(ICON_FAIL, `查询签到失败: ${status.msg}`)
  }
  if (status.data) {
    logLine(ICON_OK, `今天 (${signDate}) 已签到`)
    return
  }
  const sign = await http("POST", `${BASE}/v1/api/shop/app/integral/sign/saveIntegralSignIn`, {})
  if (sign.code === 0 && sign.success) {
    successCount++
    const award = (sign.data || {}).award_num || 0
    totalAward += award
    logLine(ICON_OK, `签到成功 +${award} ${(sign.data || {}).awardName || "积分"}`)
  } else {
    failCount++
    logLine(ICON_FAIL, `签到失败: ${sign.msg}`)
  }
}

async function getSignInfo() {
  const r = await http("POST", `${BASE}/v1/api/shop/app/integral/sign/getSign`, {
    signDate: today(),
    signMonthDate: monthStart()
  })
  if (r.code === 0) {
    const data = r.data || {}
    const list = data.signList || []
    const signed = list.filter(x => x.isSign === "1").length
    logLine("📊", `本周期已签 ${signed} 天，累计 ${data.signDay || 0} 天`)
  } else {
    logLine(ICON_WARN, `签到信息失败: ${r.msg}`)
  }
}

async function getReward() {
  const r = await http("POST", `${BASE}/v1/api/shop/app/integral/sign/getProceedSignReward`, { signDate: today() })
  if (r.code === 0) {
    const items = ((r.data || {}).result) || []
    items.forEach(it => {
      const status = it.isGift ? "已领取" : (it.cycleStatus ? "已达成" : `还差${it.remain}天`)
      logLine("🎁", `连签${it.signDay}天: ${status}`)
    })
  } else {
    logLine(ICON_WARN, `奖励查询失败: ${r.msg}`)
  }
}

async function listTasks() {
  const r = await http("POST", `${BASE}/v1/api/shop/app/integral/user/listUserIntegralTask`, { taskType: "1" })
  if (r.code === 0) return r.data || []
  logLine(ICON_FAIL, `任务列表失败: ${r.msg}`)
  return []
}

async function getTrends() {
  const r = await socialGet(`${BASE}/v8/social/app/trends/recommend/list?pageNum=1&pageSize=10`)
  if (r.code === 200) return (r.rows || []).map(x => String(x.id)).filter(Boolean)
  return []
}

async function doLike(tid) {
  const r = await socialGet(`${BASE}/v8/social/app/trends/like?trendsId=${tid}&isLike=1`)
  if (r.code === 200) {
    const a = (r.data || {}).awardNum || 0
    totalAward += a
    logLine(ICON_OK, `点赞 +${a}积分`)
    return true
  }
  return false
}

async function doShare(tid) {
  const r = await socialGet(`${BASE}/v8/social/app/trends/share?trendsId=${tid}`)
  if (r.code === 200) {
    const a = (((r.data || {}).dailyIntegralTask) || {}).awardNum || 0
    totalAward += a
    logLine(ICON_OK, `分享 +${a}积分`)
    return true
  }
  return false
}

async function drawAward(eventCode) {
  const r = await http("POST", `${BASE}/v1/api/shop/app/integral/user/drawEventAward`, { taskType: 1, eventCode })
  if (r.code === 0 && r.data) {
    logLine(ICON_OK, `${TASK_NAME[eventCode] || eventCode} 奖励已领`)
    return true
  }
  return false
}

async function getProductList() {
  const r = await http("POST", `${BASE}/v1/api/shop/app/product/app/category/listProduct`, { productCategoryId: 1, limit: 6 })
  if (r.code === 0) {
    const ids = []
    for (const c of (r.data || [])) for (const p of (c.products || [])) if (p.id) ids.push(String(p.id))
    return ids
  }
  return []
}

async function getProductDetail(pid) {
  const r = await http("POST", `${BASE}/v1/api/shop/app/product/detail`, { id: pid })
  if (r.code === 0) {
    const skus = ((r.data || {}).productSkus) || []
    if (skus[0]) return { productId: r.data.id, productSkuNum: skus[0].number }
  }
  return null
}

async function doTask(taskList) {
  const todo = {}
  for (const t of taskList) {
    const code = t.eventCode
    if (!TASK_NAME[code] || !t.taskStatus) continue
    const remain = (t.maxTaskDrawNum || 0) - (t.completeTaskDrawNum || 0)
    if (remain > 0) todo[code] = { remain, name: TASK_NAME[code] }
    else logLine(ICON_OK, `${TASK_NAME[code]} 已完成`)
  }
  if (!Object.keys(todo).length) return logLine(ICON_OK, "所有任务已完成")

  const trends = (todo.like_comment_trend || todo.trend_share) ? await getTrends() : []
  const products = (todo.product_view || todo.product_add_cart) ? await getProductList() : []

  for (const code of Object.keys(todo)) {
    const { remain, name } = todo[code]
    logLine("▶️", `${name} 待执行 ${remain} 次`)

    for (let i = 0; i < remain; i++) {
      let ok = false
      if (code === "like_comment_trend" && trends.length) {
        ok = await doLike(trends[i % trends.length])
      } else if (code === "trend_share" && trends.length) {
        ok = await doShare(trends[i % trends.length])
        if (ok) await drawAward("trend_share")
      } else if (code === "social_view") {
        const r = await http("POST", `${BASE}/v8/social/app/task/completeTask`, { taskType: "social_view" })
        ok = r.code === 200
        if (ok) logLine(ICON_OK, "社区浏览完成")
      } else if (code === "product_view" && products.length) {
        const r = await http("POST", `${BASE}/v1/api/shop/app/integral/user/completeDailyTask`, {
          taskType: 1, eventCode: "product_view", businessId: products[i % products.length]
        })
        ok = r.code === 0
        if (ok) {
          const a = (r.data || {}).awardNum || 0
          totalAward += a
          logLine(ICON_OK, `商品浏览 +${a}积分`)
        }
      } else if (code === "product_add_cart" && products.length) {
        const detail = await getProductDetail(products[0])
        if (detail && detail.productId && detail.productSkuNum) {
          const r = await http("POST", `${BASE}/v1/api/shop/app/cart/setCart`, {
            quantity: 1, productId: detail.productId, productSkuNum: detail.productSkuNum
          })
          ok = r.code === 0
          if (ok) {
            const a = (r.data || {}).awardNum || 0
            totalAward += a
            logLine(ICON_OK, `商品加购 +${a}积分`)
          }
        }
      }
      ok ? successCount++ : failCount++
      await sleep(800 + Math.random() * 1200)
    }
  }
}

// ========== 通知 ==========
function buildNotify() {
  const status = tokenExpired ? "❌ Token 失效" :
                 failCount === 0 ? "✅ 全部成功" :
                 successCount === 0 ? "❌ 全部失败" : "⚠️ 部分失败"
  const subtitle = `${successCount} 成功 / ${failCount} 失败` +
                   (totalAward > 0 ? `  今日 +${totalAward} 积分` : "")
  return {
    title: `♻️ 台铃签到 · ${status}`,
    subtitle: subtitle,
    content: log.join("\n")
  }
}

function emitNotify() {
  const n = buildNotify()
  // 通知中心 widget（QX 支持的 $.notify）
  $.notify(n.title, n.subtitle, n.content)
}

// ========== 主流程 ==========
async function main() {
  logLine("🕒", `启动: ${nowStr()}`)

  if (!TLG_TOKEN) {
    logLine(ICON_FAIL, "未配置 tlg_token，请先抓包填入")
    $.notify("♻️ 台铃签到", "❌ 未配置 token", log.join("\n"))
    return $.done()
  }

  logLine("🔍", "检查 token 有效性...")
  const alive = await checkTokenAlive()
  if (!alive) {
    tokenExpired = true
    logLine(ICON_FAIL, "Token 已失效，请重新抓包！")
    emitNotify()
    await pushPlus("❌ 台铃 token 失效", log.join("\n"))
    return $.done()
  }
  logLine(ICON_OK, "Token 有效")

  await doSign()
  await getSignInfo()
  await getReward()

  const tasks = await listTasks()
  if (tasks.length) await doTask(tasks)

  logLine("🏁", `完成: ${successCount} 成功 / ${failCount} 失败` +
    (totalAward > 0 ? `  +${totalAward} 积分` : ""))

  // 写一条结果到 BoxJs，方便 widget 读取
  $.write(JSON.stringify({
    lastRun: nowStr(),
    success: failCount === 0 && !tokenExpired,
    successCount, failCount, totalAward,
    tokenExpired
  }), "tlg_last_result")

  // 弹通知
  emitNotify()

  // 微信推送
  const summary = `♻️ 台铃签到结果\n\n${log.join("\n")}\n\n🕒 ${nowStr()}`
  await pushPlus(
    failCount === 0 ? "♻️ 台铃签到完成" : "⚠️ 台铃签到部分失败",
    summary
  )

  $.done()
}

main().catch(e => {
  logLine("💥", e.stack || String(e))
  $.notify("💥 台铃签到异常", "查看 QX 日志", log.join("\n"))
  if (PUSH_TOKEN) pushPlus("💥 台铃签到异常", log.join("\n"))
  $.done()
})
