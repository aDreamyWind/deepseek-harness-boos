---
description: "Route configured Harness model codes through the Harness Admin OpenAI-compatible Chat Completions gateway with Host-only OIDC bearer tokens."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-enterprise-gateway

English | [中文](README.zh.md)

## Summary

Use Harness Admin as the only configured model provider for an enterprise profile. The package sends the selected Admin model code to its OpenAI-compatible Chat Completions endpoint, obtains the current OIDC access token only on the Host, and refreshes one rejected token before requiring a new login. Model discovery remains deployment configuration until Harness Admin exposes an authenticated `GET /v1/models` endpoint.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package after `llm`, `enterprise-account-oidc`, and their required services. The enterprise bundle supplies this composition and disables the shipped direct-provider adapters.

```yaml
- id: llm-enterprise-gateway
  name: '@deepseek-ai/dsh-llm-enterprise-gateway'
  config:
    gatewayBaseURL: https://admin.example.com/v1
    models:
      - id: admin-model-code
        name: Enterprise Model
```

`gatewayBaseURL` must end in `/v1`. HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` when `allowLoopbackHttp` is true. `models` is a non-empty list whose `id` values are Harness Admin model codes, not upstream provider model names. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-llm-enterprise-gateway) is the exhaustive source for accepted fields.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The adapter reuses the maintained pi-ai OpenAI Completions translator for streaming, tools, multimodal message content, and usage chunks. Each request resolves an access token carrying `model.invoke`; HTTP 401 performs one serialized refresh-token rotation and retries only before any response content has reached the caller. A second 401 retires the matching login. HTTP 403, 404, 409, and 429 become stable Harness failure codes without clearing the login.

| Source | Purpose |
|---|---|
| [`src/index.ts`](src/index.ts) | Configuration validation, OIDC bearer resolution, one-shot 401 recovery, and gateway error mapping |
| [`tests/gateway.spec.ts`](tests/gateway.spec.ts) | Real loopback gateway coverage for authorization headers, model codes, usage requests, refresh, and status mapping |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Enterprise bundle](../../bundle/enterprise/README.md) · [Enterprise account](../../credentials/enterprise-account/README.md) · [OIDC provider](../../credentials/enterprise-account-oidc/README.md) · [pi-ai adapter](../llm-pi-ai/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as this adapter forwards the assembled model request without adding model-visible content.

#### KV Cache effect

Authentication, routing, and gateway error mapping do not change the model request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Harness Admin does not yet expose authenticated `GET /v1/models`, so every selectable model code and its client-side capability metadata must be configured manually.
- The route uses `/v1/chat/completions`; `/v1/responses` is not available. Tool calls, multimodal content, and streaming tool calls ultimately depend on the selected upstream model and provider.
- Streaming usage is requested with `stream_options.include_usage=true`, but a usage record exists only when the upstream SSE stream returns usage.

<a id="dev-note"></a>
### Dev Note

The [enterprise OIDC profile-layer Agent Note](../../../.agents/notes/implemented/architecture/2026-10-09-enterprise-oidc-profile-layer.md) owns the additive integration and Host-only credential decisions.
