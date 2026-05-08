window.BENCHMARK_DATA = {
  "lastUpdate": 1778257997444,
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
          "id": "3bf57a40086bfb00ce4d24bfdc66d02024aff6d9",
          "message": "Merge pull request #136 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.13.0",
          "timestamp": "2026-04-29T22:44:25+01:00",
          "tree_id": "d1a0e45381b15eb2af5c32edefb139eace8f6e73",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/3bf57a40086bfb00ce4d24bfdc66d02024aff6d9"
        },
        "date": 1777499349374,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.903,
            "unit": "ms",
            "extra": "n=11077"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.65,
            "unit": "ms",
            "extra": "n=11077"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.979,
            "unit": "ms",
            "extra": "n=10218"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.345,
            "unit": "ms",
            "extra": "n=10218"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.434,
            "unit": "ms",
            "extra": "n=6974"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.806,
            "unit": "ms",
            "extra": "n=6974"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.266,
            "unit": "ms",
            "extra": "n=7901"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.752,
            "unit": "ms",
            "extra": "n=7901"
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
          "id": "e305989fbbf10c1ff7074f2794d0f76dd7a0b26e",
          "message": "Merge pull request #138 from thesoftwarebakery/fix/cargo-lock\n\nfix: update Cargo.lock",
          "timestamp": "2026-04-29T23:10:53+01:00",
          "tree_id": "d30d52f28135395610e0a7e3c86af0c0847db70d",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/e305989fbbf10c1ff7074f2794d0f76dd7a0b26e"
        },
        "date": 1777501119097,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.802,
            "unit": "ms",
            "extra": "n=12472"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.07,
            "unit": "ms",
            "extra": "n=12472"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.903,
            "unit": "ms",
            "extra": "n=11070"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.98,
            "unit": "ms",
            "extra": "n=11070"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.31,
            "unit": "ms",
            "extra": "n=7631"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.769,
            "unit": "ms",
            "extra": "n=7631"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.203,
            "unit": "ms",
            "extra": "n=8316"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.642,
            "unit": "ms",
            "extra": "n=8316"
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
          "id": "16cff4dab89054abd745247d85ee87b4ba9d29b1",
          "message": "Merge pull request #143 from thesoftwarebakery/worktree-issue-139-universal-interpolation\n\nfeat: universal boot-time interpolation with ${{ env.* }} and ${{ file.* }}",
          "timestamp": "2026-04-30T11:26:41+01:00",
          "tree_id": "cc7e74c900ad5d4de6e776424f5c5cf104d93eef",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/16cff4dab89054abd745247d85ee87b4ba9d29b1"
        },
        "date": 1777545269319,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.775,
            "unit": "ms",
            "extra": "n=12899"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.31,
            "unit": "ms",
            "extra": "n=12899"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.876,
            "unit": "ms",
            "extra": "n=11420"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.8,
            "unit": "ms",
            "extra": "n=11420"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.258,
            "unit": "ms",
            "extra": "n=7952"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.992,
            "unit": "ms",
            "extra": "n=7952"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.199,
            "unit": "ms",
            "extra": "n=8339"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.727,
            "unit": "ms",
            "extra": "n=8339"
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
          "id": "0600861adbe1a52243ca1878da3f3fd8faffe08c",
          "message": "Merge pull request #144 from thesoftwarebakery/release-please--branches--main--components--plenum-core\n\nchore(main): release 0.14.0",
          "timestamp": "2026-04-30T11:39:54+01:00",
          "tree_id": "9c3bad9699e0a9639eefd618a6937a4a8f573e21",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/0600861adbe1a52243ca1878da3f3fd8faffe08c"
        },
        "date": 1777545874502,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.755,
            "unit": "ms",
            "extra": "n=13252"
          },
          {
            "name": "passthrough p99 latency",
            "value": 1.491,
            "unit": "ms",
            "extra": "n=13252"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.872,
            "unit": "ms",
            "extra": "n=11474"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.804,
            "unit": "ms",
            "extra": "n=11474"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.252,
            "unit": "ms",
            "extra": "n=7986"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.547,
            "unit": "ms",
            "extra": "n=7986"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.143,
            "unit": "ms",
            "extra": "n=8751"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.352,
            "unit": "ms",
            "extra": "n=8751"
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
          "id": "415ea5ae9556c7bd01f391703e2d7d45e05f31ba",
          "message": "Merge pull request #137 from thesoftwarebakery/worktree-docs-feature-guides\n\ndocs: feature guides and examples",
          "timestamp": "2026-04-30T14:10:13+01:00",
          "tree_id": "6c19eb07b577c087e6b17989e33cb3fee157fefd",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/415ea5ae9556c7bd01f391703e2d7d45e05f31ba"
        },
        "date": 1777554826486,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.814,
            "unit": "ms",
            "extra": "n=12285"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.092,
            "unit": "ms",
            "extra": "n=12285"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.901,
            "unit": "ms",
            "extra": "n=11101"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.705,
            "unit": "ms",
            "extra": "n=11101"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.323,
            "unit": "ms",
            "extra": "n=7561"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.673,
            "unit": "ms",
            "extra": "n=7561"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.186,
            "unit": "ms",
            "extra": "n=8434"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.34,
            "unit": "ms",
            "extra": "n=8434"
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
          "id": "6bed8f6c2174ba45b8eaad37e1c88dbac0786c10",
          "message": "Merge pull request #145 from thesoftwarebakery/fix/release-please-workflow\n\nfix: release-please triggers on all workspace changes",
          "timestamp": "2026-04-30T14:17:55+01:00",
          "tree_id": "85332c5745818c14e89a9bf21d6c6cf3cbef5057",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/6bed8f6c2174ba45b8eaad37e1c88dbac0786c10"
        },
        "date": 1777555290162,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.598,
            "unit": "ms",
            "extra": "n=16723"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.86,
            "unit": "ms",
            "extra": "n=16723"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.685,
            "unit": "ms",
            "extra": "n=14603"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.862,
            "unit": "ms",
            "extra": "n=14603"
          },
          {
            "name": "all-hooks mean latency",
            "value": 0.981,
            "unit": "ms",
            "extra": "n=10191"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.23,
            "unit": "ms",
            "extra": "n=10191"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 0.909,
            "unit": "ms",
            "extra": "n=10998"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 2.646,
            "unit": "ms",
            "extra": "n=10998"
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
          "id": "5dcf903bd5084670b1bb18a2bc9d0d184fb0ebda",
          "message": "Merge pull request #150 from thesoftwarebakery/worktree-fix-release-please\n\nfix: idiomatic cargo-workspace release-please config",
          "timestamp": "2026-04-30T15:03:38+01:00",
          "tree_id": "05c3e1bb94d6b62c7edfbc0223613c9ec70b7a2d",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/5dcf903bd5084670b1bb18a2bc9d0d184fb0ebda"
        },
        "date": 1777558049361,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.588,
            "unit": "ms",
            "extra": "n=17013"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.655,
            "unit": "ms",
            "extra": "n=17013"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.687,
            "unit": "ms",
            "extra": "n=14551"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.703,
            "unit": "ms",
            "extra": "n=14551"
          },
          {
            "name": "all-hooks mean latency",
            "value": 0.987,
            "unit": "ms",
            "extra": "n=10136"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.707,
            "unit": "ms",
            "extra": "n=10136"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 0.9,
            "unit": "ms",
            "extra": "n=11112"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 2.418,
            "unit": "ms",
            "extra": "n=11112"
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
          "id": "1f47c64267be4b7a82934d60f81b6101255a1089",
          "message": "Merge pull request #154 from thesoftwarebakery/worktree-fix-release-auto-merge\n\nfix: use --auto merge for release PRs",
          "timestamp": "2026-04-30T15:50:33+01:00",
          "tree_id": "02242738ff6ebd4ddf8fb3dcc00f7cd53394b704",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/1f47c64267be4b7a82934d60f81b6101255a1089"
        },
        "date": 1777560840514,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.821,
            "unit": "ms",
            "extra": "n=12185"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.054,
            "unit": "ms",
            "extra": "n=12185"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.924,
            "unit": "ms",
            "extra": "n=10826"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.656,
            "unit": "ms",
            "extra": "n=10826"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.38,
            "unit": "ms",
            "extra": "n=7249"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.061,
            "unit": "ms",
            "extra": "n=7249"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.272,
            "unit": "ms",
            "extra": "n=7862"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.722,
            "unit": "ms",
            "extra": "n=7862"
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
          "id": "896739161a721fe584d291ceeed55ce1dd6a1b8e",
          "message": "Merge pull request #152 from thesoftwarebakery/release-please--branches--main\n\nchore: release main",
          "timestamp": "2026-04-30T15:58:30+01:00",
          "tree_id": "876867044bf87e84790a7d8640716172a157e7be",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/896739161a721fe584d291ceeed55ce1dd6a1b8e"
        },
        "date": 1777561427464,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.6,
            "unit": "ms",
            "extra": "n=16675"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.727,
            "unit": "ms",
            "extra": "n=16675"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.693,
            "unit": "ms",
            "extra": "n=14422"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.855,
            "unit": "ms",
            "extra": "n=14422"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.006,
            "unit": "ms",
            "extra": "n=9950"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.139,
            "unit": "ms",
            "extra": "n=9950"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 0.95,
            "unit": "ms",
            "extra": "n=10528"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.187,
            "unit": "ms",
            "extra": "n=10528"
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
          "id": "fb8f19f36dd367926e105257d3e7e3ad18b33338",
          "message": "Merge pull request #153 from thesoftwarebakery/worktree-issue-149-tls-file-descriptors\n\nfeat!: file descriptor accessors + TLS field rename",
          "timestamp": "2026-04-30T16:00:58+01:00",
          "tree_id": "bd6a31ff43671e3f824f23366959dcce94bc49da",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/fb8f19f36dd367926e105257d3e7e3ad18b33338"
        },
        "date": 1777561593243,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.867,
            "unit": "ms",
            "extra": "n=11540"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.46,
            "unit": "ms",
            "extra": "n=11540"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.979,
            "unit": "ms",
            "extra": "n=10219"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.407,
            "unit": "ms",
            "extra": "n=10219"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.405,
            "unit": "ms",
            "extra": "n=7120"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.789,
            "unit": "ms",
            "extra": "n=7120"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.229,
            "unit": "ms",
            "extra": "n=8134"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.726,
            "unit": "ms",
            "extra": "n=8134"
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
          "id": "89433b560240ff3014e114bd401d2a2f1cd9def5",
          "message": "Merge pull request #155 from thesoftwarebakery/worktree-issue-151-query-params\n\nfeat: queryParams parsing + safe DB parameterization",
          "timestamp": "2026-04-30T21:37:34+01:00",
          "tree_id": "c12ce9c2c8931c62886da3829ab43ed9131e44f9",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/89433b560240ff3014e114bd401d2a2f1cd9def5"
        },
        "date": 1777581934564,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.869,
            "unit": "ms",
            "extra": "n=11502"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.595,
            "unit": "ms",
            "extra": "n=11502"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 1.005,
            "unit": "ms",
            "extra": "n=9950"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.701,
            "unit": "ms",
            "extra": "n=9950"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.412,
            "unit": "ms",
            "extra": "n=7085"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.676,
            "unit": "ms",
            "extra": "n=7085"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.228,
            "unit": "ms",
            "extra": "n=8143"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.558,
            "unit": "ms",
            "extra": "n=8143"
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
          "id": "454ee900474b9f5905c5192e1e71bb3e82f5a376",
          "message": "Merge pull request #156 from thesoftwarebakery/release-please--branches--main\n\nchore: release main",
          "timestamp": "2026-04-30T22:02:04+01:00",
          "tree_id": "6c3ba490951d3cf53e13c51224bda61a5f11c45c",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/454ee900474b9f5905c5192e1e71bb3e82f5a376"
        },
        "date": 1777583205098,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.85,
            "unit": "ms",
            "extra": "n=11767"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.248,
            "unit": "ms",
            "extra": "n=11767"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.936,
            "unit": "ms",
            "extra": "n=10684"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.972,
            "unit": "ms",
            "extra": "n=10684"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.401,
            "unit": "ms",
            "extra": "n=7141"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.498,
            "unit": "ms",
            "extra": "n=7141"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.197,
            "unit": "ms",
            "extra": "n=8353"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.379,
            "unit": "ms",
            "extra": "n=8353"
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
          "id": "ddb7aed01728c19b83510bc20cbf763fbcffe824",
          "message": "Merge pull request #159 from thesoftwarebakery/worktree-issue-148-examples\n\nfeat: full-featured example scenarios",
          "timestamp": "2026-05-01T13:06:19+01:00",
          "tree_id": "7f33f83cb189c2f8d82dc63bb31045235559f7a9",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/ddb7aed01728c19b83510bc20cbf763fbcffe824"
        },
        "date": 1777637383927,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.761,
            "unit": "ms",
            "extra": "n=13149"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.926,
            "unit": "ms",
            "extra": "n=13149"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.88,
            "unit": "ms",
            "extra": "n=11361"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.086,
            "unit": "ms",
            "extra": "n=11361"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.235,
            "unit": "ms",
            "extra": "n=8098"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.925,
            "unit": "ms",
            "extra": "n=8098"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.177,
            "unit": "ms",
            "extra": "n=8499"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.803,
            "unit": "ms",
            "extra": "n=8499"
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
          "id": "627a6545a7ab265b8b3f20e15af87a4575b9fce2",
          "message": "Merge pull request #161 from thesoftwarebakery/worktree-issue-129-docs-readmes\n\ndocs: add README to all examples and create TLS example",
          "timestamp": "2026-05-05T17:26:50+01:00",
          "tree_id": "c5fb7c6ccb4d922f5a24aeb0a101acd46c80881f",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/627a6545a7ab265b8b3f20e15af87a4575b9fce2"
        },
        "date": 1777998624545,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.763,
            "unit": "ms",
            "extra": "n=13102"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.698,
            "unit": "ms",
            "extra": "n=13102"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.862,
            "unit": "ms",
            "extra": "n=11606"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.673,
            "unit": "ms",
            "extra": "n=11606"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.237,
            "unit": "ms",
            "extra": "n=8088"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.446,
            "unit": "ms",
            "extra": "n=8088"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.196,
            "unit": "ms",
            "extra": "n=8361"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.828,
            "unit": "ms",
            "extra": "n=8361"
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
          "id": "13577dcb58fb00c57732f2deff2f759b3a3e087d",
          "message": "Merge pull request #163 from thesoftwarebakery/worktree-issue-141-plenum-config\n\nrefactor: extract OpenAPI config parsing into plenum-config crate",
          "timestamp": "2026-05-07T10:21:02+01:00",
          "tree_id": "0ee2ed544bc547d4983ba1ca451ff75dcaa2902c",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/13577dcb58fb00c57732f2deff2f759b3a3e087d"
        },
        "date": 1778146175890,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.833,
            "unit": "ms",
            "extra": "n=12006"
          },
          {
            "name": "passthrough p99 latency",
            "value": 1.991,
            "unit": "ms",
            "extra": "n=12006"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.926,
            "unit": "ms",
            "extra": "n=10803"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.655,
            "unit": "ms",
            "extra": "n=10803"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.392,
            "unit": "ms",
            "extra": "n=7186"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.739,
            "unit": "ms",
            "extra": "n=7186"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.296,
            "unit": "ms",
            "extra": "n=7715"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.614,
            "unit": "ms",
            "extra": "n=7715"
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
          "id": "36dc41b478cb63836a1bcb2d9889f27e6fab8fec",
          "message": "Merge pull request #165 from thesoftwarebakery/worktree-issue-37-otel-tracing\n\nfeat: OpenTelemetry tracing and configurable access logs",
          "timestamp": "2026-05-07T17:33:19+01:00",
          "tree_id": "4ef36772afeccb2455f390b76326b81c8e833037",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/36dc41b478cb63836a1bcb2d9889f27e6fab8fec"
        },
        "date": 1778172128450,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.776,
            "unit": "ms",
            "extra": "n=12879"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.235,
            "unit": "ms",
            "extra": "n=12879"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.871,
            "unit": "ms",
            "extra": "n=11476"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.655,
            "unit": "ms",
            "extra": "n=11476"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.235,
            "unit": "ms",
            "extra": "n=8097"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.596,
            "unit": "ms",
            "extra": "n=8097"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.197,
            "unit": "ms",
            "extra": "n=8357"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.345,
            "unit": "ms",
            "extra": "n=8357"
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
          "id": "8560548c7549044da5714939212a512458785638",
          "message": "Merge pull request #166 from thesoftwarebakery/worktree-issue-162-upstream-improvements\n\nfeat: x-plenum-upstream improvements",
          "timestamp": "2026-05-08T12:43:18+01:00",
          "tree_id": "dcf39f254882b4dc5da50e6fa262514b93f4e1cb",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/8560548c7549044da5714939212a512458785638"
        },
        "date": 1778240873656,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.824,
            "unit": "ms",
            "extra": "n=12130"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.045,
            "unit": "ms",
            "extra": "n=12130"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.955,
            "unit": "ms",
            "extra": "n=10470"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.292,
            "unit": "ms",
            "extra": "n=10470"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.323,
            "unit": "ms",
            "extra": "n=7558"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.198,
            "unit": "ms",
            "extra": "n=7558"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.176,
            "unit": "ms",
            "extra": "n=8507"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.418,
            "unit": "ms",
            "extra": "n=8507"
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
          "id": "9035118648de68707785541d74e8cfc5b3639214",
          "message": "Merge pull request #167 from thesoftwarebakery/worktree-issue-121-multi-rate-limit\n\nfeat: support multiple rate limit configurations",
          "timestamp": "2026-05-08T14:45:05+01:00",
          "tree_id": "7d032f96711c83c59a8d1d805afaf1461cb24980",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/9035118648de68707785541d74e8cfc5b3639214"
        },
        "date": 1778248224089,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.894,
            "unit": "ms",
            "extra": "n=11188"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.351,
            "unit": "ms",
            "extra": "n=11188"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.98,
            "unit": "ms",
            "extra": "n=10201"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 3.083,
            "unit": "ms",
            "extra": "n=10201"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.399,
            "unit": "ms",
            "extra": "n=7148"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 3.555,
            "unit": "ms",
            "extra": "n=7148"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.237,
            "unit": "ms",
            "extra": "n=8086"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.58,
            "unit": "ms",
            "extra": "n=8086"
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
          "id": "ba9d0050960212abf29bf78ffde5644af7ea6810",
          "message": "Merge pull request #168 from thesoftwarebakery/worktree-issue-115-standardise-time-format\n\nfeat: standardise duration format across config",
          "timestamp": "2026-05-08T16:51:24+01:00",
          "tree_id": "efae146ec08de1f9b0c9f8adab426383de10cfdf",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/ba9d0050960212abf29bf78ffde5644af7ea6810"
        },
        "date": 1778255766407,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.782,
            "unit": "ms",
            "extra": "n=12787"
          },
          {
            "name": "passthrough p99 latency",
            "value": 3.246,
            "unit": "ms",
            "extra": "n=12787"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.887,
            "unit": "ms",
            "extra": "n=11278"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 1.849,
            "unit": "ms",
            "extra": "n=11278"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.255,
            "unit": "ms",
            "extra": "n=7968"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 2.112,
            "unit": "ms",
            "extra": "n=7968"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.201,
            "unit": "ms",
            "extra": "n=8329"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.653,
            "unit": "ms",
            "extra": "n=8329"
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
          "id": "a32450a798277dfd59dad6e97c313f137de1f7c9",
          "message": "Merge pull request #164 from thesoftwarebakery/release-please--branches--main\n\nchore: release main",
          "timestamp": "2026-05-08T17:28:39+01:00",
          "tree_id": "3cc389c256729a6eb18a588e70e3b0d66a33688b",
          "url": "https://github.com/thesoftwarebakery/plenum/commit/a32450a798277dfd59dad6e97c313f137de1f7c9"
        },
        "date": 1778257997135,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "passthrough mean latency",
            "value": 0.841,
            "unit": "ms",
            "extra": "n=11893"
          },
          {
            "name": "passthrough p99 latency",
            "value": 2.994,
            "unit": "ms",
            "extra": "n=11893"
          },
          {
            "name": "add-header-interceptor mean latency",
            "value": 0.948,
            "unit": "ms",
            "extra": "n=10545"
          },
          {
            "name": "add-header-interceptor p99 latency",
            "value": 2.145,
            "unit": "ms",
            "extra": "n=10545"
          },
          {
            "name": "all-hooks mean latency",
            "value": 1.368,
            "unit": "ms",
            "extra": "n=7311"
          },
          {
            "name": "all-hooks p99 latency",
            "value": 1.812,
            "unit": "ms",
            "extra": "n=7311"
          },
          {
            "name": "response-body-interceptor mean latency",
            "value": 1.231,
            "unit": "ms",
            "extra": "n=8127"
          },
          {
            "name": "response-body-interceptor p99 latency",
            "value": 3.382,
            "unit": "ms",
            "extra": "n=8127"
          }
        ]
      }
    ]
  }
}