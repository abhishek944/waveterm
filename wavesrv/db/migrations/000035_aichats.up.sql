CREATE TABLE IF NOT EXISTS ai_chat (
    chatid varchar(36) PRIMARY KEY,
    createdts bigint NOT NULL,
    updatedts bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_message (
    messageid varchar(36) PRIMARY KEY,
    chatid varchar(36) NOT NULL,
    role varchar(10) NOT NULL CHECK (role IN ('user', 'ai')),
    content text NOT NULL,
    createdts bigint NOT NULL,
    FOREIGN KEY (chatid) REFERENCES ai_chat(chatid) ON DELETE CASCADE
);

CREATE INDEX idx_ai_message_chatid ON ai_message(chatid);
CREATE INDEX idx_ai_message_createdts ON ai_message(createdts);