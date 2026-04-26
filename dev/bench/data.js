window.BENCHMARK_DATA = {
  "lastUpdate": 1777236601776,
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
      }
    ]
  }
}