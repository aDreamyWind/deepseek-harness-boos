---
kind: upgrade-guide
description: "Enterprise Web uses an installed custom profile instead of an official built-in profile template."
---

# Install the enterprise bundle into a custom profile

English | [中文](guide.zh.md)

## Change

The official profile template registry does not include `enterprise-web`. An existing initialized enterprise profile still works. This source checkout's `pnpm run start:enterprise-web` initializes its custom profile, while an unmodified official checkout needs an explicit external bundle installation. Enterprise model policy and Remote registration are owned by plugins rather than patched official services.

## Migration

1. Keep the old branch, configuration, credentials, and Session data until the independent installation is verified. Export and back up plugin sources outside the old checkout.
2. Follow the [standalone plugin guide](../../../../enterprise/README.md) to build the single bundle archive and install it into a compatible official Web or Desktop profile. Do not copy the old root package scripts into the official checkout.
3. Configure separate Web and Desktop clients. Keep the Web secret on its Host; the Desktop client uses no secret. Verify login, rotating refresh, authorized model discovery, model switching, and a gateway chat request before replacing the old deployment.
4. Retain the desktop distribution layer if branded installers or embedded configuration are required. Installing a plugin does not change a signed official application or its native welcome copy.
5. Move existing user patches for `agent-default-model` to `enterprise-default-model`, retaining `provider`, `model`, and `reasoningEffort`. Patches for the enterprise selector target `enterprise-model-selection`, not the disabled `ui-model-selection` row. Existing Session model selections remain in their logs.
