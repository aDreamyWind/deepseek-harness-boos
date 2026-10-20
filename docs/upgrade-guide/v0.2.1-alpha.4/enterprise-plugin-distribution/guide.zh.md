---
kind: upgrade-guide
description: "企业 Web 使用已安装的自定义 profile，不再依赖官方内置 profile 模板。"
---

# 将企业 bundle 安装到自定义 profile

[English](guide.md) | 中文

## 变更

官方 profile 模板注册表不包含 `enterprise-web`。已经初始化的企业 profile 仍然可用。本源码检出目录的 `pnpm run start:enterprise-web` 会初始化其自定义 profile，未修改的官方检出目录则需要显式安装外置 bundle。企业模型策略和 Remote 注册由插件负责，不再修改官方服务实现。

## 迁移

1. 独立安装验证完成前，保留旧分支、配置、凭据和 Session 数据。将插件源码导出并备份到旧检出目录之外。
2. 按[独立插件指南](../../../../enterprise/README.zh.md)构建单一 bundle 归档，安装到兼容的官方 Web 或 Desktop profile。不要把旧项目的根启动脚本复制到官方检出目录。
3. 分别配置 Web 和 Desktop 客户端。Web 密钥只保留在 Host，Desktop 客户端不使用密钥。替换旧部署前，验证登录、轮换刷新、授权模型发现、模型切换和网关聊天请求。
4. 需要品牌安装包或内嵌配置时，保留桌面分发层。安装插件不会修改已签名的官方应用或其原生欢迎页文案。
5. 将已有用户 patch 中的 `agent-default-model` 改为 `enterprise-default-model`，保留 `provider`、`model` 和 `reasoningEffort`。企业选择器的 patch 应针对 `enterprise-model-selection`，而不是已禁用的 `ui-model-selection` 行。已有 Session 的模型选择仍保留在日志中。
