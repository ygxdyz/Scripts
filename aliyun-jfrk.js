/**
 * 脚本名称：阿里云社区积分入口
 * 移除未使用的 Env 模板；console.error 改为 console.log；
 *增加数据结构防御，解析失败或结构变化时原样透传。


[mitm]
hostname = query.aliyun.com

[rewrite_local]
^https:\/\/query\.aliyun\.com\/rest\/merak\.api\/deliveryInfo url script-response-body https://raw.githubusercontent.com/ygxdyz/Scripts/refs/heads/main/aliyun-jfrk.js

 */

const body = $response.body;
let obj = null;

try {
  obj = JSON.parse(body);
} catch (e) {
  console.log('aliyun-jfrk: 响应体不是合法 JSON，原样透传');
}

if (obj && obj.data && Array.isArray(obj.data.infoList)) {
  obj.data.infoList.forEach((item) => {
    item.title = '积分商城';
    item.link = 'https://developer.aliyun.com/app-mobile/score';
  });
  $done({ body: JSON.stringify(obj) });
} else {
  if (obj) console.log('aliyun-jfrk: 接口结构与预期不符，未修改');
  $done({});
}
