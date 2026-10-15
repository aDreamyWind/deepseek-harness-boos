---
description: "使用仅限 Host 的 OIDC Bearer token，通过 Harness Admin 的 OpenAI 兼容 Chat Completions 网关路由已配置的 Harness 模型编码。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-enterprise-gateway

[English](README.md) | 中文

## 概述

让企业 profile 只通过 Harness Admin 调用已配置的模型。该包把选中的 Admin 模型编码发送到其 OpenAI 兼容 Chat Completions 端点，只在 Host 获取当前 OIDC access token，并在重新登录前尝试刷新一次被拒绝的令牌。在 Harness Admin 提供带鉴权的 `GET /v1/models` 端点之前，模型目录继续由部署配置提供。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

请在 `llm`、`enterprise-account-oidc` 及其依赖服务之后挂载该包。企业 bundle 会提供这一组合，并禁用随产品交付的直连模型适配器。

```yaml
- id: llm-enterprise-gateway
  name: '@deepseek-ai/dsh-llm-enterprise-gateway'
  config:
    gatewayBaseURL: https://admin.example.com/v1
    models:
      - id: admin-model-code
        name: Enterprise Model
```

`gatewayBaseURL` 必须以 `/v1` 结尾。只有 `allowLoopbackHttp` 为 true 时，才允许 `localhost`、`127.0.0.1` 或 `::1` 使用 HTTP。`models` 必须是非空列表，其中的 `id` 是 Harness Admin 模型编码，而不是上游提供商的模型名称。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-enterprise-gateway)是所有可接受字段的完整来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

适配器复用现有 pi-ai OpenAI Completions 转换器来处理流式输出、工具、多模态消息内容与 usage 分片。每个请求都会解析带有 `model.invoke` 的 access token；HTTP 401 会执行一次串行化的 refresh token 轮换，并且只会在尚未向调用方发送任何响应内容时重试。第二次 401 会停用匹配的登录。HTTP 403、404、409 与 429 会转换为稳定的 Harness 错误码，且不会清除登录。

| 源文件 | 用途 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置校验、OIDC Bearer token 解析、单次 401 恢复与网关错误映射 |
| [`tests/gateway.spec.ts`](tests/gateway.spec.ts) | 使用真实回环网关覆盖 Authorization header、模型编码、usage 请求、刷新与状态映射 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[企业 bundle](../../bundle/enterprise/README.zh.md) · [企业账号](../../credentials/enterprise-account/README.zh.md) · [OIDC 提供器](../../credentials/enterprise-account-oidc/README.zh.md) · [pi-ai 适配器](../llm-pi-ai/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为该适配器转发已组装的模型请求，不添加模型可见内容。

#### KV Cache 影响

鉴权、路由与网关错误映射不会改变模型请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- Harness Admin 尚未提供带鉴权的 `GET /v1/models`，因此必须手动配置每个可选模型编码及其客户端能力元数据。
- 该路由使用 `/v1/chat/completions`，不支持 `/v1/responses`。工具调用、多模态内容与流式工具调用最终取决于所选上游模型和提供商。
- 请求流式 usage 时会发送 `stream_options.include_usage=true`，但只有上游 SSE 流实际返回 usage 时才会产生 usage 记录。

<a id="dev-note"></a>
### 开发备注

[企业 OIDC profile 层 Agent Note](../../../.agents/notes/implemented/architecture/2026-10-09-enterprise-oidc-profile-layer.zh.md)负责增量接入与仅限 Host 的凭据决策。
