window.BENCHMARK_DATA = {
  "lastUpdate": 1777499315265,
  "repoUrl": "https://github.com/thesoftwarebakery/plenum",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f251e9b08457fba9953a47c5cd1b142583184d94",
          "message": "Merge pull request #90 from thesoftwarebakery/worktree-bench-ci\n\nci: add benchmark workflow with PR latency comments",
          "timestamp": "2026-04-21T16:39:05+01:00",
          "tree_id": "c8d263e10bf7161ba17407c8c53891627d525ea0",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/f251e9b08457fba9953a47c5cd1b142583184d94"
        },
        "date": 1776786075865,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.248,
            "unit": "ms",
            "extra": "n=8013"
          },
          {
            "name": "passthrough p99 latency",
            "value": 4.781,
            "unit": "ms",
            "extra": "n=8013"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.196,
            "unit": "ms",
            "extra": "n=8363"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.731,
            "unit": "ms",
            "extra": "n=8363"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.389,
            "unit": "ms",
            "extra": "n=7199"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.637,
            "unit": "ms",
            "extra": "n=7199"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.67,
            "unit": "ms",
            "extra": "n=5989"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.71,
            "unit": "ms",
            "extra": "n=5989"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b4296bdd7c61bcb44b88d642aedb67590bf0b6e9",
          "message": "Merge pull request #92 from thesoftwarebakery/worktree-issue-67-body-limit\n\nfeat: inbound body size limits (413 on excess)",
          "timestamp": "2026-04-22T12:42:51+01:00",
          "tree_id": "284b586243afd0eeeaeb69f76ee498d76475f653",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/b4296bdd7c61bcb44b88d642aedb67590bf0b6e9"
        },
        "date": 1776858377516,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.265,
            "unit": "ms",
            "extra": "n=7908"
          },
          {
            "name": "passthrough p99 latency",
            "value": 6.472,
            "unit": "ms",
            "extra": "n=7908"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.199,
            "unit": "ms",
            "extra": "n=8338"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 5.652,
            "unit": "ms",
            "extra": "n=8338"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.315,
            "unit": "ms",
            "extra": "n=7603"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 5.448,
            "unit": "ms",
            "extra": "n=7603"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.629,
            "unit": "ms",
            "extra": "n=6138"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.69,
            "unit": "ms",
            "extra": "n=6138"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "09b0de33db173ecb718c81733e044474f23ee543",
          "message": "Merge pull request #93 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.5.0",
          "timestamp": "2026-04-22T12:45:23+01:00",
          "tree_id": "46a9520d3655219c4f3516a094a81170243bc595",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/09b0de33db173ecb718c81733e044474f23ee543"
        },
        "date": 1776858509011,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.328,
            "unit": "ms",
            "extra": "n=7533"
          },
          {
            "name": "passthrough p99 latency",
            "value": 6.205,
            "unit": "ms",
            "extra": "n=7533"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.281,
            "unit": "ms",
            "extra": "n=7809"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 5.906,
            "unit": "ms",
            "extra": "n=7809"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.452,
            "unit": "ms",
            "extra": "n=6887"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 5.087,
            "unit": "ms",
            "extra": "n=6887"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.656,
            "unit": "ms",
            "extra": "n=6038"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 6.097,
            "unit": "ms",
            "extra": "n=6038"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "george@bakes.software",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "george@bakes.software",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "distinct": true,
          "id": "7e6bedf78247b6d09099b89fe7dfba59f7abdcea",
          "message": "chore: update .gitignore",
          "timestamp": "2026-04-22T17:59:58+01:00",
          "tree_id": "1c9d551dc9b7bfbf64bab23de00b1cf3c8627faa",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/7e6bedf78247b6d09099b89fe7dfba59f7abdcea"
        },
        "date": 1776877372377,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.358,
            "unit": "ms",
            "extra": "n=7362"
          },
          {
            "name": "passthrough p99 latency",
            "value": 7.531,
            "unit": "ms",
            "extra": "n=7362"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.273,
            "unit": "ms",
            "extra": "n=7859"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 6.386,
            "unit": "ms",
            "extra": "n=7859"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.445,
            "unit": "ms",
            "extra": "n=6921"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 6.013,
            "unit": "ms",
            "extra": "n=6921"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.582,
            "unit": "ms",
            "extra": "n=6323"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.589,
            "unit": "ms",
            "extra": "n=6323"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1ad8d8ef8b07d519e150e546bc38da93ac27b678",
          "message": "Merge pull request #94 from thesoftwarebakery/feature/ctx-bag\n\nfeat: request-scoped ctx bag for interceptors and plugins",
          "timestamp": "2026-04-22T22:43:24+01:00",
          "tree_id": "cd745861893d626c392f76a35fcb5d0cc9ded68c",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/1ad8d8ef8b07d519e150e546bc38da93ac27b678"
        },
        "date": 1776894692056,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.294,
            "unit": "ms",
            "extra": "n=7726"
          },
          {
            "name": "passthrough p99 latency",
            "value": 6.64,
            "unit": "ms",
            "extra": "n=7726"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.32,
            "unit": "ms",
            "extra": "n=7575"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 7.107,
            "unit": "ms",
            "extra": "n=7575"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.525,
            "unit": "ms",
            "extra": "n=6558"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 5.708,
            "unit": "ms",
            "extra": "n=6558"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.63,
            "unit": "ms",
            "extra": "n=6137"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.789,
            "unit": "ms",
            "extra": "n=6137"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6b0a0d97307850cc7cad3e753860c8d541658109",
          "message": "Merge pull request #96 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.6.0",
          "timestamp": "2026-04-23T10:38:40+01:00",
          "tree_id": "5bf4791bde93e84c994f900c903ae3a5993daa51",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/6b0a0d97307850cc7cad3e753860c8d541658109"
        },
        "date": 1776937402301,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.92,
            "unit": "ms",
            "extra": "n=10867"
          },
          {
            "name": "passthrough p99 latency",
            "value": 5.587,
            "unit": "ms",
            "extra": "n=10867"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.921,
            "unit": "ms",
            "extra": "n=10861"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 4.768,
            "unit": "ms",
            "extra": "n=10861"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.04,
            "unit": "ms",
            "extra": "n=9618"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 4.352,
            "unit": "ms",
            "extra": "n=9618"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.255,
            "unit": "ms",
            "extra": "n=7967"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 4.839,
            "unit": "ms",
            "extra": "n=7967"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7ac83d85ef9d18bafabfdea65d2187f51f4b2d17",
          "message": "Merge pull request #97 from thesoftwarebakery/worktree-ts-fixtures-pnpm\n\nchore: migrate e2e fixtures to TypeScript with pnpm workspaces",
          "timestamp": "2026-04-23T13:39:59+01:00",
          "tree_id": "3b967b6ebcf3d52d5db8b91294f466b17a01028b",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/7ac83d85ef9d18bafabfdea65d2187f51f4b2d17"
        },
        "date": 1776948294183,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.227,
            "unit": "ms",
            "extra": "n=8148"
          },
          {
            "name": "passthrough p99 latency",
            "value": 5.77,
            "unit": "ms",
            "extra": "n=8148"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.205,
            "unit": "ms",
            "extra": "n=8298"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 5.372,
            "unit": "ms",
            "extra": "n=8298"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.4,
            "unit": "ms",
            "extra": "n=7145"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 5.293,
            "unit": "ms",
            "extra": "n=7145"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.7,
            "unit": "ms",
            "extra": "n=5881"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.678,
            "unit": "ms",
            "extra": "n=5881"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ff8632b94b82a9a95bfecfdd5f0e2ca6846330f2",
          "message": "Merge pull request #98 from thesoftwarebakery/worktree-tls-support\n\nfeat: TLS support — inbound listener and HTTPS upstreams",
          "timestamp": "2026-04-26T16:02:40+01:00",
          "tree_id": "868308db2a71515c522e6884fa200ad77224a2fb",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/ff8632b94b82a9a95bfecfdd5f0e2ca6846330f2"
        },
        "date": 1777216418557,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.439,
            "unit": "ms",
            "extra": "n=6951"
          },
          {
            "name": "passthrough p99 latency",
            "value": 6.405,
            "unit": "ms",
            "extra": "n=6951"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.285,
            "unit": "ms",
            "extra": "n=7780"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 4.434,
            "unit": "ms",
            "extra": "n=7780"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.494,
            "unit": "ms",
            "extra": "n=6692"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.867,
            "unit": "ms",
            "extra": "n=6692"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.7,
            "unit": "ms",
            "extra": "n=5883"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.78,
            "unit": "ms",
            "extra": "n=5883"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "05c1023ba346c14f17b8e722f6339d8c90c06dcc",
          "message": "Merge pull request #104 from thesoftwarebakery/worktree-fix-plugin-body-limit\n\nfix: enforce request body size limit on plugin upstream routes",
          "timestamp": "2026-04-26T19:02:54+01:00",
          "tree_id": "60544c234250c9135a3f3225d1c77b38d58a1e21",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/05c1023ba346c14f17b8e722f6339d8c90c06dcc"
        },
        "date": 1777226833128,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.346,
            "unit": "ms",
            "extra": "n=7430"
          },
          {
            "name": "passthrough p99 latency",
            "value": 7.227,
            "unit": "ms",
            "extra": "n=7430"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.318,
            "unit": "ms",
            "extra": "n=7590"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 6.23,
            "unit": "ms",
            "extra": "n=7590"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.488,
            "unit": "ms",
            "extra": "n=6721"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 5.996,
            "unit": "ms",
            "extra": "n=6721"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.687,
            "unit": "ms",
            "extra": "n=5928"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 6.497,
            "unit": "ms",
            "extra": "n=5928"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "442616032e94ac259faa97611fd620606384a4a8",
          "message": "Merge pull request #106 from thesoftwarebakery/worktree-issue-70-load-balancing\n\nfeat: load balancing and health checks for HTTP upstreams",
          "timestamp": "2026-04-26T21:37:28+01:00",
          "tree_id": "591f8ecb97d672374fe66cf48bc9bf611b8bb3cd",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/442616032e94ac259faa97611fd620606384a4a8"
        },
        "date": 1777236601138,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.31,
            "unit": "ms",
            "extra": "n=7636"
          },
          {
            "name": "passthrough p99 latency",
            "value": 6.974,
            "unit": "ms",
            "extra": "n=7636"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.349,
            "unit": "ms",
            "extra": "n=7414"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 6.23,
            "unit": "ms",
            "extra": "n=7414"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.552,
            "unit": "ms",
            "extra": "n=6442"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 6.011,
            "unit": "ms",
            "extra": "n=6442"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.657,
            "unit": "ms",
            "extra": "n=6034"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.875,
            "unit": "ms",
            "extra": "n=6034"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "518d6db77a83c6ae80811fe6d54641a83f082c45",
          "message": "Merge pull request #109 from thesoftwarebakery/worktree-config-cleanup\n\nrefactor: config structure review and consistency fixes",
          "timestamp": "2026-04-27T10:24:55+01:00",
          "tree_id": "3a0183de1f17dcedbd4df7bbc73aa6fbe44fef8c",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/518d6db77a83c6ae80811fe6d54641a83f082c45"
        },
        "date": 1777282309093,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.345,
            "unit": "ms",
            "extra": "n=7437"
          },
          {
            "name": "passthrough p99 latency",
            "value": 6.448,
            "unit": "ms",
            "extra": "n=7437"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.353,
            "unit": "ms",
            "extra": "n=7391"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 6.161,
            "unit": "ms",
            "extra": "n=7391"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.572,
            "unit": "ms",
            "extra": "n=6361"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 5.842,
            "unit": "ms",
            "extra": "n=6361"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.69,
            "unit": "ms",
            "extra": "n=5919"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.956,
            "unit": "ms",
            "extra": "n=5919"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "deed7926af85db04a6c21f2607866354df232eec",
          "message": "Merge pull request #107 from thesoftwarebakery/worktree-issue-69-cors\n\nfeat: add CORS support via x-plenum-cors overlay extension",
          "timestamp": "2026-04-27T11:17:05+01:00",
          "tree_id": "d1d0d85390ce53634b68ab937db370b4eee137a8",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/deed7926af85db04a6c21f2607866354df232eec"
        },
        "date": 1777285416832,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.313,
            "unit": "ms",
            "extra": "n=7614"
          },
          {
            "name": "passthrough p99 latency",
            "value": 5.615,
            "unit": "ms",
            "extra": "n=7614"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.214,
            "unit": "ms",
            "extra": "n=8238"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.672,
            "unit": "ms",
            "extra": "n=8238"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.435,
            "unit": "ms",
            "extra": "n=6967"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.319,
            "unit": "ms",
            "extra": "n=6967"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.722,
            "unit": "ms",
            "extra": "n=5809"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 5.46,
            "unit": "ms",
            "extra": "n=5809"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "819383e719d84d5cdae75d74f768ea38c2a9ddd8",
          "message": "Merge pull request #112 from thesoftwarebakery/worktree-on-gateway-error\n\nfeat: add on_gateway_error global interceptor hook",
          "timestamp": "2026-04-27T21:33:53+01:00",
          "tree_id": "dfdc059e43d5c8913e8c446362cc29a744e2feb7",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/819383e719d84d5cdae75d74f768ea38c2a9ddd8"
        },
        "date": 1777322425572,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 1.462,
            "unit": "ms",
            "extra": "n=6839"
          },
          {
            "name": "passthrough p99 latency",
            "value": 9.327,
            "unit": "ms",
            "extra": "n=6839"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.385,
            "unit": "ms",
            "extra": "n=7218"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 6.71,
            "unit": "ms",
            "extra": "n=7218"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.62,
            "unit": "ms",
            "extra": "n=6173"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 6.202,
            "unit": "ms",
            "extra": "n=6173"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.728,
            "unit": "ms",
            "extra": "n=5788"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 6.208,
            "unit": "ms",
            "extra": "n=5788"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3a2653667b3b0d02165025e9286427e4c159fc87",
          "message": "Merge pull request #119 from thesoftwarebakery/worktree-multi-platform-docker\n\nci: multi-platform Docker builds and fix Cargo.lock on release",
          "timestamp": "2026-04-28T19:15:34+01:00",
          "tree_id": "5abb03980e2e10d73c109402afd37ee8e2bb49e7",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/3a2653667b3b0d02165025e9286427e4c159fc87"
        },
        "date": 1777400406339,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.687,
            "unit": "ms",
            "extra": "n=14558"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.616,
            "unit": "ms",
            "extra": "n=14558"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.808,
            "unit": "ms",
            "extra": "n=12381"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.49,
            "unit": "ms",
            "extra": "n=12381"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.019,
            "unit": "ms",
            "extra": "n=9815"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.545,
            "unit": "ms",
            "extra": "n=9815"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.081,
            "unit": "ms",
            "extra": "n=9251"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.545,
            "unit": "ms",
            "extra": "n=9251"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0d15f56baec90f9807f5cc7bb4198db82743312d",
          "message": "Merge pull request #117 from thesoftwarebakery/worktree-on-request-headers\n\nfeat: add on_request_headers interceptor hook",
          "timestamp": "2026-04-28T20:52:00+01:00",
          "tree_id": "aeb6fbbf95e76a09834d299a3cfd2a62e47f6fc4",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/0d15f56baec90f9807f5cc7bb4198db82743312d"
        },
        "date": 1777406196722,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.788,
            "unit": "ms",
            "extra": "n=12685"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.806,
            "unit": "ms",
            "extra": "n=12685"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.876,
            "unit": "ms",
            "extra": "n=11418"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.753,
            "unit": "ms",
            "extra": "n=11418"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.282,
            "unit": "ms",
            "extra": "n=7801"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.031,
            "unit": "ms",
            "extra": "n=7801"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.224,
            "unit": "ms",
            "extra": "n=8167"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.88,
            "unit": "ms",
            "extra": "n=8167"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "george@bakes.software",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "george@bakes.software",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "distinct": true,
          "id": "b9b25d7763c11f9e39aadbd094d4cb173f41db15",
          "message": "ci: use github app for release",
          "timestamp": "2026-04-28T21:38:20+01:00",
          "tree_id": "be80dde215cf8f8f79ed6d5fd4bfcd34dfad3869",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/b9b25d7763c11f9e39aadbd094d4cb173f41db15"
        },
        "date": 1777408915961,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.739,
            "unit": "ms",
            "extra": "n=13524"
          },
          {
            "name": "passthrough p99 latency",
            "value": 1.638,
            "unit": "ms",
            "extra": "n=13524"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.847,
            "unit": "ms",
            "extra": "n=11801"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.541,
            "unit": "ms",
            "extra": "n=11801"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.211,
            "unit": "ms",
            "extra": "n=8255"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.575,
            "unit": "ms",
            "extra": "n=8255"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.165,
            "unit": "ms",
            "extra": "n=8582"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.508,
            "unit": "ms",
            "extra": "n=8582"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0cbcebeef89344553bebe54e2c7ea5542097155c",
          "message": "Merge pull request #120 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.11.0",
          "timestamp": "2026-04-28T21:41:24+01:00",
          "tree_id": "4a85261e72115d4cda9d49f5ceb4691ef9f2c3f9",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/0cbcebeef89344553bebe54e2c7ea5542097155c"
        },
        "date": 1777409446539,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.573,
            "unit": "ms",
            "extra": "n=17452"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.283,
            "unit": "ms",
            "extra": "n=17452"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.675,
            "unit": "ms",
            "extra": "n=14820"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.539,
            "unit": "ms",
            "extra": "n=14820"
          },
          {
            "name": "all-hooks mean latency",
            "value": 0.967,
            "unit": "ms",
            "extra": "n=10343"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.92,
            "unit": "ms",
            "extra": "n=10343"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 0.889,
            "unit": "ms",
            "extra": "n=11250"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 2.835,
            "unit": "ms",
            "extra": "n=11250"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a9cb407b65ba3871460ff3759b7d5fe37f1d2900",
          "message": "Merge pull request #114 from thesoftwarebakery/worktree-rate-limiting\n\nfeat: add per-identity rate limiting",
          "timestamp": "2026-04-28T22:54:10+01:00",
          "tree_id": "bed83dccaf5a41e90ad92c36aece8c26b9324623",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/a9cb407b65ba3871460ff3759b7d5fe37f1d2900"
        },
        "date": 1777413735838,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.833,
            "unit": "ms",
            "extra": "n=11999"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.248,
            "unit": "ms",
            "extra": "n=11999"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.919,
            "unit": "ms",
            "extra": "n=10884"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.408,
            "unit": "ms",
            "extra": "n=10884"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.341,
            "unit": "ms",
            "extra": "n=7458"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.7,
            "unit": "ms",
            "extra": "n=7458"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.211,
            "unit": "ms",
            "extra": "n=8259"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 2.926,
            "unit": "ms",
            "extra": "n=8259"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c0879814bf7a7f5fbb20bea6b1b1d0d1fc000ac4",
          "message": "Merge pull request #123 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.12.0",
          "timestamp": "2026-04-28T23:06:29+01:00",
          "tree_id": "919de306f1cf819c276689a72b1c6c272e13971d",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/c0879814bf7a7f5fbb20bea6b1b1d0d1fc000ac4"
        },
        "date": 1777414268999,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.802,
            "unit": "ms",
            "extra": "n=12462"
          },
          {
            "name": "passthrough p99 latency",
            "value": 1.799,
            "unit": "ms",
            "extra": "n=12462"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.922,
            "unit": "ms",
            "extra": "n=10843"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.078,
            "unit": "ms",
            "extra": "n=10843"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.338,
            "unit": "ms",
            "extra": "n=7473"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.812,
            "unit": "ms",
            "extra": "n=7473"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.233,
            "unit": "ms",
            "extra": "n=8112"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.571,
            "unit": "ms",
            "extra": "n=8112"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f665d41f95d6b89c79e6e8ea5e5816acae18604d",
          "message": "Merge pull request #124 from thesoftwarebakery/worktree-rust-cleanup\n\nfix: remove unnecessary clones and improve idiomatic Rust patterns",
          "timestamp": "2026-04-29T18:15:49+01:00",
          "tree_id": "b7a308b0e140245f2a48091d4afbf600f0c9f9d6",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/f665d41f95d6b89c79e6e8ea5e5816acae18604d"
        },
        "date": 1777483209065,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.756,
            "unit": "ms",
            "extra": "n=13222"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.539,
            "unit": "ms",
            "extra": "n=13222"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.867,
            "unit": "ms",
            "extra": "n=11531"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.333,
            "unit": "ms",
            "extra": "n=11531"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.233,
            "unit": "ms",
            "extra": "n=8110"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.852,
            "unit": "ms",
            "extra": "n=8110"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.176,
            "unit": "ms",
            "extra": "n=8506"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.53,
            "unit": "ms",
            "extra": "n=8506"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ee05913e78d39cf7e8d9293ff8d5ace7608fcc2e",
          "message": "Merge pull request #125 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.12.1",
          "timestamp": "2026-04-29T18:52:51+01:00",
          "tree_id": "e5d31c4f03570a3b52ca8fee9892cec0894b594a",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/ee05913e78d39cf7e8d9293ff8d5ace7608fcc2e"
        },
        "date": 1777485469414,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.786,
            "unit": "ms",
            "extra": "n=12733"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.149,
            "unit": "ms",
            "extra": "n=12733"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.892,
            "unit": "ms",
            "extra": "n=11217"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.309,
            "unit": "ms",
            "extra": "n=11217"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.262,
            "unit": "ms",
            "extra": "n=7924"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.4,
            "unit": "ms",
            "extra": "n=7924"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.169,
            "unit": "ms",
            "extra": "n=8555"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.477,
            "unit": "ms",
            "extra": "n=8555"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bcdc9bef1a172e3201310439aedba2e4564e8a65",
          "message": "Merge pull request #126 from thesoftwarebakery/docs-quickstart-and-readme\n\ndocs: add quickstart guide and getting-started example",
          "timestamp": "2026-04-29T19:13:52+01:00",
          "tree_id": "d4e95652f1df78775ac2f6f959398a25cf9ddcdf",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/bcdc9bef1a172e3201310439aedba2e4564e8a65"
        },
        "date": 1777486639435,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.84,
            "unit": "ms",
            "extra": "n=11900"
          },
          {
            "name": "passthrough p99 latency",
            "value": 1.699,
            "unit": "ms",
            "extra": "n=11900"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.944,
            "unit": "ms",
            "extra": "n=10589"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.617,
            "unit": "ms",
            "extra": "n=10589"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.387,
            "unit": "ms",
            "extra": "n=7209"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.03,
            "unit": "ms",
            "extra": "n=7209"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.232,
            "unit": "ms",
            "extra": "n=8122"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.574,
            "unit": "ms",
            "extra": "n=8122"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3bde6b2f77fba080f27db0215eb93458ced6afb7",
          "message": "Merge pull request #128 from thesoftwarebakery/worktree-issue-127-404\n\nfix: return 404 for unmatched routes instead of 502",
          "timestamp": "2026-04-29T19:53:14+01:00",
          "tree_id": "e09abe9e7f89d092ca5ed88a4be4db04ca0daf51",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/3bde6b2f77fba080f27db0215eb93458ced6afb7"
        },
        "date": 1777489065768,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.817,
            "unit": "ms",
            "extra": "n=12245"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.597,
            "unit": "ms",
            "extra": "n=12245"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.929,
            "unit": "ms",
            "extra": "n=10762"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.501,
            "unit": "ms",
            "extra": "n=10762"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.349,
            "unit": "ms",
            "extra": "n=7416"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.463,
            "unit": "ms",
            "extra": "n=7416"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.224,
            "unit": "ms",
            "extra": "n=8174"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.616,
            "unit": "ms",
            "extra": "n=8174"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "75885dd005594db1050740ea102209901e155697",
          "message": "Merge pull request #130 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.12.2",
          "timestamp": "2026-04-29T20:59:02+01:00",
          "tree_id": "e85b09d3fb8766fb5a7241e85f545dedf5b3deaa",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/75885dd005594db1050740ea102209901e155697"
        },
        "date": 1777493016008,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.806,
            "unit": "ms",
            "extra": "n=12404"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.406,
            "unit": "ms",
            "extra": "n=12404"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.91,
            "unit": "ms",
            "extra": "n=10992"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.538,
            "unit": "ms",
            "extra": "n=10992"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.277,
            "unit": "ms",
            "extra": "n=7831"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.73,
            "unit": "ms",
            "extra": "n=7831"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.194,
            "unit": "ms",
            "extra": "n=8373"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.748,
            "unit": "ms",
            "extra": "n=8373"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "24b01d9b76da816d9bf948f99cb977cdce3769dc",
          "message": "Merge pull request #134 from thesoftwarebakery/worktree-issue-131-head-support\n\nfeat: implicit HEAD support and 405 for unmatched methods",
          "timestamp": "2026-04-29T22:27:40+01:00",
          "tree_id": "10e66817803a76947401c5b1c952b980269a0dcc",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/24b01d9b76da816d9bf948f99cb977cdce3769dc"
        },
        "date": 1777498333605,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.809,
            "unit": "ms",
            "extra": "n=12354"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.965,
            "unit": "ms",
            "extra": "n=12354"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.905,
            "unit": "ms",
            "extra": "n=11056"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.859,
            "unit": "ms",
            "extra": "n=11056"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.343,
            "unit": "ms",
            "extra": "n=7449"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.661,
            "unit": "ms",
            "extra": "n=7449"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.289,
            "unit": "ms",
            "extra": "n=7761"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 4.195,
            "unit": "ms",
            "extra": "n=7761"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "3245509+georgewaters@users.noreply.github.com",
            "name": "George Waters",
            "username": "georgewaters"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4dff3b05022d1e3ccae86db4825d0540f25434d0",
          "message": "Merge pull request #135 from thesoftwarebakery/worktree-issue-133-auto-validation\n\nfeat: validation interceptors read schemas from OpenAPI spec",
          "timestamp": "2026-04-29T22:44:15+01:00",
          "tree_id": "0e0db9853cf45974e338d7159a473952eedc3ecb",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/4dff3b05022d1e3ccae86db4825d0540f25434d0"
        },
        "date": 1777499314954,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.844,
            "unit": "ms",
            "extra": "n=11858"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.24,
            "unit": "ms",
            "extra": "n=11858"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.944,
            "unit": "ms",
            "extra": "n=10593"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.225,
            "unit": "ms",
            "extra": "n=10593"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.419,
            "unit": "ms",
            "extra": "n=7047"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.958,
            "unit": "ms",
            "extra": "n=7047"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.176,
            "unit": "ms",
            "extra": "n=8500"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.387,
            "unit": "ms",
            "extra": "n=8500"
          }
        ]
      }
    ]
  }
}