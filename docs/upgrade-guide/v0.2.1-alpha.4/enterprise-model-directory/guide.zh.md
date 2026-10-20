---
kind: upgrade-guide
description: "企业模型选择器现在依赖 Harness Admin 的带鉴权模型目录，不再展示静态模型配置。"
---

# 企业模型依赖 Admin 目录

[English](guide.md) | 中文

## 变更

企业 Web 和 Desktop profile 使用当前用户的 OIDC access token，通过 `GET <gatewayBaseURL>/models` 列出模型。`HARNESS_ADMIN_MODELS` 和网关插件的 `models` 字段提供元数据提示与初始默认候选，不再公布可选模型，也不提供离线后备列表。目录刷新失败会清除旧选项。现有 Session 的选择仍保留在日志中，但请求要求模型出现在当前一次成功读取的目录里。

## 迁移

1. 部署提供 `GET /v1/models` 的 Harness Admin，要求 `model.invoke` 并返回 OpenAI 兼容的 `object: "list"` 与 `data` 数组。每项需要非空 `id`；可选 `name` 和 `capabilities` 提供显示名称与视觉能力元数据。
2. 在 `HARNESS_ADMIN_MODELS` 或 `models` 中保留至少一个 Admin 模型编码作为初始默认候选。静态条目仍可补充上下文窗口与输出上限。目录加载后，若默认模型不可用，会临时使用第一个可用模型，而不修改 profile 文件。
3. 重启企业 Harness 并登录。确认 Web 与 Desktop 只显示用户有权调用且启用的模型。目录临时失败时应显示查询失败，且没有静态模型选项；查询重试成功后恢复选项。
