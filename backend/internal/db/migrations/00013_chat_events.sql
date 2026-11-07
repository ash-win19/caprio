-- +goose Up
-- App-written entries in a day's conversation (the opener, discard and save
-- markers). The model never writes them; they reach it as short notes.
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_role_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant', 'event'));
ALTER TABLE chat_messages ADD COLUMN event_type TEXT CHECK (event_type IN ('opener', 'plan_update', 'discarded', 'plan_saved', 'rebase_note'));
ALTER TABLE chat_messages ADD COLUMN metadata JSONB;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_event_role_check CHECK ((role = 'event') = (event_type IS NOT NULL));

-- +goose Down
DELETE FROM chat_messages WHERE role = 'event';
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_event_role_check;
ALTER TABLE chat_messages DROP COLUMN metadata;
ALTER TABLE chat_messages DROP COLUMN event_type;
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_role_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant'));
