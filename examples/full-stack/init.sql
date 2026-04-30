CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO items (name, description) VALUES
  ('Widget', 'A standard widget'),
  ('Gadget', 'A fancy gadget'),
  ('Doohickey', 'An essential doohickey');
