---
description: "Enterprise login screens use authenticated Remote commands and a reconnect-safe state stream without exposing access tokens, refresh tokens, authorization codes, or PKCE material."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-enterprise-account-controller

English | [中文](README.zh.md)

## Summary

Enterprise login screens use authenticated Remote commands and a reconnect-safe state stream without exposing access tokens, refresh tokens, authorization codes, or PKCE material.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The `enterpriseAccount` namespace exposes `getState`, `startSignIn`, `cancelSignIn`, `signOut`, and `watch`. `watch` emits an initial complete state and later complete states. Ending a subscription stops observation without cancelling the browser attempt. Cancellation names an attempt ID so a stale page cannot cancel a newer login.

The controller deliberately has no token-resolution method. Gateway adapters consume the Host-only Service Definition directly.

<a id="model-experience"></a>
## Model Experience

None, as the controller exposes identity state only to the authenticated application client.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The stream recovers current state after reconnect but does not resume a browser attempt after Host process exit.

<a id="dev-note"></a>
### Dev Note

The enterprise OIDC Agent Note records why token-bearing operations remain outside Remote.
