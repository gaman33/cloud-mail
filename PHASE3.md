# Cloud Mail 第三阶段：专业发件与可靠性

## 新能力

- 群发拆分为每位收件人一封：独立服务商 ID、追踪像素、状态和时间线。
- 高/普通/低优先级邮件头；逐封追踪、已读回执和退订开关。
- Resend + D1 双层幂等；失败任务写入 D1 发件箱并由 5 分钟 Cron 指数退避重试，最多 5 次。
- 退订、投诉、永久退信自动进入抑制名单，发送前拦截；支持管理员解除。
- 邮件模板、常用片段和 `{{variable}}` 变量；自动提供 `{{customer_email}}`。
- 联系人、标签字段、客户联系时间线、审计日志和可靠性仪表盘。
- 联系人名称、标签、备注和下次跟进时间编辑；失败发送队列可查看并手动重新入队。
- SPF/DMARC DNS-over-HTTPS 检查接口，DKIM 保留供应商 selector 提示。
- 自有链接跳转追踪，Cloudflare Email Sending 与 Resend 均可记录点击目标、时间和客户端数据。
- 追踪事件 CSV 导出；追踪默认保留 90 天、审计默认 180 天，夜间自动清理。
- 每用户默认每小时 200 封限制，可通过 Worker 变量 `send_hourly_limit` 调整。
- 旧的 URL 密钥初始化已替换：管理员调用 `POST /api/admin/migrate`；全新安装用 `POST /api/init` + `x-init-secret` 请求头。

## 升级

1. 确认继续绑定原来的 D1、KV 和 R2。
2. 记录 D1 Time Travel bookmark。
3. 部署 Worker 后以管理员身份登录，调用一次 `POST /api/admin/migrate`。
4. 确认 Cron 包含 `*/5 * * * *` 和 `0 16 * * *`。
5. 保留 `resend_webhook_secret` Worker Secret，并在 Resend 订阅 sent/delivered/opened/clicked/bounced/complained/delayed/failed/suppressed。

## 已知边界

- Cloudflare Email Sending 没有 Resend API 等价的 24 小时供应商幂等键；D1 幂等仍有效，但极端的“供应商已接收、Worker 尚未落库即中断”窗口无法完全消除。
- 邮件优先级由收件客户端决定是否展示，不提高 SMTP 投递速度。
- 已读回执由收件方决定是否发送；像素 IP 可能来自隐私代理。
- 普通 MIME 附件下载不可追踪；要精确记录下载需继续实现签名 R2 云端附件链接。
