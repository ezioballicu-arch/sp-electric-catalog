// ==========================================
// ENTERPRISE SEARCH ENGINE (Standard Aziendale)
// ==========================================

// DIZIONARIO SINONIMI AZIENDALI
const SYNONYMS = {
  // Prodotti comuni
  "interruttore": ["switch", "pulsante", "deviatore"],
  "presa": ["socket", "spina"],
  "lampada": ["lampadina", "led", "luce", "bulbo"],
  "cavo": ["filo", "cavetto", "cable"],
  "scatola": ["box", "contenitore"],
  "quadro": ["centralino", "pannello"],
  "relè": ["rele", "relay"],
  "trasformatore": ["trafo"],
  "magnetotermico": ["salvavita", "differenziale"],
  
  // Abbreviazioni comuni
  "btc": ["bticino"],
  "gewiss": ["gw"],
  "abb": ["abb"],
  
  // Errori comuni
  "inturrettore": ["interruttore"],
  "interruttorw": ["interruttore"],
  "lampadins": ["lampadina"],
  "quadr": ["quadro"]
};

// CORREZIONI AUTOMATICHE ERRORI COMUNI
const AUTO_CORRECTIONS = {
  "inturrettore": "interruttore",
  "interruttorw": "interruttore",
  "lampadins": "lampadina",
  "trasofrmatore": "trasformatore",
  "magnetotermic": "magnetotermico",
  "btcino": "bticino",
  "gewis": "gewiss"
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s\-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Espansione sinonimi (l'utente dice "interruttore", cerca anche "switch")
function expandWithSynonyms(query) {
  const expanded = [query];
  const normalized = normalize(query);
  
  // Cerca sinonimi
  for (const [key, synonyms] of Object.entries(SYNONYMS)) {
    if (normalized.includes(key)) {
      synonyms.forEach(syn => {
        const expandedQuery = normalized.replace(key, syn);
        expanded.push(expandedQuery);
      });
    }
    
    // Controlla anche il contrario
    synonyms.forEach(syn => {
      if (normalized.includes(syn)) {
        const expandedQuery = normalized.replace(syn, key);
        expanded.push(expandedQuery);
      }
    });
  }
  
  return [...new Set(expanded)]; // Rimuovi duplicati
}

// Correzione automatica errori comuni
function autoCorrect(query) {
  let corrected = query;
  const normalized = normalize(query);
  
  for (const [error, correction] of Object.entries(AUTO_CORRECTIONS)) {
    if (normalized.includes(error)) {
      corrected = normalized.replace(error, correction);
    }
  }
  
  return corrected;
}

// Classificazione intento automatica
function classifyIntent(query) {
  const normalized = normalize(query);
  
  // È un codice? (contiene numeri, breve, pochi spazi)
  const hasNumbers = /\d/.test(normalized);
  const hasLetters = /[a-z]/.test(normalized);
  const isShort = normalized.length <= 15;
  const fewWords = normalized.split(" ").length <= 2;
  
  if (hasNumbers && hasLetters && isShort && fewWords) {
    return "CODE"; // Probabilmente un codice prodotto
  }
  
  if (hasNumbers && !hasLetters) {
    return "CODE"; // Solo numeri = codice
  }
  
  if (!hasNumbers && normalized.split(" ").length === 1) {
    return "CATEGORY"; // Una parola senza numeri = categoria
  }
  
  return "PRODUCT"; // Tutto il resto = nome prodotto
}

// Tolleranza errori di battitura (Levenshtein semplificato)
function fuzzyMatch(str, pattern) {
  if (str.includes(pattern)) return true;
  if (pattern.length < 3) return false;
  
  // Controllo sotto-stringhe con 1 carattere di differenza
  for (let i = 0; i <= str.length - pattern.length; i++) {
    let diff = 0;
    for (let j = 0; j < pattern.length; j++) {
      if (str[i + j] !== pattern[j]) diff++;
      if (diff > 1) break;
    }
    if (diff <= 1) return true;
  }
  return false;
}

// Scoring enterprise con intelligenza commerciale
function scoreProduct(product, query, tokens, intent) {
  const code = normalize(product.code);
  const name = normalize(product.name);
  const category = normalize(product.category || "");
  const description = normalize(product.description || "");
  
  let score = 0;
  
  // BOOST basato sull'intento
  const intentBoost = {
    CODE: { code: 3.0, name: 1.0, category: 0.3 },
    PRODUCT: { code: 1.0, name: 3.0, category: 1.0 },
    CATEGORY: { code: 0.5, name: 1.5, category: 3.0 }
  };
  
  const boost = intentBoost[intent] || intentBoost.PRODUCT;
  
  // FASE 1: Codici prodotto
  if (code === query) return 10000 * boost.code; // Match perfetto
  if (code.startsWith(query)) score += 5000 * boost.code;
  if (code.includes(query)) score += 2500 * boost.code;
  if (fuzzyMatch(code, query)) score += 1200 * boost.code;
  
  // FASE 2: Nomi prodotto
  if (name === query) score += 3000 * boost.name;
  if (name.startsWith(query)) score += 1500 * boost.name;
  if (name.includes(query)) score += 800 * boost.name;
  if (fuzzyMatch(name, query)) score += 400 * boost.name;
  
  // FASE 3: Categorie
  if (category.includes(query)) score += 600 * boost.category;
  
  // FASE 4: Matching multi-token (query lunghe)
  if (tokens.length > 1) {
    let tokenScore = 0;
    let tokenMatches = 0;
    
    tokens.forEach((token) => {
      if (code.includes(token)) {
        tokenMatches++;
        tokenScore += 300 * boost.code;
      } else if (name.includes(token)) {
        tokenMatches++;
        tokenScore += 150 * boost.name;
      } else if (category.includes(token)) {
        tokenMatches++;
        tokenScore += 100 * boost.category;
      } else if (description.includes(token)) {
        tokenMatches++;
        tokenScore += 50;
      }
    });
    
    // Bonus se tutti i token matchano
    if (tokenMatches === tokens.length) {
      tokenScore *= 2;
    }
    
    score += tokenScore;
  }
  
  // FASE 5: Descrizioni (ultima risorsa)
  if (score < 500 && description.includes(query)) {
    score += 200;
  }
  
  return score;
}

// Ricerca con fallback intelligenti (MAI zero risultati)
function searchWithFallback(products, queries, intent) {
  const tokens = queries[0].split(" ").filter(Boolean);
  const results = [];
  
  // Prova tutte le varianti della query (originale + sinonimi + correzioni)
  for (const query of queries) {
    // FASE 1: Cerca codici esatti o quasi-esatti (early stop)
    for (const product of products) {
      const code = normalize(product.code);
      
      if (code === query) {
        // Match perfetto al 100% → mostra SOLO questo
        return [product];
      }
      
      if (code.startsWith(query) || code.includes(query)) {
        const score = scoreProduct(product, query, tokens, intent);
        if (!results.some(r => r.product.code === product.code)) {
          results.push({ product, score });
        }
        
        // Se trovi match molto forti nei codici, limita subito
        if (results.length >= 3 && score >= 2500) break;
      }
    }
    
    // Se abbiamo già risultati forti (90%+ confidence), fermiamoci
    if (results.length > 0 && results[0].score >= 5000) {
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, 1)
        .map(item => item.product);
    }
    
    // FASE 2: Cerca nei nomi prodotto
    if (results.length < 5) {
      for (const product of products) {
        if (results.some(r => r.product.code === product.code)) continue;
        
        const name = normalize(product.name);
        
        if (name.includes(query) || fuzzyMatch(name, query)) {
          const score = scoreProduct(product, query, tokens, intent);
          if (score > 0) {
            results.push({ product, score });
          }
          
          // Limita ricerca appena hai match decenti
          if (results.length >= 10) break;
        }
      }
    }
    
    // Se abbiamo risultati decenti, usciamo
    if (results.length >= 5) break;
  }
  
  // FASE 3: Ricerca multi-token più ampia (solo se serve)
  if (results.length < 5 && tokens.length > 1) {
    for (const product of products) {
      if (results.some(r => r.product.code === product.code)) continue;
      
      const score = scoreProduct(product, queries[0], tokens, intent);
      if (score >= 300) { // Threshold ridotto per fallback
        results.push({ product, score });
      }
      
      if (results.length >= 15) break;
    }
  }
  
  // FASE 4: Categorie (fallback se intento sconosciuto)
  if (results.length < 3) {
    for (const product of products) {
      if (results.some(r => r.product.code === product.code)) continue;
      
      const category = normalize(product.category || "");
      if (category.includes(queries[0])) {
        const score = scoreProduct(product, queries[0], tokens, intent);
        if (score > 0) {
          results.push({ product, score });
        }
      }
      
      if (results.length >= 10) break;
    }
  }
  
  // FASE 5: Descrizioni (ultima risorsa, solo se non abbiamo NULLA)
  if (results.length < 2 && queries[0].length > 4) {
    for (const product of products) {
      if (results.some(r => r.product.code === product.code)) continue;
      
      const description = normalize(product.description || "");
      if (description.includes(queries[0])) {
        const score = scoreProduct(product, queries[0], tokens, intent);
        if (score > 0) {
          results.push({ product, score });
        }
      }
      
      if (results.length >= 10) break;
    }
  }
  
  // FASE 6: FALLBACK FINALE - se ancora nessun risultato, cerca per token singoli
  if (results.length === 0 && tokens.length > 1) {
    for (const token of tokens) {
      if (token.length < 3) continue; // Salta token troppo corti
      
      for (const product of products) {
        if (results.some(r => r.product.code === product.code)) continue;
        
        const code = normalize(product.code);
        const name = normalize(product.name);
        const category = normalize(product.category || "");
        
        if (code.includes(token) || name.includes(token) || category.includes(token)) {
          results.push({ 
            product, 
            score: 100 // Score basso = risultato fallback
          });
        }
        
        if (results.length >= 5) break;
      }
      
      if (results.length > 0) break;
    }
  }
  
  // OUTPUT: Massimo 5 risultati, ordinati per rilevanza
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(item => item.product);
}

// Funzione principale con preprocessing intelligente
function searchProducts(products, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return [];
  
  // 1. Classificazione intento automatica
  const intent = classifyIntent(query);
  
  // 2. Correzione automatica
  const correctedQuery = autoCorrect(query);
  
  // 3. Espansione con sinonimi
  const expandedQueries = expandWithSynonyms(correctedQuery);
  
  // 4. Ricerca con fallback intelligenti
  return searchWithFallback(products, expandedQueries, intent);
}

module.exports = { searchProducts };
