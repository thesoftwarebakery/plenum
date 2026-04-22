window.BENCHMARK_DATA = {
  "lastUpdate": 1776858378443,
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
      }
    ]
  }
}