# Changelog

## [0.12.1](https://github.com/thesoftwarebakery/plenum/compare/v0.12.0...v0.12.1) (2026-04-29)


### Bug Fixes

* remove unnecessary clones and improve idiomatic Rust patterns ([f665d41](https://github.com/thesoftwarebakery/plenum/commit/f665d41f95d6b89c79e6e8ea5e5816acae18604d))
* remove unnecessary clones and improve idiomatic Rust patterns ([2ca99a7](https://github.com/thesoftwarebakery/plenum/commit/2ca99a7eaa35054e2e6ece56d0d37b3ca2217a52))

## [0.12.0](https://github.com/thesoftwarebakery/plenum/compare/v0.11.0...v0.12.0) (2026-04-28)


### Features

* add per-identity rate limiting ([a9cb407](https://github.com/thesoftwarebakery/plenum/commit/a9cb407b65ba3871460ff3759b7d5fe37f1d2900))
* add per-identity rate limiting ([#78](https://github.com/thesoftwarebakery/plenum/issues/78)) ([6b3457b](https://github.com/thesoftwarebakery/plenum/commit/6b3457b8b5ff24db3e0703ca7ed560436023caac))

## [0.11.0](https://github.com/thesoftwarebakery/plenum/compare/v0.10.0...v0.11.0) (2026-04-28)


### Features

* add on_request_headers interceptor hook ([0d15f56](https://github.com/thesoftwarebakery/plenum/commit/0d15f56baec90f9807f5cc7bb4198db82743312d))
* add on_request_headers interceptor hook ([f192dd8](https://github.com/thesoftwarebakery/plenum/commit/f192dd86e0a7429e665d9627ba26439041d40d48)), closes [#116](https://github.com/thesoftwarebakery/plenum/issues/116)

## [0.10.0](https://github.com/thesoftwarebakery/plenum/compare/v0.9.0...v0.10.0) (2026-04-27)


### Features

* add on_gateway_error global interceptor hook ([819383e](https://github.com/thesoftwarebakery/plenum/commit/819383e719d84d5cdae75d74f768ea38c2a9ddd8))
* add on_gateway_error global interceptor hook ([a642204](https://github.com/thesoftwarebakery/plenum/commit/a64220402db525ed951a6886d07593e38505c57a)), closes [#77](https://github.com/thesoftwarebakery/plenum/issues/77)

## [0.9.0](https://github.com/thesoftwarebakery/plenum/compare/v0.8.1...v0.9.0) (2026-04-27)


### Features

* add CORS support via x-plenum-cors overlay extension ([deed792](https://github.com/thesoftwarebakery/plenum/commit/deed7926af85db04a6c21f2607866354df232eec))

## [0.8.1](https://github.com/thesoftwarebakery/plenum/compare/v0.8.0...v0.8.1) (2026-04-27)


### Bug Fixes

* enable $ref resolution for operation-level extensions ([e0ecef6](https://github.com/thesoftwarebakery/plenum/commit/e0ecef651bf5d0e1cb4753b89f54673cb76eeb57))

## [0.8.0](https://github.com/thesoftwarebakery/plenum/compare/v0.7.0...v0.8.0) (2026-04-26)


### Features

* load balancing and health checks for HTTP upstreams ([4426160](https://github.com/thesoftwarebakery/plenum/commit/442616032e94ac259faa97611fd620606384a4a8))


### Bug Fixes

* resolve clippy collapsible_if warnings ([463acb5](https://github.com/thesoftwarebakery/plenum/commit/463acb58eeef2fa4c1326863a5353a8c6e9f902e))


### Performance Improvements

* avoid write lock on passive_failures in common case ([fa27d38](https://github.com/thesoftwarebakery/plenum/commit/fa27d38211e4d4bc2f694ac51f0a67b0efb5ab9d))

## [0.7.0](https://github.com/thesoftwarebakery/plenum/compare/v0.6.0...v0.7.0) (2026-04-26)


### Features

* TLS support — inbound listener and HTTPS upstreams ([ff8632b](https://github.com/thesoftwarebakery/plenum/commit/ff8632b94b82a9a95bfecfdd5f0e2ca6846330f2))
* TLS support — inbound listener and HTTPS upstreams ([#65](https://github.com/thesoftwarebakery/plenum/issues/65)) ([7e9143a](https://github.com/thesoftwarebakery/plenum/commit/7e9143a7f1c354a0bdf9ec9b0796f3126a64b6f1))


### Bug Fixes

* enforce request body size limit on plugin upstream routes ([05c1023](https://github.com/thesoftwarebakery/plenum/commit/05c1023ba346c14f17b8e722f6339d8c90c06dcc))
* enforce request body size limit on plugin upstream routes ([47d6e6b](https://github.com/thesoftwarebakery/plenum/commit/47d6e6bbb90dab7fa42a6f39f0db03802644b309)), closes [#99](https://github.com/thesoftwarebakery/plenum/issues/99)

## [0.6.0](https://github.com/thesoftwarebakery/plenum/compare/v0.5.0...v0.6.0) (2026-04-22)


### Features

* introduce PluginInput/PluginOutput structs, support header removal ([2c3c359](https://github.com/thesoftwarebakery/plenum/commit/2c3c3596350b9687aeff660f4e20c0d024650cac))
* move route/method onto input structs, make ctx purely user-land ([6306cca](https://github.com/thesoftwarebakery/plenum/commit/6306ccaff4530f772092bb0fc4e27b14d539e49e))
* replace typeshare with ts-rs for TypeScript type generation ([b8b60cf](https://github.com/thesoftwarebakery/plenum/commit/b8b60cf1f14ed772d8d1bc0b587fc627fd251622))
* request-scoped ctx bag for interceptors and plugins ([1ad8d8e](https://github.com/thesoftwarebakery/plenum/commit/1ad8d8ef8b07d519e150e546bc38da93ac27b678))
* request-scoped ctx bag for interceptors and plugins ([07c8492](https://github.com/thesoftwarebakery/plenum/commit/07c849234676c8a5c8d4241509268a03ec21e47f))


### Bug Fixes

* apply cargo fmt, fix clippy bench error, fix echo plugin input.body ([b74373f](https://github.com/thesoftwarebakery/plenum/commit/b74373f38768af7c401ad948151f9caaa0f97104))

## [0.5.0](https://github.com/thesoftwarebakery/plenum/compare/v0.4.0...v0.5.0) (2026-04-22)


### Features

* enforce inbound body size limits with 413 on excess ([1a70490](https://github.com/thesoftwarebakery/plenum/commit/1a70490fbaf6b36babd54d6bf0d723b9484a3d30)), closes [#67](https://github.com/thesoftwarebakery/plenum/issues/67)
* inbound body size limits (413 on excess) ([b4296bd](https://github.com/thesoftwarebakery/plenum/commit/b4296bdd7c61bcb44b88d642aedb67590bf0b6e9))


### Bug Fixes

* remove broken schema_validation bench left over from validation removal ([b2930be](https://github.com/thesoftwarebakery/plenum/commit/b2930bed8627baf8d75902d2a21a3cd28847e55a))

## [0.4.0](https://github.com/thesoftwarebakery/plenum/compare/v0.3.0...v0.4.0) (2026-04-21)


### Features

* add CancellationToken and comprehensive timeout coverage ([68ada36](https://github.com/thesoftwarebakery/plenum/commit/68ada36d8b8f46394260e0699a4fc6523b37ea55))
* add overall request timeout ([e664a26](https://github.com/thesoftwarebakery/plenum/commit/e664a26c7a93c8577762993869d20742e35a98db))


### Bug Fixes

* resolve merge conflict with main (static upstream variant) ([b2c84b4](https://github.com/thesoftwarebakery/plenum/commit/b2c84b492e154cec7162bcc1325b129aecaf5ad8))

## [0.3.0](https://github.com/thesoftwarebakery/plenum/compare/v0.2.0...v0.3.0) (2026-04-21)


### Features

* add static upstream type ([18dbb43](https://github.com/thesoftwarebakery/plenum/commit/18dbb43e3326ccb4d3fe763c846589025250b709))
* add static upstream type for returning pre-configured responses ([4d44ed6](https://github.com/thesoftwarebakery/plenum/commit/4d44ed69589f3d48f3efdb4e35ebfc2c68732f82)), closes [#68](https://github.com/thesoftwarebakery/plenum/issues/68)


### Bug Fixes

* make status field required for static upstream ([8212eb8](https://github.com/thesoftwarebakery/plenum/commit/8212eb8bf028c6a12e4ad8f66b6cbc41b3ea487a))

## [0.2.0](https://github.com/thesoftwarebakery/plenum/compare/v0.1.0...v0.2.0) (2026-04-21)


### Features

* add CD pipeline with release-please and Docker publish ([2e67001](https://github.com/thesoftwarebakery/plenum/commit/2e670015f283cb8498760099a37f6f1ebd93c27c))


### Bug Fixes

* revert workspace version inheritance — release-please cannot parse version.workspace = true ([6504c6d](https://github.com/thesoftwarebakery/plenum/commit/6504c6def9f3b2361da8d4a433e1d41322db7b4c))
* revert workspace version inheritance for release-please compatibility ([3da8a07](https://github.com/thesoftwarebakery/plenum/commit/3da8a07c763bd1bce7040e4023760cbb69f1f446))
