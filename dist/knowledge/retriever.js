/**
 * MESNIUM KNOWLEDGE LAYER — HYBRID RETRIEVAL & CONTEXT ENGINE (PHASE 8)
 * 
 * Provides:
 * 1. Hybrid Lexical (BM25) + Semantic (Cosine) candidate fusion
 * 2. Reciprocal Rank Fusion (RRF) & Weighted Score Combination
 * 3. Metadata Filtering (Source, Collection, Extension, Date)
 * 4. Grounded Agent Context Builder with explicit Provenance Citations
 */

export class MesniumHybridRetriever {
  constructor(store, embeddingProvider) {
    this.store = store;
    this.embeddingProvider = embeddingProvider;
    this.lexicalWeight = 0.45;
    this.vectorWeight = 0.55;
    this.rrfK = 60; // Standard RRF smoothing constant
  }

  /**
   * Run hybrid search across the knowledge base.
   */
  async search(query, options = {}) {
    const {
      workspaceId = 'default',
      sourceId = null,
      collectionId = null,
      extension = null,
      limit = 5,
      minScore = 0.15
    } = options;

    if (!query || !query.trim()) return [];

    // 1. Run Lexical (FTS5 BM25) Search
    const lexicalResults = this.store.searchLexical(query, {
      workspaceId,
      sourceId,
      limit: limit * 3
    });

    // 2. Generate Query Embedding & Run Vector Search
    const queryEmbedding = await this.embeddingProvider.embedQuery(query);
    const vectorResults = this.store.searchVector(queryEmbedding, {
      workspaceId,
      sourceId,
      limit: limit * 3,
      minScore
    });

    // 3. Reciprocal Rank Fusion (RRF) & Combined Score Fusion
    const candidateMap = new Map();

    // Map lexical ranks
    lexicalResults.forEach((item, rank) => {
      const entry = candidateMap.get(item.id) || {
        ...item,
        lexicalRank: rank + 1,
        vectorRank: null,
        lexicalScore: item.lexicalScore,
        vectorScore: 0,
        rrfScore: 0,
        hybridScore: 0
      };
      entry.lexicalRank = rank + 1;
      candidateMap.set(item.id, entry);
    });

    // Map vector ranks
    vectorResults.forEach((item, rank) => {
      const existing = candidateMap.get(item.id);
      if (existing) {
        existing.vectorRank = rank + 1;
        existing.vectorScore = item.vectorScore;
      } else {
        candidateMap.set(item.id, {
          ...item,
          lexicalRank: null,
          vectorRank: rank + 1,
          lexicalScore: 0,
          vectorScore: item.vectorScore,
          rrfScore: 0,
          hybridScore: 0
        });
      }
    });

    // Calculate normalized fusion scores
    const candidates = Array.from(candidateMap.values());
    for (const c of candidates) {
      // RRF Calculation
      const rrfLexical = c.lexicalRank ? (1.0 / (this.rrfK + c.lexicalRank)) : 0;
      const rrfVector = c.vectorRank ? (1.0 / (this.rrfK + c.vectorRank)) : 0;
      c.rrfScore = (this.lexicalWeight * rrfLexical) + (this.vectorWeight * rrfVector);

      // Normalized Hybrid Score (0.0 to 1.0)
      const normLexical = c.lexicalRank ? Math.max(0, 1.0 - ((c.lexicalRank - 1) / (lexicalResults.length || 1))) : 0;
      const normVector = c.vectorScore || 0;
      c.hybridScore = (this.lexicalWeight * normLexical) + (this.vectorWeight * normVector);
    }

    // 4. Metadata Filtering
    let filtered = candidates;
    if (extension) {
      filtered = filtered.filter(c => (c.extension || '').toLowerCase() === extension.toLowerCase());
    }

    // Sort by final combined score descending
    filtered.sort((a, b) => b.hybridScore - a.hybridScore);

    return filtered.slice(0, limit).map(item => ({
      chunkId: item.id,
      documentId: item.documentId,
      sourceId: item.sourceId,
      workspaceId: item.workspaceId,
      filename: item.filename,
      extension: item.extension,
      content: item.content,
      provenance: item.provenance,
      scores: {
        hybrid: Number(item.hybridScore.toFixed(4)),
        vector: Number(item.vectorScore.toFixed(4)),
        rrf: Number(item.rrfScore.toFixed(4))
      }
    }));
  }

  /**
   * Build ground-truth context block for Agent Prompts.
   */
  async buildAgentContext(query, options = {}) {
    const hits = await this.search(query, options);
    if (!hits || hits.length === 0) {
      return {
        hasKnowledge: false,
        hits: [],
        contextPrompt: ''
      };
    }

    const contextSections = hits.map((hit, idx) => {
      const loc = hit.provenance?.location || `Section ${idx + 1}`;
      const fn = hit.filename || 'Document';
      return `### [Knowledge Source ${idx + 1}: ${fn} | ${loc}]\n${hit.content.trim()}`;
    });

    const contextPrompt = [
      '## Retrieved Workspace Knowledge',
      'The following excerpts were retrieved from the user\'s workspace documents. When answering, ground your response in these facts and cite the source filename and section/sheet/page.',
      '',
      ...contextSections,
      ''
    ].join('\n');

    return {
      hasKnowledge: true,
      hits,
      contextPrompt
    };
  }
}
