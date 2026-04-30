# REST Database API

A complete CRUD REST API backed by PostgreSQL, built entirely with configuration — no custom code needed.

## What it demonstrates

- `internal:postgres` plugin for database-backed APIs
- `x-plenum-backend` with parameterised SQL queries (`$1`, `$2`, ...)
- `${{path.*}}`, `${{query.*}}`, and `${{body.*}}` token resolution in `params`
- Field mapping (`snake_case` columns to `camelCase` JSON)
- Pagination via query parameters (`limit`, `offset`)
- 404 handling with `returns: "/0"` (returns first row or 404)
- Joins via foreign key relationships (`/users/{id}/posts`)
- Cascade deletes

## Data model

```
users (id, name, email, created_at)
  └── posts (id, user_id, title, body, created_at)
        └── comments (id, post_id, author_name, body, created_at)
```

## Setup

No build step needed — this example uses only the built-in postgres plugin.

```bash
docker compose up -d
```

## Try it out

### Users

List all users (with pagination):

```bash
curl http://localhost:6188/users
curl 'http://localhost:6188/users?limit=1&offset=1'
```

Get a single user:

```bash
curl http://localhost:6188/users/1
```

Create a user:

```bash
curl -X POST http://localhost:6188/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Diana","email":"diana@example.com"}'
```

Update a user:

```bash
curl -X PUT http://localhost:6188/users/4 \
  -H "Content-Type: application/json" \
  -d '{"name":"Diana Prince","email":"diana@example.com"}'
```

Delete a user (cascades to posts and comments):

```bash
curl -X DELETE http://localhost:6188/users/4
```

### Posts

List all posts:

```bash
curl http://localhost:6188/posts
```

List posts by a specific user (join):

```bash
curl http://localhost:6188/users/1/posts
```

Create a post:

```bash
curl -X POST http://localhost:6188/posts \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"title":"New Post","body":"Post content here"}'
```

### Comments

List comments on a post:

```bash
curl http://localhost:6188/posts/1/comments
```

Add a comment:

```bash
curl -X POST http://localhost:6188/posts/1/comments \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Alice","body":"Great post!"}'
```

### 404 handling

```bash
curl http://localhost:6188/users/999
# → {"error":"not found"}
```

## Cleanup

```bash
docker compose down
```
