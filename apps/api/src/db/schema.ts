import type Database from "better-sqlite3";

const migrations: Array<{ id: number; name: string; sql: string }> = [
  {
    id: 1,
    name: "initial_local_first_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS app_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        display_name TEXT NOT NULL DEFAULT 'Local Learner',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT OR IGNORE INTO app_profile (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS kanji (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        literal TEXT NOT NULL UNIQUE,
        unicode_codepoint TEXT,
        classical_radical INTEGER,
        stroke_count INTEGER,
        grade INTEGER,
        frequency_rank INTEGER,
        jlpt_level INTEGER,
        on_readings_json TEXT NOT NULL DEFAULT '[]',
        kun_readings_json TEXT NOT NULL DEFAULT '[]',
        nanori_readings_json TEXT NOT NULL DEFAULT '[]',
        meanings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_kanji_literal ON kanji(literal);
      CREATE INDEX IF NOT EXISTS idx_kanji_jlpt ON kanji(jlpt_level);
      CREATE INDEX IF NOT EXISTS idx_kanji_grade ON kanji(grade);
      CREATE INDEX IF NOT EXISTS idx_kanji_frequency ON kanji(frequency_rank);

      CREATE TABLE IF NOT EXISTS dictionary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS entry_kanji (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
        kanji TEXT NOT NULL,
        is_common INTEGER NOT NULL DEFAULT 0,
        priority_tags_json TEXT NOT NULL DEFAULT '[]',
        info_json TEXT NOT NULL DEFAULT '[]',
        kanji_order INTEGER NOT NULL,
        UNIQUE(entry_id, kanji_order)
      );

      CREATE INDEX IF NOT EXISTS idx_entry_kanji_entry_id ON entry_kanji(entry_id);
      CREATE INDEX IF NOT EXISTS idx_entry_kanji_text ON entry_kanji(kanji);

      CREATE TABLE IF NOT EXISTS entry_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
        reading TEXT NOT NULL,
        is_common INTEGER NOT NULL DEFAULT 0,
        priority_tags_json TEXT NOT NULL DEFAULT '[]',
        info_json TEXT NOT NULL DEFAULT '[]',
        reading_order INTEGER NOT NULL,
        UNIQUE(entry_id, reading_order)
      );

      CREATE INDEX IF NOT EXISTS idx_entry_readings_entry_id ON entry_readings(entry_id);
      CREATE INDEX IF NOT EXISTS idx_entry_readings_text ON entry_readings(reading);

      CREATE TABLE IF NOT EXISTS entry_senses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
        sense_order INTEGER NOT NULL,
        parts_of_speech_json TEXT NOT NULL DEFAULT '[]',
        fields_json TEXT NOT NULL DEFAULT '[]',
        misc_json TEXT NOT NULL DEFAULT '[]',
        dialects_json TEXT NOT NULL DEFAULT '[]',
        UNIQUE(entry_id, sense_order)
      );

      CREATE TABLE IF NOT EXISTS sense_glosses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sense_id INTEGER NOT NULL REFERENCES entry_senses(id) ON DELETE CASCADE,
        gloss TEXT NOT NULL,
        gloss_type TEXT,
        gloss_order INTEGER NOT NULL,
        UNIQUE(sense_id, gloss_order)
      );

      CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_started',
        description TEXT,
        cover_image_path TEXT,
        difficulty_level TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
      CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);

      CREATE TABLE IF NOT EXISTS resource_kanji (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        kanji_id INTEGER NOT NULL REFERENCES kanji(id) ON DELETE CASCADE,
        frequency INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resource_id, kanji_id)
      );

      CREATE TABLE IF NOT EXISTS resource_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        entry_id INTEGER NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
        frequency INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resource_id, entry_id)
      );

      CREATE TABLE IF NOT EXISTS custom_vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        reading TEXT,
        meaning TEXT,
        frequency INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resource_id, word)
      );

      CREATE TABLE IF NOT EXISTS resource_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        ocr_text TEXT,
        ocr_elements_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pronunciation_recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER REFERENCES dictionary_entries(id) ON DELETE SET NULL,
        word TEXT,
        audio_path TEXT NOT NULL,
        duration_ms INTEGER,
        is_reference INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT NOT NULL,
        item_key TEXT NOT NULL,
        stage INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT,
        next_review_at TEXT,
        lapses INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(item_type, item_key)
      );
    `
  },
  {
    id: 2,
    name: "resource_terms_and_quizzes",
    sql: `
      CREATE TABLE IF NOT EXISTS resource_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        term_type TEXT NOT NULL,
        text TEXT NOT NULL,
        reading TEXT,
        meaning TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        source_image_id INTEGER REFERENCES resource_images(id) ON DELETE SET NULL,
        frequency INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resource_id, term_type, text)
      );

      CREATE INDEX IF NOT EXISTS idx_resource_terms_resource_id ON resource_terms(resource_id);
      CREATE INDEX IF NOT EXISTS idx_resource_terms_text ON resource_terms(text);
      CREATE INDEX IF NOT EXISTS idx_resource_terms_type ON resource_terms(term_type);

      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        total_questions INTEGER NOT NULL DEFAULT 0,
        correct_answers INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_quiz_sessions_resource_id ON quiz_sessions(resource_id);
      CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created_at ON quiz_sessions(created_at);

      CREATE TABLE IF NOT EXISTS quiz_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        answer TEXT,
        expected_answer TEXT,
        correct INTEGER NOT NULL DEFAULT 0,
        source_type TEXT,
        source_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_id ON quiz_answers(session_id);
    `
  },
  {
    id: 3,
    name: "knowledge_xp_history",
    sql: `
      ALTER TABLE user_knowledge ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_knowledge ADD COLUMN seen_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_knowledge ADD COLUMN is_known INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE user_knowledge ADD COLUMN known_at TEXT;

      CREATE INDEX IF NOT EXISTS idx_user_knowledge_type_known ON user_knowledge(item_type, is_known);
      CREATE INDEX IF NOT EXISTS idx_user_knowledge_xp ON user_knowledge(item_type, xp);

      CREATE TABLE IF NOT EXISTS knowledge_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT NOT NULL,
        item_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        xp_delta INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_events_item ON knowledge_events(item_type, item_key);
      CREATE INDEX IF NOT EXISTS idx_knowledge_events_occurred ON knowledge_events(occurred_at);
    `
  },
  {
    id: 4,
    name: "sentence_examples_and_kanji_graph",
    sql: `
      CREATE TABLE IF NOT EXISTS sentence_examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_id TEXT,
        japanese TEXT NOT NULL,
        reading TEXT,
        english TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sentence_examples_japanese ON sentence_examples(japanese);
      CREATE INDEX IF NOT EXISTS idx_sentence_examples_english ON sentence_examples(english);
      CREATE INDEX IF NOT EXISTS idx_sentence_examples_source ON sentence_examples(source);

      CREATE TABLE IF NOT EXISTS sentence_example_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sentence_id INTEGER NOT NULL REFERENCES sentence_examples(id) ON DELETE CASCADE,
        term_text TEXT NOT NULL,
        term_type TEXT NOT NULL,
        term_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(sentence_id, term_text, term_type, term_order)
      );

      CREATE INDEX IF NOT EXISTS idx_sentence_example_terms_text ON sentence_example_terms(term_text);
      CREATE INDEX IF NOT EXISTS idx_sentence_example_terms_sentence ON sentence_example_terms(sentence_id);

      CREATE TABLE IF NOT EXISTS kanji_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_literal TEXT NOT NULL,
        target_literal TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        reasons_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_literal, target_literal, relation_type)
      );

      CREATE INDEX IF NOT EXISTS idx_kanji_relations_source ON kanji_relations(source_literal, score);
      CREATE INDEX IF NOT EXISTS idx_kanji_relations_target ON kanji_relations(target_literal);
      CREATE INDEX IF NOT EXISTS idx_kanji_relations_type ON kanji_relations(relation_type);
    `
  },
  {
    id: 5,
    name: "import_jobs",
    sql: `
      CREATE TABLE IF NOT EXISTS import_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        input_path TEXT,
        args_json TEXT NOT NULL DEFAULT '{}',
        stdout TEXT NOT NULL DEFAULT '',
        stderr TEXT NOT NULL DEFAULT '',
        exit_code INTEGER,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_import_jobs_type ON import_jobs(job_type, created_at);
    `
  }
];

export function migrate(db: Database.Database) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((row) => Number((row as { id: number }).id))
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(
        migration.id,
        migration.name
      );
    });

    apply();
  }
}
