/**
 * PPE and hazards — extracted in CODE, not by the model.
 *
 * Three runs were spent trying to make an LLM call for this work: it
 * returned duplicates, confused `casque` with `casque_antibruit`, missed
 * `projection` and `bruit` outright, and finally burned 90 seconds of
 * reasoning on an input of a few hundred characters. Shrinking the input
 * 100-fold changed nothing, which is the tell — the cost was never the text.
 *
 * The guide the model already wrote says, in one sentence:
 *
 *   "Portez un équipement de protection individuelle : lunettes de sécurité,
 *    écran facial, protection respiratoire, protège-tympans, gants et
 *    tablier de travail."
 *
 * Every item is named, in the target language. That is string matching, and
 * D47's own table puts string rules in code. Deciding which pictogram to
 * show is not the judgment call the model was brought in for; writing the
 * prose was, and it does that well.
 *
 * What this buys beyond correctness: it is instant, it is free, it is the
 * same answer every time, and it reports the phrase it matched — so the
 * workshop review (D30) becomes "is this right?" rather than "where did
 * this come from?".
 */

/** Accent- and case-insensitive, so "protège-tympans" matches "protege tympans". */
const norm = s => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Apostrophes become spaces so "n'utilisez" and "n utilisez" are the same
  // string. PDF text extraction is inconsistent about which it produces.
  .replace(/['’ʼ]/g, ' ')
  .replace(/\s+/g, ' ');

/**
 * Phrases per id, per language.
 *
 * Chosen to be SPECIFIC, because the failure mode here is a false positive
 * on a machine that does not need the equipment. Two traps found in the
 * real Makita text:
 *
 *  - French "casque" alone means hearing protection as often as a hard hat,
 *    so the hard hat needs "casque de protection"/"de chantier".
 *  - "outil électrique" (power tool) appears in nearly every sentence of a
 *    French manual. Matching "electrique" would flag electrical hazard on
 *    everything, so `electrique` needs a phrase about actual shock risk.
 */
export const PHRASES = {
  lunettes: {
    fr: ['lunettes', 'protection oculaire', 'protection des yeux'],
    en: ['eye protection', 'safety glasses', 'goggles', 'safety spectacles'],
    de: ['schutzbrille', 'augenschutz'],
    it: ['occhiali', 'protezione degli occhi'],
    pt: ['oculos', 'protecao ocular'],
    ar: ['نظارات'],
  },
  visiere: {
    fr: ['ecran facial', 'visiere'],
    en: ['face shield', 'face screen', 'full-face'],
    de: ['gesichtsschutz', 'visier'],
    it: ['schermo facciale', 'visiera'],
    pt: ['viseira', 'protetor facial'],
    ar: ['واقي الوجه'],
  },
  casque_antibruit: {
    fr: ['antibruit', 'anti-bruit', 'protection auditive', 'protege-tympan', 'serre-tete'],
    en: ['hearing protection', 'ear protection', 'ear defenders', 'earplugs', 'ear muffs'],
    de: ['gehorschutz', 'ohrenschutz'],
    it: ['protezione acustica', 'protezione dell udito', 'cuffie'],
    pt: ['protecao auditiva', 'protetores auriculares'],
    ar: ['واقي السمع', 'حماية السمع'],
  },
  masque: {
    fr: ['masque', 'protection respiratoire', 'anti-poussiere', 'antipoussiere'],
    en: ['dust mask', 'respirator', 'breathing protection', 'respiratory protection'],
    de: ['staubmaske', 'atemschutz'],
    it: ['mascherina', 'protezione respiratoria'],
    pt: ['mascara', 'protecao respiratoria'],
    ar: ['كمامة', 'قناع'],
  },
  gants: {
    fr: ['gants'],
    en: ['gloves'],
    de: ['handschuhe'],
    it: ['guanti'],
    pt: ['luvas'],
    ar: ['قفازات'],
  },
  casque: {
    fr: ['casque de protection', 'casque de chantier', 'casque de securite'],
    en: ['hard hat', 'safety helmet', 'head protection'],
    de: ['schutzhelm', 'kopfschutz'],
    it: ['elmetto', 'casco protettivo'],
    pt: ['capacete'],
    ar: ['خوذة'],
  },
  chaussures: {
    fr: ['chaussures de securite', 'bottes de securite'],
    en: ['safety shoes', 'safety footwear', 'safety boots', 'steel-toe'],
    de: ['sicherheitsschuhe'],
    it: ['scarpe antinfortunistiche', 'calzature di sicurezza'],
    pt: ['calcado de seguranca', 'botas de seguranca'],
    ar: ['احذية امان', 'حذاء امان'],
  },
  gilet: {
    fr: ['gilet', 'haute visibilite'],
    en: ['hi-vis', 'high-visibility', 'high visibility vest'],
    de: ['warnweste'],
    it: ['alta visibilita'],
    pt: ['colete', 'alta visibilidade'],
    ar: ['سترة عاكسة'],
  },
};

export const HAZARD_PHRASES = {
  projection: {
    fr: ['projection', 'particules', 'etincelles', 'eclats', 'debris'],
    en: ['flying particles', 'sparks', 'debris', 'fragments', 'thrown'],
    de: ['funken', 'partikel', 'splitter'],
    it: ['scintille', 'particelle', 'frammenti'],
    pt: ['faiscas', 'particulas', 'fragmentos'],
    ar: ['شرر', 'تطاير'],
  },
  bruit: {
    fr: ['bruit', 'antibruit', 'protection auditive', 'sonore', 'decibel'],
    en: ['noise', 'loud', 'sound level', 'decibel', 'hearing protection'],
    de: ['larm', 'gerausch', 'gehorschutz'],
    it: ['rumore', 'acustic'],
    pt: ['ruido', 'protecao auditiva'],
    ar: ['ضجيج', 'ضوضاء'],
  },
  surface_chaude: {
    fr: ['extremement chaud', 'tres chaud', 'bruler', 'brulure', 'surface chaude'],
    en: ['hot surface', 'extremely hot', 'burn your', 'burn the skin', 'may be hot'],
    de: ['heisse oberflache', 'verbrenn'],
    it: ['superficie calda', 'ustion', 'molto caldo'],
    pt: ['superficie quente', 'queimadura', 'muito quente'],
    ar: ['ساخن', 'حرق'],
  },
  pieces_mobiles: {
    fr: ['en rotation', 'pieces en mouvement', 'choc en retour', 'continue de tourner',
         'accessoire en rotation'],
    en: ['rotating', 'moving parts', 'kickback', 'still spinning', 'entangle'],
    de: ['rotierend', 'ruckschlag', 'bewegliche teile'],
    it: ['rotazione', 'contraccolpo', 'parti in movimento'],
    pt: ['rotacao', 'coice', 'pecas moveis'],
    ar: ['دوران', 'اجزاء متحركة'],
  },
  electrique: {
    // NOT the bare word — "outil électrique" is in nearly every sentence.
    fr: ['choc electrique', 'electrocution', 'surface de prise isolee',
         'cable endommage', 'cordon endommage', 'sous tension'],
    en: ['electric shock', 'electrical shock', 'live wire', 'insulated gripping',
         'damaged cord', 'damaged cable'],
    de: ['stromschlag', 'spannungsfuhrend', 'isolierte grifffl'],
    it: ['scossa elettrica', 'superfici di presa isolate'],
    pt: ['choque eletrico', 'superficies isoladas'],
    ar: ['صدمة كهربائية', 'خطر كهربائي'],
  },
};

/**
 * Negation guard.
 *
 * Makita's own French text says "N'utilisez pas de gants de travail en
 * tissu" — do NOT use cloth gloves. Matching "gants" there would put a
 * "gloves required" pictogram on a machine whose manual warns against them.
 * The LLM made exactly this mistake in run #8.
 */
const NEGATIONS = [
  'n utilisez pas', 'ne pas utiliser', 'n utilisez jamais', 'ne portez pas',
  'ne jamais utiliser', 'ne jamais porter',
  'do not use', 'never use', 'do not wear', 'never wear',
  'nicht verwenden', 'niemals verwenden', 'non utilizzare', 'nao utilize',
  'no utilice',
];
function negatedAt(hay, idx) {
  const before = hay.slice(Math.max(0, idx - 45), idx);
  return NEGATIONS.some(n => before.includes(n));
}

function scan(table, text, lang) {
  const hay = norm(text);
  const found = {};
  for (const [id, byLang] of Object.entries(table)) {
    // Try the guide's language first, then English — European manuals often
    // leave an English term in place.
    for (const l of [lang, 'en']) {
      for (const phrase of byLang[l] || []) {
        const p = norm(phrase);
        let i = hay.indexOf(p);
        while (i !== -1) {
          if (!negatedAt(hay, i)) {
            const from = Math.max(0, i - 40), to = Math.min(hay.length, i + p.length + 40);
            found[id] = { phrase, evidence: '…' + text.slice(from, to).replace(/\s+/g, ' ').trim() + '…' };
            break;
          }
          i = hay.indexOf(p, i + p.length);
        }
        if (found[id]) break;
      }
      if (found[id]) break;
    }
  }
  return found;
}

/**
 * Returns ids plus the phrase each was matched on.
 *
 * `epi_confirme` stays false regardless (D30) — this is a well-evidenced
 * suggestion for the workshop review, not a decision.
 */
export function extractPpeFromText(text, lang = 'fr') {
  const epi = scan(PHRASES, text, lang);
  const dangers = scan(HAZARD_PHRASES, text, lang);
  return {
    ok: true,
    method: 'keyword',
    epi: Object.keys(epi),
    dangers: Object.keys(dangers),
    source: (Object.keys(epi).length || Object.keys(dangers).length)
      ? 'manual' : 'not_specified',
    evidence: { ...epi, ...dangers },
  };
}
