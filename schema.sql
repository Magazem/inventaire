-- Inventaire — D1 schema
-- Implements spec/data-model.md v1.0 (frozen).
-- Idempotent: safe to run on every deploy.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- lists
CREATE TABLE IF NOT EXISTS categories (
  id     TEXT PRIMARY KEY,
  noms   TEXT NOT NULL DEFAULT '{}',      -- JSON, 7 languages
  icone  TEXT,
  ordre  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS emplacements (
  id     TEXT PRIMARY KEY,
  noms   TEXT NOT NULL DEFAULT '{}',
  type   TEXT NOT NULL DEFAULT 'atelier'  -- atelier|vehicule|depot|bureau
         CHECK (type IN ('atelier','vehicule','depot','bureau')),
  ordre  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS statuts (
  id             TEXT PRIMARY KEY,
  noms           TEXT NOT NULL DEFAULT '{}',
  couleur        TEXT NOT NULL DEFAULT 'gris',
  visible_worker INTEGER NOT NULL DEFAULT 1
);

-- PPE and hazards share this table, separated by `genre` (data model §7)
CREATE TABLE IF NOT EXISTS epi (
  id     TEXT PRIMARY KEY,
  noms   TEXT NOT NULL DEFAULT '{}',
  picto  TEXT,
  genre  TEXT NOT NULL CHECK (genre IN ('obligatoire','danger'))
);

CREATE TABLE IF NOT EXISTS glossaire (
  lang   TEXT NOT NULL,
  terme  TEXT NOT NULL,
  valeur TEXT NOT NULL,
  PRIMARY KEY (lang, terme)
);

-- --------------------------------------------------------------- models
CREATE TABLE IF NOT EXISTS models (
  model_id          TEXT PRIMARY KEY,          -- M-0042
  type              TEXT NOT NULL,             -- MEULEUSE (uppercase)
  brand             TEXT,                      -- null for consumables
  model_number      TEXT,                      -- normalised (D32)
  model_number_raw  TEXT NOT NULL,             -- exactly as typed off the sticker
  category          TEXT NOT NULL REFERENCES categories(id),

  suivi             TEXT NOT NULL DEFAULT 'unites'
                    CHECK (suivi IN ('unites','quantite')),
  consommable       INTEGER NOT NULL DEFAULT 0,
  mouvements        INTEGER NOT NULL DEFAULT 0,

  photo             TEXT,
  photo_plaque      TEXT,
  manuels           TEXT NOT NULL DEFAULT '{}',  -- JSON map lang -> path (D43/D10)

  names             TEXT NOT NULL DEFAULT '{}',  -- JSON, 7 languages
  search_terms      TEXT NOT NULL DEFAULT '{}',  -- JSON (D42)

  manual_state      TEXT NOT NULL DEFAULT 'a_rediger'
                    CHECK (manual_state IN
                      ('disponible','sans_objet','introuvable','a_rediger')),
  extraction        TEXT
                    CHECK (extraction IS NULL OR extraction IN
                      ('ok','failed_scanned','failed_other')),

  -- safety: two separate fields on purpose (data model §3.2)
  danger_eleve      INTEGER NOT NULL DEFAULT 0,   -- permanent, never cleared
  approbation       TEXT,                          -- JSON {par,at}; null = blocked
  epi               TEXT NOT NULL DEFAULT '[]',
  dangers           TEXT NOT NULL DEFAULT '[]',
  epi_confirme      INTEGER NOT NULL DEFAULT 0,   -- false = "à définir", NOT "none"
  epi_confirme_par  TEXT,
  epi_source        TEXT NOT NULL DEFAULT 'not_specified'
                    CHECK (epi_source IN ('manual','not_specified')),

  guides            TEXT NOT NULL DEFAULT '{}',   -- JSON, per language (data model §4)

  -- AI job state — without this a stranded job is invisible (design §5.1)
  ia_etat           TEXT NOT NULL DEFAULT 'pending'
                    CHECK (ia_etat IN ('pending','done','failed','skipped')),
  ia_tentatives     INTEGER NOT NULL DEFAULT 0,
  ia_derniere       TEXT,
  ia_erreur         TEXT,
  ia_meta           TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_models_state    ON models(manual_state);
CREATE INDEX IF NOT EXISTS idx_models_ia       ON models(ia_etat);
CREATE INDEX IF NOT EXISTS idx_models_cat      ON models(category);
CREATE INDEX IF NOT EXISTS idx_models_number   ON models(brand, model_number);

-- ---------------------------------------------------------------- units
CREATE TABLE IF NOT EXISTS units (
  unit_id     TEXT PRIMARY KEY,             -- ECRAN-005, never reused
  model_id    TEXT NOT NULL REFERENCES models(model_id),
  photo       TEXT,
  emplacement TEXT REFERENCES emplacements(id),   -- NULL is legal (dashboard lists them)
  statut      TEXT NOT NULL DEFAULT 'en_service' REFERENCES statuts(id),
  notes       TEXT NOT NULL DEFAULT '',
  historique  TEXT NOT NULL DEFAULT '[]',   -- append-only JSON (D21)
  added_at    TEXT NOT NULL,
  added_by    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_units_model ON units(model_id);
CREATE INDEX IF NOT EXISTS idx_units_emp   ON units(emplacement);

-- Per-type counter so IDs are assigned server-side, never by the phone (D32)
CREATE TABLE IF NOT EXISTS counters (
  scope TEXT PRIMARY KEY,     -- 'MODEL' or a type like 'ECRAN'
  next  INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------- stock
CREATE TABLE IF NOT EXISTS stock (
  model_id            TEXT PRIMARY KEY REFERENCES models(model_id),
  unite_mesure        TEXT NOT NULL DEFAULT 'u',
  quantites           TEXT,        -- JSON; NULL when mouvements = 1
  quantites_calculees TEXT,        -- JSON; NULL when mouvements = 0
  calcule_at          TEXT,
  dernier_mouvement_at TEXT,
  seuil_bas           INTEGER,
  dernier_mv          INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);

-- Deferred until the list exists (D28), but the table is here so enabling
-- it later needs no migration.
CREATE TABLE IF NOT EXISTS mouvements (
  id          TEXT PRIMARY KEY,   -- MV-000123
  model_id    TEXT NOT NULL REFERENCES models(model_id),
  at          TEXT NOT NULL,
  sens        TEXT NOT NULL CHECK (sens IN ('entree','sortie','inventaire_initial')),
  quantite    INTEGER NOT NULL,
  emplacement TEXT,
  personne    TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mv_model ON mouvements(model_id, at);

-- -------------------------------------------------------------- journal
-- Every AI job attempt. This is where unsupported_omitted and
-- candidates_tried land, so honesty is observable (output-contract §9).
CREATE TABLE IF NOT EXISTS journal (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  model_id  TEXT,
  etape     TEXT NOT NULL,
  ok        INTEGER NOT NULL,
  detail    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_journal_model ON journal(model_id, at);

-- ------------------------------------------------------- starting lists
INSERT OR IGNORE INTO categories (id,noms,icone,ordre) VALUES
 ('atelier','{"fr":"Atelier","en":"Workshop","de":"Werkstatt","it":"Officina","pt":"Oficina","ar":"الورشة","ti":"ዓውዲ"}','🔧',1),
 ('jardinage','{"fr":"Jardinage","en":"Gardening","de":"Garten","it":"Giardinaggio","pt":"Jardinagem","ar":"البستنة","ti":"ተኽሊ"}','🌿',2),
 ('bricolage','{"fr":"Bricolage","en":"DIY","de":"Heimwerken","it":"Bricolage","pt":"Bricolagem","ar":"أشغال","ti":"ጽገና"}','🛠',3),
 ('bureau','{"fr":"Bureau","en":"Office","de":"Büro","it":"Ufficio","pt":"Escritório","ar":"المكتب","ti":"ቤት ጽሕፈት"}','💻',4),
 ('consommable','{"fr":"Consommables","en":"Consumables","de":"Verbrauchsmaterial","it":"Consumabili","pt":"Consumíveis","ar":"مستهلكات","ti":"ሃለኽቲ"}','📦',5);

INSERT OR IGNORE INTO emplacements (id,noms,type,ordre) VALUES
 ('atelier','{"fr":"Atelier","en":"Workshop","ar":"الورشة","ti":"ዓውዲ"}','atelier',1),
 ('depot','{"fr":"Dépôt","en":"Store","ar":"المخزن","ti":"መኽዘን"}','depot',2),
 ('bureau','{"fr":"Bureau","en":"Office","ar":"المكتب","ti":"ቤት ጽሕፈት"}','bureau',3);

INSERT OR IGNORE INTO statuts (id,noms,couleur,visible_worker) VALUES
 ('en_service','{"fr":"En service","en":"In service","ar":"في الخدمة","ti":"ኣብ ግልጋሎት"}','vert',1),
 ('hors_service','{"fr":"Hors service","en":"Out of service","ar":"خارج الخدمة","ti":"ካብ ግልጋሎት ወጻኢ"}','rouge',1),
 ('en_reparation','{"fr":"En réparation","en":"Under repair","ar":"قيد الإصلاح","ti":"ኣብ ጽገና"}','orange',1),
 ('perdu','{"fr":"Perdu","en":"Lost","ar":"مفقود","ti":"ጠፊኡ"}','gris',1),
 ('retire','{"fr":"Retiré","en":"Retired","ar":"مسحوب","ti":"ተኣልዩ"}','gris',0);

-- Starting pictogram set (D27) — grows as you meet real machines
INSERT OR IGNORE INTO epi (id,noms,picto,genre) VALUES
 ('gants','{"fr":"Gants obligatoires","en":"Gloves required","ar":"القفازات إلزامية","ti":"ጓንቲ ግድን"}','pictos/M009.svg','obligatoire'),
 ('lunettes','{"fr":"Lunettes obligatoires","en":"Eye protection","ar":"نظارات واقية","ti":"መነጽር ግድን"}','pictos/M004.svg','obligatoire'),
 ('casque_antibruit','{"fr":"Protection auditive","en":"Ear protection","ar":"واقي السمع","ti":"መከላኸሊ እዝኒ"}','pictos/M003.svg','obligatoire'),
 ('casque','{"fr":"Casque obligatoire","en":"Head protection","ar":"خوذة واقية","ti":"ቆብዕ ግድን"}','pictos/M014.svg','obligatoire'),
 ('chaussures','{"fr":"Chaussures de sécurité","en":"Safety footwear","ar":"أحذية أمان","ti":"ጫማ ድሕነት"}','pictos/M008.svg','obligatoire'),
 ('masque','{"fr":"Masque anti-poussière","en":"Dust mask","ar":"كمامة","ti":"ማስክ"}','pictos/M016.svg','obligatoire'),
 ('gilet','{"fr":"Gilet haute visibilité","en":"Hi-vis vest","ar":"سترة عاكسة","ti":"ብሩህ ጃኬት"}','pictos/M015.svg','obligatoire'),
 ('visiere','{"fr":"Écran facial","en":"Face shield","ar":"واقي الوجه","ti":"መከላኸሊ ገጽ"}','pictos/M013.svg','obligatoire'),
 ('projection','{"fr":"Projection de particules","en":"Flying particles","ar":"تطاير أجزاء","ti":"ዝፍንጠር ነገር"}','pictos/W001.svg','danger'),
 ('bruit','{"fr":"Bruit élevé","en":"Loud noise","ar":"ضجيج","ti":"ዓቢ ድምጺ"}','pictos/W038.svg','danger'),
 ('surface_chaude','{"fr":"Surface chaude","en":"Hot surface","ar":"سطح ساخن","ti":"ውዑይ ገጽ"}','pictos/W017.svg','danger'),
 ('pieces_mobiles','{"fr":"Pièces en mouvement","en":"Moving parts","ar":"أجزاء متحركة","ti":"ዝንቀሳቐስ ኣካል"}','pictos/W024.svg','danger'),
 ('electrique','{"fr":"Risque électrique","en":"Electrical hazard","ar":"خطر كهربائي","ti":"ሓደጋ ኤለክትሪክ"}','pictos/W012.svg','danger');

INSERT OR IGNORE INTO counters (scope,next) VALUES ('MODEL',1);

-- ---------------------------------------------------------------------------
-- corbeille — reversible deletion.
--
-- A separate TABLE rather than a column on models/units, for one practical
-- reason: schema.sql is applied on every deploy, and `ALTER TABLE ... ADD
-- COLUMN` is not idempotent — the second deploy would fail. CREATE TABLE IF
-- NOT EXISTS is.
--
-- It doubles as the audit record: who cancelled what, when, and why.
-- Membership means "hidden everywhere"; purging is a separate, deliberate act.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corbeille (
  kind    TEXT NOT NULL CHECK (kind IN ('unit','model')),
  id      TEXT NOT NULL,
  at      TEXT NOT NULL,
  par     TEXT,
  raison  TEXT,
  PRIMARY KEY (kind, id)
);
