CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES
  ('Alice', 'alice@example.com'),
  ('Bob', 'bob@example.com'),
  ('Charlie', 'charlie@example.com');

INSERT INTO posts (user_id, title, body) VALUES
  (1, 'Getting Started with Plenum', 'An introduction to the OpenAPI-first API gateway.'),
  (1, 'Advanced Overlays', 'How to compose multiple overlays for different environments.'),
  (2, 'Database Plugins', 'Using the internal:postgres plugin for CRUD APIs.');

INSERT INTO comments (post_id, author_name, body) VALUES
  (1, 'Bob', 'Great introduction!'),
  (1, 'Charlie', 'Very helpful, thanks.'),
  (2, 'Bob', 'Looking forward to trying this.'),
  (3, 'Alice', 'Nice write-up!');
