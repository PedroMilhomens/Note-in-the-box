CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  institution text,
  course text,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique
  ON users (lower(email))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  professor_name text,
  invite_code text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS class_members (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);

CREATE INDEX IF NOT EXISTS class_members_user_id_idx ON class_members(user_id);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (class_id, owner_id)
);

CREATE INDEX IF NOT EXISTS branches_class_id_idx ON branches(class_id);
CREATE INDEX IF NOT EXISTS branches_owner_id_idx ON branches(owner_id);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  lesson_date date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'complete', 'incomplete')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS notes_branch_id_idx ON notes(branch_id);

CREATE TABLE IF NOT EXISTS note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  body text NOT NULL
);

CREATE INDEX IF NOT EXISTS note_versions_note_id_idx ON note_versions(note_id);

CREATE TABLE IF NOT EXISTS note_links (
  from_note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  to_note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (from_note_id, to_note_id),
  CHECK (from_note_id <> to_note_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_key text NOT NULL
);

CREATE INDEX IF NOT EXISTS attachments_note_id_idx ON attachments(note_id);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id),
  body text NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS comments_note_id_idx ON comments(note_id);
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON comments(author_id);

CREATE TABLE IF NOT EXISTS forum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS forum_topics_class_id_idx ON forum_topics(class_id);
CREATE INDEX IF NOT EXISTS forum_topics_author_id_idx ON forum_topics(author_id);

CREATE TABLE IF NOT EXISTS forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  topic_id uuid NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id),
  body text NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS forum_posts_topic_id_idx ON forum_posts(topic_id);
CREATE INDEX IF NOT EXISTS forum_posts_author_id_idx ON forum_posts(author_id);

CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL
);

CREATE INDEX IF NOT EXISTS flashcards_class_id_idx ON flashcards(class_id);
CREATE INDEX IF NOT EXISTS flashcards_owner_id_idx ON flashcards(owner_id);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  card_id uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('errei', 'dificil', 'bom', 'facil')),
  next_due_at timestamptz NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('foco', 'pausa', 'longa')),
  started_at timestamptz NOT NULL,
  duration_s integer NOT NULL,
  completed boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS pomodoro_sessions_user_id_idx ON pomodoro_sessions(user_id);
CREATE INDEX IF NOT EXISTS pomodoro_sessions_class_id_idx ON pomodoro_sessions(class_id);

CREATE TABLE IF NOT EXISTS consents (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('termos', 'privacidade')),
  version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS consents_user_id_idx ON consents(user_id);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reporter_id uuid REFERENCES users(id),
  target_type text NOT NULL CHECK (target_type IN ('note', 'comment', 'topic', 'post')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS reports_reporter_id_idx ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_type, target_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id uuid
);
