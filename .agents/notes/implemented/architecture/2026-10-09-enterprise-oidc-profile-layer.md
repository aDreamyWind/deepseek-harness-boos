# Agent Note: Enterprise OIDC and gateway profile layer

Status: implemented

English | [中文](2026-10-09-enterprise-oidc-profile-layer.zh.md)

## Problem

An enterprise distribution needs mandatory organization login, Host-only gateway credentials, and one Harness Admin model route without coupling those changes to the upstream DeepSeek account protocol or making routine upstream merges rewrite the default bundles.

## Decision

Enterprise integration is additive. `enterprise-account` defines browser-safe identity state and Host-only gateway-token resolution, `enterprise-account-oidc` owns OIDC Authorization Code with PKCE and rotating credential storage, `api-enterprise-account-controller` exposes only credential-free commands and snapshots, `ui-enterprise-account` contributes the mandatory login gate and identity settings page, and `llm-enterprise-gateway` owns the Harness Admin model route.

The `enterprise` bundle patch disables the official-account rows, direct model adapters, default-model provider, and model selector before inserting enterprise replacements. An ordinary custom Web profile or the initialized Desktop profile installs this external bundle through the supported plugin manager. The enterprise client composition mounts its own generated account and model-directory Remote descriptors; upstream profile templates and the shared Remote aggregate need no enterprise imports. Upstream `base`, `web-app`, and Session API remain unchanged. A deployment requiring gateway-only routing does not add a direct adapter in a later user patch.

`agent-enterprise-default-model` owns process-local authorized-default fallback, `api-enterprise-model-controller` exposes the separate `enterpriseModels.modelCatalog` endpoint, and `ui-enterprise-model-selection` owns the selector implementation. The directory calls the existing Session catalog, then samples the default after discovery; it does not replace the Session controller or client. The selector retains upstream visual design and shared primitives but is an enterprise-maintained copy, so upstream selector changes require explicit comparison and verification.

The Desktop compatibility controller inherits the official account RPC markers and service key while overriding every account operation. Native login, cancellation, sign-out, state, expiry, and running-task checks use enterprise services; Platform profile, balance, and bonus operations do not call official services. Installed official Desktop can therefore keep its native onboarding flow. Signed-shell application names, icons, update sources, and native welcome copy remain outside plugin control; embedded enterprise configuration and branded installers require a separate desktop distribution layer.

The Desktop and Web profiles use separate OIDC clients. Desktop is a public client with token authentication `none`; each login binds an operating-system-assigned `127.0.0.1` port from its registered portless loopback callback template. Web is a confidential server-side client whose secret stays in Host configuration and whose fixed callback is served through the Host route; token requests use `client_secret_basic` by default and can use `client_secret_post`. Each attempt creates `state`, `nonce`, and a PKCE S256 verifier; the effective redirect URI is identical in its authorization and token requests, and authorization sends no `audience` parameter. ID tokens require RS256 and validate the discovered issuer, JWKS key, signature, client audience, authorized party when needed, nonce, expiry, issue time, and subject. Browser state and Remote methods never carry a client secret, access token, refresh token, authorization code, or PKCE secret.

Access and refresh tokens are stored as an owner-scoped GrantRecord. Access-token resolution admits only the configured gateway origin and required `model.invoke` scope. Refresh-token rotation executes inside `credentials.modifyRecord`, so processes sharing the credential file cannot refresh the same rotating token concurrently. One gateway HTTP 401 refreshes and retries before any response content is delivered; a second 401 retires only the matching current access token. Sign-out removes the local grant before a bounded remote revocation request and never restores it after network failure.

The enterprise gateway reuses the maintained pi-ai OpenAI Completions translator instead of owning another streaming protocol implementation. It reads the current user's authorized models from `/v1/models`, sends selected Admin model codes to `/v1/chat/completions`, requests streaming usage, and preserves supported request and response fields. Static model entries provide metadata hints rather than permission or outage fallback lists. A successful directory read can supply an in-memory default when the configured model is unavailable; it does not persist user-specific authorization into the profile. HTTP 403, 404, 409, and 429 map to stable Harness failure codes.

## Alternatives considered

**Edit the existing DeepSeek account packages.** This would mix two issuers, token formats, callback policies, and product identities in packages that upstream actively changes. It was rejected because every upstream account update would become a semantic merge instead of an ordinary additive merge.

**Replace the default bundles directly.** This would make enterprise policy implicit in upstream-owned composition files and create broad recurring conflicts. It was rejected in favor of one explicit later patch layer.

**Send tokens through the browser controller.** This would simplify a browser-owned gateway client but expose long-lived refresh credentials to renderer state and Remote logs. It was rejected; gateway adapters consume the Host service directly.

**Refresh outside the credential-store lock.** This permits concurrent processes to reuse one rotating refresh token and can trigger the management service's reuse detection. It was rejected even though holding the lock includes one network round trip.

## Consequences

Enterprise packages and their bundle are maintained independently of official sources. The [distribution tools](../../../../enterprise/README.md) pack one installable archive and export an allowlisted detached source project; compatible official Harness supplies the runtime libraries. The old feature branch and desktop distribution sources remain necessary backups until detached builds and official-installation verification succeed. Plugin compatibility still needs validation on each supported Harness upgrade, but official application source files do not carry enterprise business patches.

Enterprise login and the Harness Admin route are mandatory only when the enterprise patch is selected. The shipped provider routes all pass through Harness Admin under that patch. Harness Admin owns model authorization and quota decisions; projecting department or user assignments for Skills and MCP servers remains a separate integration.

OIDC discovery, token exchange, JWKS, UserInfo, refresh, and revocation are deployment-controlled HTTP requests with explicit deadlines. Login attempts are in-memory and do not resume after Host restart; stored grants do. Temporary refresh transport failures preserve the active grant and fail the current request, while `invalid_grant` and explicit gateway rejection make the credential unavailable and notify current subscribers.

## Verification

Provider tests bind real loopback listeners on dynamic ports and cover PKCE parameters, callback state rejection, RS256/JWKS and nonce validation, public-client token exchange and refresh without a secret, confidential-client authentication, credential-free UI state, origin and scope restriction, serialized refresh, and local-first sign-out. Gateway tests bind a real loopback endpoint and cover the bearer header, exact model code, streaming usage request, one-shot 401 recovery, and Admin status mapping. Controller tests pin delegation, absence of token methods, native account compatibility, and stream cleanup. Model-policy tests cover nonpersistent fallback, a correct first directory default, and preservation of the original Session controller. Client composition tests cover enterprise-owned Remote registration and shared login state; selector tests cover refreshed choices and stale-response isolation.

## Related

[DeepSeek account browser login](2026-09-14-deepseek-account-login.md) remains the authority for the official account provider and is not superseded. [Credential records and authorization flows](2026-08-13-credential-records-and-authorization-flows.md) remains the generic storage and authorization authority.
