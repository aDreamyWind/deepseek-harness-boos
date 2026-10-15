# Agent Note: 企业 OIDC 与网关 profile 层

Status: implemented

[English](2026-10-09-enterprise-oidc-profile-layer.md) | 中文

## 问题

企业发行版需要强制组织登录、仅限 Host 的网关凭据和唯一的 Harness Admin 模型路由，同时不能把这些改动耦合到上游 DeepSeek 账号协议，也不能让日常 upstream 合并反复改写默认 bundle。

## 决策

企业接入采用增量方式。`enterprise-account` 定义浏览器安全的身份状态与仅限 Host 的网关令牌解析；`enterprise-account-oidc` 拥有 OIDC Authorization Code + PKCE 和轮换凭据存储；`api-enterprise-account-controller` 只公开不含凭据的命令与快照；`ui-enterprise-account` 提供强制登录门和身份设置页；`llm-enterprise-gateway` 拥有 Harness Admin 模型路由。

随发行版交付的 `enterprise` bundle patch 会先禁用官方账号配置行与直连模型适配器，再插入企业包。Web 通过 `enterprise-web` profile 选择该 patch，企业 Desktop 安装包则嵌入经过校验的公开发行配置，并在首次启动时选择该 patch。上游 `base`、`web-app` 与通用 Desktop 组合保持不变。fork 通过后置 patch 层选择企业行为，因此日常 upstream 改动保留原文件，企业特有冲突集中在较小范围。要求只走网关的部署不能在后置用户 patch 中添加直连适配器。

Desktop 与 Web profile 使用不同的 OIDC 客户端。Desktop 是 Token 认证方式为 `none` 的公开客户端；每次登录都会基于已登记的不带端口的回环回调模板，绑定一个由操作系统分配的 `127.0.0.1` 端口。Web 是机密服务端客户端，其 secret 保留在 Host 配置中，固定回调由 Host 路由提供；Token 请求默认使用 `client_secret_basic`，也可使用 `client_secret_post`。每次尝试都会创建 `state`、`nonce` 与 PKCE S256 verifier；授权请求与 Token 请求使用完全相同的实际回调 URI，且授权请求不发送 `audience` 参数。ID Token 必须使用 RS256，并校验发现文档 issuer、JWKS key、签名、client audience、必要时的 authorized party、nonce、过期时间、签发时间和 subject。浏览器状态与 Remote 方法不携带 client secret、access token、refresh token、授权码或 PKCE secret。

access token 与 refresh token 保存在按所有者寻址的 GrantRecord 中。access token 解析只允许已配置的网关 origin 和所需 `model.invoke` scope。refresh token 轮换在 `credentials.modifyRecord` 内执行，因此共享凭据文件的进程不会并发刷新同一个轮换令牌。网关第一次返回 HTTP 401 时，会在任何响应内容交付前刷新并重试；第二次 401 只会停用与当前 access token 匹配的授权。退出登录先移除本地授权，再发起有时限的远端撤销请求；网络失败不会恢复本地授权。

企业网关复用现有 pi-ai OpenAI Completions 转换器，不再维护另一套流式协议实现。它把手动配置的 Harness Admin 模型编码发送到 `/v1/chat/completions`，请求流式 usage，并保留受支持的请求和响应字段。HTTP 403、404、409 与 429 会映射为稳定的 Harness 错误码。在 Harness Admin 提供带鉴权的 OpenAI 兼容目录前，模型发现保持手动配置。

## 替代方案

**修改现有 DeepSeek 账号包。** 这会把两个 issuer、令牌格式、回调策略与产品身份混入上游持续修改的包中，使每次上游账号更新都变成语义合并，而不是普通增量合并，因此未采用。

**直接替换默认 bundle。** 这会把企业策略隐含在上游拥有的组合文件中，并形成范围较大的持续冲突，因此改用一个显式的后置 patch 层。

**通过浏览器控制器传递令牌。** 这会简化浏览器拥有的网关客户端，但也会把长期刷新凭据暴露给 renderer 状态与 Remote 日志，因此未采用；网关适配器直接消费 Host 服务。

**在凭据存储锁之外刷新。** 这会允许并发进程重复使用同一个轮换刷新令牌，并可能触发后台管理服务的重用检测，因此即使持锁范围包含一次网络往返，也不采用此方式。

## 影响

企业登录实现可以跟随上游更新，同时保留较小的冲突面：新增包、一处 Remote 装配导入、生成的路径与引用、一个显式 Web profile，以及一个 Desktop 发行版选择器。默认 DeepSeek 发行版行为不变。

只有选择 enterprise patch 时才强制企业登录并使用 Harness Admin 路由。该 patch 下随产品交付的提供器路由都会经过 Harness Admin。Harness Admin 负责模型授权与额度判断；把部门或个人的 Skill 与 MCP Server 分配投影到 Harness 仍属于单独的接入工作。

OIDC 发现、令牌兑换、JWKS、UserInfo、刷新和撤销都是由部署配置控制并具有明确时限的 HTTP 请求。登录尝试只保存在内存中，Host 重启后不会恢复；已存储的授权会恢复。临时刷新传输失败会保留当前授权并使本次请求失败；`invalid_grant` 与显式网关拒绝会让凭据不可用，并通知当前订阅者。

## 验证

提供器测试在动态端口绑定真实回环监听器，覆盖 PKCE 参数、回调 state 拒绝、RS256/JWKS 与 nonce 校验、不使用 secret 的公开客户端 Token 兑换与刷新、机密客户端鉴权、不含凭据的 UI 状态、origin 与 scope 限制、串行化刷新，以及本地优先退出。网关测试绑定真实回环端点，覆盖 Bearer header、精确模型编码、流式 usage 请求、单次 401 恢复与 Admin 状态映射。控制器测试固定委托行为以及不存在令牌方法。完整客户端组合测试启动生产模块图、打开 Remote 状态流，并验证登录门与设置注册共享同一个状态源。

## 相关记录

[DeepSeek 账号浏览器登录](2026-09-14-deepseek-account-login.zh.md)仍负责官方账号提供器，没有被本决策取代。[凭据记录与授权流程](2026-08-13-credential-records-and-authorization-flows.zh.md)仍是通用存储与授权依据。
