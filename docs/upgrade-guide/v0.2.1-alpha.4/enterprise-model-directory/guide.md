---
kind: upgrade-guide
description: "Enterprise model selectors now require Harness Admin's authenticated model directory instead of advertising static model configuration."
---

# Enterprise models require the Admin directory

English | [中文](guide.zh.md)

## Change

Enterprise Web and Desktop profiles list models through `GET <gatewayBaseURL>/models` with the current user's OIDC access token. `HARNESS_ADMIN_MODELS` and the gateway plugin's `models` field provide metadata hints and an initial default candidate; they no longer advertise models or supply an offline fallback. A failed directory refresh clears previous choices. Existing Session selections remain recorded, but a request requires the model to appear in a successful current directory read.

## Migration

1. Deploy Harness Admin with `GET /v1/models`, requiring `model.invoke` and returning the OpenAI-compatible `object: "list"` and `data` array. Each entry needs a non-empty `id`; optional `name` and `capabilities` provide display and vision metadata.
2. Keep at least one Admin model code in `HARNESS_ADMIN_MODELS` or `models` as the initial default candidate. Static entries may still supply context windows and output limits. Once the directory loads, an unavailable default uses its first available model without changing the profile file.
3. Restart the enterprise Harness and sign in. Confirm that Web and Desktop show only the user's enabled, authorized models. Temporarily failing the directory must show a query failure without static model choices; retrying a successful query restores the choices.
