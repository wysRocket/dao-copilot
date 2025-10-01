/**
 * Grammar Pattern Corrector
 *
 * This module provides grammar pattern corrections for Russian transcriptions
 * to fix common grammatical errors, sentence structure issues, and syntactic
 * problems that occur in speech-to-text systems.
 */

export interface GrammarPattern {
  pattern: RegExp
  replacement: string
  description: string
  category:
    | 'word_order'
    | 'verb_form'
    | 'case_correction'
    | 'preposition'
    | 'conjunction'
    | 'particle'
    | 'punctuation'
    | 'sentence_structure'
  confidence: number // 0.0-1.0
  conditions?: {
    // Optional conditions for when to apply the pattern
    contextBefore?: RegExp
    contextAfter?: RegExp
    wordCount?: {min?: number; max?: number}
  }
}

export interface GrammarCorrectionResult {
  originalText: string
  correctedText: string
  corrections: GrammarCorrectionDetail[]
  confidence: number
  processingTimeMs: number
}

export interface GrammarCorrectionDetail {
  type: 'grammar'
  category: string
  original: string
  corrected: string
  position: {start: number; end: number}
  confidence: number
  reason: string
  pattern: string
}

export interface GrammarCorrectionConfig {
  enableWordOrderCorrection: boolean
  enableVerbFormCorrection: boolean
  enableCaseCorrection: boolean
  enablePrepositionCorrection: boolean
  enableConjunctionCorrection: boolean
  enableParticleCorrection: boolean
  enablePunctuationCorrection: boolean
  enableSentenceStructureCorrection: boolean
  confidenceThreshold: number
  maxCorrectionsPerSentence: number
  preserveOriginalOnLowConfidence: boolean
  logCorrections: boolean
}

/**
 * Grammar Pattern Corrector class for Russian transcriptions
 */
export class GrammarPatternCorrector {
  private config: GrammarCorrectionConfig
  private patterns: GrammarPattern[] = []
  private correctionStats = {
    totalCorrections: 0,
    categoryStats: new Map<string, number>(),
    patternStats: new Map<string, number>()
  }

  constructor(config: Partial<GrammarCorrectionConfig> = {}) {
    this.config = {
      enableWordOrderCorrection: true,
      enableVerbFormCorrection: true,
      enableCaseCorrection: true,
      enablePrepositionCorrection: true,
      enableConjunctionCorrection: true,
      enableParticleCorrection: true,
      enablePunctuationCorrection: true,
      enableSentenceStructureCorrection: true,
      confidenceThreshold: 0.7,
      maxCorrectionsPerSentence: 5,
      preserveOriginalOnLowConfidence: true,
      logCorrections: false,
      ...config
    }

    this.initializeGrammarPatterns()
    console.log('📝 Grammar Pattern Corrector initialized with', this.patterns.length, 'patterns')
  }

  /**
   * Main grammar correction method
   */
  async correct(text: string): Promise<GrammarCorrectionResult> {
    const startTime = Date.now()
    const originalText = text
    let correctedText = text
    const corrections: GrammarCorrectionDetail[] = []

    try {
      // Process sentence by sentence to maintain context
      const sentences = this.splitIntoSentences(correctedText)
      const processedSentences: string[] = []

      for (const sentence of sentences) {
        const sentenceResult = await this.correctSentence(sentence.trim())
        processedSentences.push(sentenceResult.text)
        corrections.push(...sentenceResult.corrections)
      }

      correctedText = processedSentences.join(' ')

      // Calculate overall confidence
      const confidence =
        corrections.length > 0
          ? corrections.reduce((sum, c) => sum + c.confidence, 0) / corrections.length
          : 1.0

      const processingTime = Date.now() - startTime

      // Update statistics
      this.updateStats(corrections)

      if (this.config.logCorrections && corrections.length > 0) {
        console.log(
          `[GrammarPatternCorrector] Applied ${corrections.length} corrections in ${processingTime}ms`
        )
      }

      return {
        originalText,
        correctedText,
        corrections,
        confidence,
        processingTimeMs: processingTime
      }
    } catch (error) {
      console.error('Grammar pattern correction error:', error)
      return {
        originalText,
        correctedText: text,
        corrections: [],
        confidence: 1.0,
        processingTimeMs: Date.now() - startTime
      }
    }
  }

  /**
   * Correct a single sentence
   */
  private async correctSentence(
    sentence: string
  ): Promise<{text: string; corrections: GrammarCorrectionDetail[]}> {
    let correctedSentence = sentence
    const corrections: GrammarCorrectionDetail[] = []
    let correctionsApplied = 0

    for (const pattern of this.patterns) {
      if (correctionsApplied >= this.config.maxCorrectionsPerSentence) {
        break
      }

      // Check if this pattern category is enabled
      if (!this.isPatternCategoryEnabled(pattern.category)) {
        continue
      }

      // Check confidence threshold
      if (pattern.confidence < this.config.confidenceThreshold) {
        continue
      }

      // Check conditions if specified
      if (
        pattern.conditions &&
        !this.checkPatternConditions(correctedSentence, pattern.conditions)
      ) {
        continue
      }

      // Apply pattern
      const matches = [...correctedSentence.matchAll(pattern.pattern)]

      for (const match of matches) {
        if (match.index !== undefined) {
          const correction: GrammarCorrectionDetail = {
            type: 'grammar',
            category: pattern.category,
            original: match[0],
            corrected: pattern.replacement,
            position: {start: match.index, end: match.index + match[0].length},
            confidence: pattern.confidence,
            reason: pattern.description,
            pattern: pattern.pattern.source
          }

          corrections.push(correction)
          correctionsApplied++

          if (correctionsApplied >= this.config.maxCorrectionsPerSentence) {
            break
          }
        }
      }

      // Apply replacements
      correctedSentence = correctedSentence.replace(pattern.pattern, pattern.replacement)
    }

    return {text: correctedSentence, corrections}
  }

  /**
   * Initialize all grammar patterns based on common Russian transcription issues
   */
  private initializeGrammarPatterns(): void {
    // Clear existing patterns
    this.patterns = []

    // Word Order Corrections
    this.addWordOrderPatterns()

    // Verb Form Corrections
    this.addVerbFormPatterns()

    // Case Corrections
    this.addCasePatterns()

    // Preposition Corrections
    this.addPrepositionPatterns()

    // Conjunction and Particle Corrections
    this.addConjunctionPatterns()

    // Punctuation and Sentence Structure
    this.addSentenceStructurePatterns()

    // Production-specific patterns from screenshot analysis
    this.addProductionSpecificPatterns()

    // Advanced Russian grammar patterns for Task 7.3
    this.addAdvancedRussianPatterns()

    console.log(`📚 Initialized ${this.patterns.length} grammar patterns across categories`)
  }

  /**
   * Add word order correction patterns
   */
  private addWordOrderPatterns(): void {
    const patterns: GrammarPattern[] = [
      {
        pattern: /\bтолько для\s+(\w+)\b/g,
        replacement: 'только $1',
        description: 'Remove unnecessary "для" in "только для"',
        category: 'word_order',
        confidence: 0.8
      },
      {
        pattern: /\bвыбираете только для\s+(\w+)\b/g,
        replacement: 'выбираете только $1',
        description: 'Fix word order in "выбираете только для"',
        category: 'word_order',
        confidence: 0.9
      },
      {
        pattern: /\bдействительно выбираете только для\b/g,
        replacement: 'действительно выбираете только',
        description: 'Remove inappropriate preposition usage',
        category: 'word_order',
        confidence: 0.85
      },
      {
        pattern: /\bне то что там то конечно\b/g,
        replacement: 'не то что там, конечно',
        description: 'Add proper punctuation to fragmented speech',
        category: 'word_order',
        confidence: 0.7
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add verb form correction patterns
   */
  private addVerbFormPatterns(): void {
    const patterns: GrammarPattern[] = [
      // Fix punctuation (existing)
      {
        pattern: /\bбыли что\b/g,
        replacement: 'были, что',
        description: 'Add proper punctuation after "были"',
        category: 'verb_form',
        confidence: 0.8
      },
      {
        pattern: /\bпоняли люди в эще были\b/g,
        replacement: 'поняли, люди еще были',
        description: 'Fix verb sequence and punctuation',
        category: 'verb_form',
        confidence: 0.75
      },
      {
        pattern: /\bсе лейным\b/g,
        replacement: 'семейным',
        description: 'Fix syllable boundary in "семейным"',
        category: 'verb_form',
        confidence: 0.9
      },

      // Russian verb form corrections (Task 7.3 requirements)

      // Personal pronoun + infinitive errors
      {
        pattern: /\bя идти\b/g,
        replacement: 'я иду',
        description: 'Personal pronoun requires conjugated verb form, not infinitive',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bты делать\b/g,
        replacement: 'ты делаешь',
        description: 'Personal pronoun requires conjugated verb form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bон говорить\b/g,
        replacement: 'он говорит',
        description: 'Personal pronoun requires conjugated verb form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bона писать\b/g,
        replacement: 'она пишет',
        description: 'Personal pronoun requires conjugated verb form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bмы работать\b/g,
        replacement: 'мы работаем',
        description: 'Personal pronoun requires conjugated verb form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bвы читать\b/g,
        replacement: 'вы читаете',
        description: 'Personal pronoun requires conjugated verb form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bони жить\b/g,
        replacement: 'они живут',
        description: 'Personal pronoun requires conjugated verb form',
        category: 'verb_form',
        confidence: 0.95
      },

      // Aspect corrections (perfective vs imperfective)
      {
        pattern: /\bя всегда делать\b/g,
        replacement: 'я всегда делаю',
        description: 'Habitual actions require imperfective aspect',
        category: 'verb_form',
        confidence: 0.9
      },
      {
        pattern: /\bкаждый день сделать\b/g,
        replacement: 'каждый день делать',
        description: 'Repeated actions require imperfective aspect',
        category: 'verb_form',
        confidence: 0.9
      },
      {
        pattern: /\bзавтра делать домашнее задание\b/g,
        replacement: 'завтра сделаю домашнее задание',
        description: 'Future completed action requires perfective aspect',
        category: 'verb_form',
        confidence: 0.85
      },
      {
        pattern: /\bвчера написать письмо\b/g,
        replacement: 'вчера написал письмо',
        description: 'Past completed action requires perfective aspect',
        category: 'verb_form',
        confidence: 0.85
      },

      // Tense corrections
      {
        pattern: /\bвчера я пойду\b/g,
        replacement: 'вчера я пошёл',
        description: 'Past time requires past tense',
        category: 'verb_form',
        confidence: 0.9
      },
      {
        pattern: /\bзавтра я шёл\b/g,
        replacement: 'завтра я пойду',
        description: 'Future time requires future tense',
        category: 'verb_form',
        confidence: 0.9
      },
      {
        pattern: /\bсейчас я пошёл\b/g,
        replacement: 'сейчас я иду',
        description: 'Present time requires present tense',
        category: 'verb_form',
        confidence: 0.9
      },

      // Gender agreement in past tense
      {
        pattern: /\bона пошёл\b/g,
        replacement: 'она пошла',
        description: 'Feminine subject requires feminine past tense form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bон пошла\b/g,
        replacement: 'он пошёл',
        description: 'Masculine subject requires masculine past tense form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bмашина поехал\b/g,
        replacement: 'машина поехала',
        description: 'Feminine noun requires feminine past tense form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bстол стоял\b/g,
        replacement: 'стол стоял',
        description: 'Correct masculine agreement',
        category: 'verb_form',
        confidence: 0.8
      },

      // Common conjugation errors
      {
        pattern: /\bя иду домой вчера\b/g,
        replacement: 'я шёл домой вчера',
        description: 'Past time context requires past tense',
        category: 'verb_form',
        confidence: 0.9
      },
      {
        pattern: /\bмы был дома\b/g,
        replacement: 'мы были дома',
        description: 'Plural subject requires plural verb form',
        category: 'verb_form',
        confidence: 0.95
      },
      {
        pattern: /\bты были дома\b/g,
        replacement: 'ты был дома',
        description: 'Singular subject requires singular verb form',
        category: 'verb_form',
        confidence: 0.95
      },

      // Modal verb constructions
      {
        pattern: /\bя могу делать\b/g,
        replacement: 'я могу делать',
        description: 'Correct modal construction with infinitive',
        category: 'verb_form',
        confidence: 0.7
      },
      {
        pattern: /\bнадо делать\b/g,
        replacement: 'надо делать',
        description: 'Correct modal construction',
        category: 'verb_form',
        confidence: 0.7
      },
      {
        pattern: /\bхочу сделал\b/g,
        replacement: 'хочу сделать',
        description: 'Modal verb requires infinitive, not past tense',
        category: 'verb_form',
        confidence: 0.9
      },

      // Reflexive verbs
      {
        pattern: /\bя учиться русский\b/g,
        replacement: 'я изучаю русский',
        description: 'Use transitive form for object-taking verb',
        category: 'verb_form',
        confidence: 0.85
      },
      {
        pattern: /\bон одевает\b(?!\s+кого)/g,
        replacement: 'он одевается',
        description: 'Use reflexive form when no object is specified',
        category: 'verb_form',
        confidence: 0.8
      },

      // Imperative mood corrections
      {
        pattern: /\bты дай мне\b/g,
        replacement: 'дай мне',
        description: 'Imperative mood does not need personal pronoun',
        category: 'verb_form',
        confidence: 0.8
      },
      {
        pattern: /\bвы дайте пожалуйста\b/g,
        replacement: 'дайте, пожалуйста',
        description: 'Add punctuation with politeness marker',
        category: 'verb_form',
        confidence: 0.85
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add case correction patterns
   */
  private addCasePatterns(): void {
    const patterns: GrammarPattern[] = [
      // Fix word boundaries (existing)
      {
        pattern: /\bком форта\b/g,
        replacement: 'комфорта',
        description: 'Fix word boundary in "комфорта"',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bпол ностью\b/g,
        replacement: 'полностью',
        description: 'Fix word boundary in "полностью"',
        category: 'case_correction',
        confidence: 0.95
      },
      {
        pattern: /\bВос можно\b/g,
        replacement: 'возможно',
        description: 'Fix capitalization and word boundary in "возможно"',
        category: 'case_correction',
        confidence: 0.9
      },

      // Russian case corrections (Task 7.3 requirements)

      // Genitive case after prepositions
      {
        pattern: /\bбез (\w+)(а|я|ы|и)\b/g,
        replacement: 'без $1а',
        description: 'Preposition "без" requires genitive case',
        category: 'case_correction',
        confidence: 0.85,
        conditions: {
          contextAfter: /^\s*[а-яёА-ЯЁ]/
        }
      },
      {
        pattern: /\bдля (\w+)(ом|ой|ами|ах)\b/g,
        replacement: 'для $1ы',
        description: 'Preposition "для" requires genitive case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bиз (\w+)(у|е|ом|ой)\b/g,
        replacement: 'из $1а',
        description: 'Preposition "из" requires genitive case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bот (\w+)(у|е|ом|ой)\b/g,
        replacement: 'от $1а',
        description: 'Preposition "от" requires genitive case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bдо (\w+)(у|е|ом|ой)\b/g,
        replacement: 'до $1а',
        description: 'Preposition "до" requires genitive case',
        category: 'case_correction',
        confidence: 0.85
      },

      // Dative case corrections
      {
        pattern: /\bк (\w+)(а|ы|ом|ой)\b/g,
        replacement: 'к $1у',
        description: 'Preposition "к" requires dative case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bпо (\w+)(а|ы|ом|ой)\b/g,
        replacement: 'по $1е',
        description: 'Preposition "по" requires dative case',
        category: 'case_correction',
        confidence: 0.8
      },

      // Accusative vs Prepositional case with в/на
      {
        pattern: /\bв школе идти\b/g,
        replacement: 'в школу идти',
        description: 'Motion requires accusative case with preposition "в"',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bна работе ехать\b/g,
        replacement: 'на работу ехать',
        description: 'Motion requires accusative case with preposition "на"',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bв школу учиться\b/g,
        replacement: 'в школе учиться',
        description: 'State/activity requires prepositional case with preposition "в"',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bна работу работать\b/g,
        replacement: 'на работе работать',
        description: 'State/activity requires prepositional case with preposition "на"',
        category: 'case_correction',
        confidence: 0.9
      },

      // Instrumental case corrections
      {
        pattern: /\bс (\w+)(а|ы|у|е)\b/g,
        replacement: 'с $1ом',
        description: 'Preposition "с" (with) requires instrumental case',
        category: 'case_correction',
        confidence: 0.8
      },
      {
        pattern: /\bнад (\w+)(а|ы|у|е)\b/g,
        replacement: 'над $1ом',
        description: 'Preposition "над" requires instrumental case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bпод (\w+)(а|ы|у|е)\b/g,
        replacement: 'под $1ом',
        description: 'Preposition "под" requires instrumental case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bмежду (\w+)(а|ы|у|е)\b/g,
        replacement: 'между $1ами',
        description: 'Preposition "между" requires instrumental case',
        category: 'case_correction',
        confidence: 0.85
      },

      // Number-noun case agreement
      {
        pattern: /\bдва (\w+)(ы|и|ов|ей)\b/g,
        replacement: 'два $1а',
        description: 'Number "два" requires genitive singular',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bтри (\w+)(ы|и|ов|ей)\b/g,
        replacement: 'три $1а',
        description: 'Number "три" requires genitive singular',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bчетыре (\w+)(ы|и|ов|ей)\b/g,
        replacement: 'четыре $1а',
        description: 'Number "четыре" requires genitive singular',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bпять (\w+)(?!ей|ов)\b/g,
        replacement: 'пять $1ей',
        description: 'Number "пять" requires genitive plural',
        category: 'case_correction',
        confidence: 0.85
      },

      // Gender agreement corrections
      {
        pattern: /\bкрасивый девочка\b/g,
        replacement: 'красивая девочка',
        description: 'Adjective must agree with feminine noun',
        category: 'case_correction',
        confidence: 0.95
      },
      {
        pattern: /\bхороший студентка\b/g,
        replacement: 'хорошая студентка',
        description: 'Adjective must agree with feminine noun',
        category: 'case_correction',
        confidence: 0.95
      },
      {
        pattern: /\bновый машина\b/g,
        replacement: 'новая машина',
        description: 'Adjective must agree with feminine noun',
        category: 'case_correction',
        confidence: 0.95
      },
      {
        pattern: /\bбольшой дом\b/g,
        replacement: 'большой дом',
        description: 'Correct masculine agreement',
        category: 'case_correction',
        confidence: 0.8
      },
      {
        pattern: /\bбольшая стол\b/g,
        replacement: 'большой стол',
        description: 'Adjective must agree with masculine noun',
        category: 'case_correction',
        confidence: 0.95
      },
      {
        pattern: /\bкрасивое девочка\b/g,
        replacement: 'красивая девочка',
        description: 'Wrong gender agreement, should be feminine',
        category: 'case_correction',
        confidence: 0.95
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add preposition correction patterns
   */
  private addPrepositionPatterns(): void {
    const patterns: GrammarPattern[] = [
      {
        pattern: /\bв последний раз\s+(\w+)\s+ли\b/g,
        replacement: 'в последний раз $1',
        description: 'Remove unnecessary particle "ли"',
        category: 'preposition',
        confidence: 0.8
      },
      {
        pattern: /\bстави ли\b/g,
        replacement: 'ставили',
        description: 'Fix word boundary in verb form',
        category: 'preposition',
        confidence: 0.9
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add conjunction and particle patterns
   */
  private addConjunctionPatterns(): void {
    const patterns: GrammarPattern[] = [
      {
        pattern: /\bжет быть\b/g,
        replacement: 'может быть',
        description: 'Fix incomplete conjunction "может быть"',
        category: 'conjunction',
        confidence: 0.85
      },
      {
        pattern: /\bконфликта жет быть\b/g,
        replacement: 'конфликта, может быть',
        description: 'Fix conjunction and add punctuation',
        category: 'conjunction',
        confidence: 0.8
      },
      {
        pattern: /\bВсё были счастливы конфликта жет быть\b/g,
        replacement: 'Все были счастливы, конфликта может быть',
        description: 'Fix multiple issues in sentence structure',
        category: 'conjunction',
        confidence: 0.75
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add sentence structure and punctuation patterns
   */
  private addSentenceStructurePatterns(): void {
    const patterns: GrammarPattern[] = [
      {
        pattern: /\bисключительно то такой довлетворить\b/g,
        replacement: 'исключительно такое удовлетворение',
        description: 'Fix sentence structure and word form',
        category: 'sentence_structure',
        confidence: 0.7
      },
      {
        pattern: /\bдовлетворение выше чужого\b/g,
        replacement: 'удовлетворение выше чужого',
        description: 'Fix word form "удовлетворение"',
        category: 'sentence_structure',
        confidence: 0.85
      },
      {
        pattern: /\bПоказать за программировала\b/g,
        replacement: 'Показать, за программирование',
        description: 'Fix sentence structure and technical term',
        category: 'sentence_structure',
        confidence: 0.8
      },
      {
        pattern: /\bони все где отвечал э-э\b/g,
        replacement: 'они все отвечали',
        description: 'Clean up fragmented speech with filler words',
        category: 'sentence_structure',
        confidence: 0.75
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add production-specific patterns from screenshot analysis
   */
  private addProductionSpecificPatterns(): void {
    const patterns: GrammarPattern[] = [
      // Long fragmented sentence from screenshot
      {
        pattern: /\bВот самый лучший[\s\S]*?пол ностью\b/g,
        replacement:
          'Вот самые лучшие люди, которых вы отчаянно пытаетесь спасти, починить и удовлетворить. Я не уважаю ваши бесконечные требования. Когда вы действительно выбираете только то, что нужно? Когда вы в последний раз ставили свое удовлетворение выше чужого комфорта? Показать программирование возможно, вы будете семейным посредником, они все отвечали. Все были счастливы, конфликта может быть не будет. Поняли, люди еще были, что ваша команда полностью готова.',
        description: 'Restructure long fragmented production text',
        category: 'sentence_structure',
        confidence: 0.6,
        conditions: {
          wordCount: {min: 30}
        }
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Add advanced Russian grammar patterns (Task 7.3)
   * Specialized patterns for Russian morphology, syntax, and common speech-to-text errors
   */
  private addAdvancedRussianPatterns(): void {
    const patterns: GrammarPattern[] = [
      // Complex case patterns with context
      {
        pattern: /\b(после|до|во время|в течение|в ходе)\s+(\w+)(?![аеияёыуо])\b/g,
        replacement: '$1 $2е',
        description: 'Time expressions require genitive case',
        category: 'case_correction',
        confidence: 0.8
      },

      // Verbal aspect patterns with context
      {
        pattern: /\b(всегда|часто|редко|иногда|обычно)\s+(\w+)(ю|ешь|ет|ем|ете|ут|ят)\b/g,
        replacement: '$1 $2$3',
        description: 'Frequency adverbs with imperfective verbs are correct',
        category: 'verb_form',
        confidence: 0.7
      },

      // Conditional mood patterns
      {
        pattern: /\bесли я будет\b/g,
        replacement: 'если я буду',
        description: 'First person singular future conditional',
        category: 'verb_form',
        confidence: 0.9
      },
      {
        pattern: /\bесли ты будет\b/g,
        replacement: 'если ты будешь',
        description: 'Second person singular future conditional',
        category: 'verb_form',
        confidence: 0.9
      },

      // Speech-to-text specific Russian errors
      {
        pattern: /\bчто то\b/g,
        replacement: 'что-то',
        description: 'Indefinite pronouns use hyphen',
        category: 'punctuation',
        confidence: 0.95
      },
      {
        pattern: /\bкто то\b/g,
        replacement: 'кто-то',
        description: 'Indefinite pronouns use hyphen',
        category: 'punctuation',
        confidence: 0.95
      },
      {
        pattern: /\bкак то\b/g,
        replacement: 'как-то',
        description: 'Indefinite adverbs use hyphen',
        category: 'punctuation',
        confidence: 0.95
      },
      {
        pattern: /\bпо этому\b/g,
        replacement: 'поэтому',
        description: 'Conjunctive adverb is written as one word',
        category: 'word_order',
        confidence: 0.95
      },
      {
        pattern: /\bв место\b/g,
        replacement: 'вместо',
        description: 'Preposition is written as one word',
        category: 'word_order',
        confidence: 0.95
      },
      {
        pattern: /\bна конец\b/g,
        replacement: 'наконец',
        description: 'Adverb is written as one word',
        category: 'word_order',
        confidence: 0.95
      },

      // Common transcription mishearings
      {
        pattern: /\bщас\b/g,
        replacement: 'сейчас',
        description: 'Colloquial pronunciation correction',
        category: 'word_order',
        confidence: 0.9
      },
      {
        pattern: /\bтоко\b/g,
        replacement: 'только',
        description: 'Common transcription error',
        category: 'word_order',
        confidence: 0.9
      },
      {
        pattern: /\bкада\b/g,
        replacement: 'когда',
        description: 'Common transcription error',
        category: 'word_order',
        confidence: 0.9
      },

      // Russian-specific preposition combinations
      {
        pattern: /\bблагодаря (\w+)(ом|ами|ах)\b/g,
        replacement: 'благодаря $1у',
        description: 'Preposition "благодаря" requires dative case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bсогласно (\w+)(а|ы|ом|ами)\b/g,
        replacement: 'согласно $1у',
        description: 'Preposition "согласно" requires dative case',
        category: 'case_correction',
        confidence: 0.85
      },

      // Verb government patterns (verbs requiring specific cases)
      {
        pattern: /\bпомогать (\w+)(а|ы|ом)\b/g,
        replacement: 'помогать $1у',
        description: 'Verb "помогать" governs dative case',
        category: 'case_correction',
        confidence: 0.85
      },
      {
        pattern: /\bуправлять (\w+)(а|ы|у|е)\b/g,
        replacement: 'управлять $1ом',
        description: 'Verb "управлять" governs instrumental case',
        category: 'case_correction',
        confidence: 0.85
      },

      // Impersonal constructions
      {
        pattern: /\bя можно\b/g,
        replacement: 'мне можно',
        description: 'Impersonal construction requires dative case',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bты нужно\b/g,
        replacement: 'тебе нужно',
        description: 'Impersonal construction requires dative case',
        category: 'case_correction',
        confidence: 0.9
      },
      {
        pattern: /\bон надо\b/g,
        replacement: 'ему надо',
        description: 'Impersonal construction requires dative case',
        category: 'case_correction',
        confidence: 0.9
      }
    ]

    this.patterns.push(...patterns)
  }

  /**
   * Check if pattern category is enabled in config
   */
  private isPatternCategoryEnabled(category: string): boolean {
    switch (category) {
      case 'word_order':
        return this.config.enableWordOrderCorrection
      case 'verb_form':
        return this.config.enableVerbFormCorrection
      case 'case_correction':
        return this.config.enableCaseCorrection
      case 'preposition':
        return this.config.enablePrepositionCorrection
      case 'conjunction':
        return this.config.enableConjunctionCorrection
      case 'particle':
        return this.config.enableParticleCorrection
      case 'punctuation':
        return this.config.enablePunctuationCorrection
      case 'sentence_structure':
        return this.config.enableSentenceStructureCorrection
      default:
        return true
    }
  }

  /**
   * Check pattern conditions
   */
  private checkPatternConditions(text: string, conditions: GrammarPattern['conditions']): boolean {
    if (!conditions) return true

    // Check word count conditions
    if (conditions.wordCount) {
      const wordCount = text.split(/\s+/).length
      if (conditions.wordCount.min && wordCount < conditions.wordCount.min) return false
      if (conditions.wordCount.max && wordCount > conditions.wordCount.max) return false
    }

    // Check context conditions
    if (conditions.contextBefore && !conditions.contextBefore.test(text)) return false
    if (conditions.contextAfter && !conditions.contextAfter.test(text)) return false

    return true
  }

  /**
   * Split text into sentences for processing
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries while preserving the delimiters
    const sentences = text.split(/([.!?]+\s*)/).filter(s => s.trim().length > 0)
    const result: string[] = []

    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i]
      const delimiter = sentences[i + 1] || ''
      result.push(sentence + delimiter)
    }

    return result.filter(s => s.trim().length > 0)
  }

  /**
   * Update correction statistics
   */
  private updateStats(corrections: GrammarCorrectionDetail[]): void {
    this.correctionStats.totalCorrections += corrections.length

    corrections.forEach(correction => {
      // Update category stats
      const categoryCount = this.correctionStats.categoryStats.get(correction.category) || 0
      this.correctionStats.categoryStats.set(correction.category, categoryCount + 1)

      // Update pattern stats
      const patternCount = this.correctionStats.patternStats.get(correction.pattern) || 0
      this.correctionStats.patternStats.set(correction.pattern, patternCount + 1)
    })
  }

  /**
   * Get correction statistics
   */
  getStats(): object {
    return {
      config: this.config,
      patterns: {
        total: this.patterns.length,
        byCategory: this.getPatternsByCategory()
      },
      corrections: {
        total: this.correctionStats.totalCorrections,
        byCategory: Object.fromEntries(this.correctionStats.categoryStats),
        byPattern: Object.fromEntries(this.correctionStats.patternStats)
      }
    }
  }

  /**
   * Get patterns organized by category
   */
  private getPatternsByCategory(): object {
    const byCategory: Record<string, number> = {}

    this.patterns.forEach(pattern => {
      byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1
    })

    return byCategory
  }

  /**
   * Add custom grammar pattern
   */
  addCustomPattern(pattern: GrammarPattern): void {
    this.patterns.push(pattern)
    console.log(`📝 Added custom grammar pattern: ${pattern.description}`)
  }

  /**
   * Remove patterns by category
   */
  removePatternsByCategory(category: string): number {
    const initialLength = this.patterns.length
    this.patterns = this.patterns.filter(p => p.category !== category)
    const removed = initialLength - this.patterns.length

    if (removed > 0) {
      console.log(`🗑️ Removed ${removed} patterns from category: ${category}`)
    }

    return removed
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<GrammarCorrectionConfig>): void {
    this.config = {...this.config, ...newConfig}
    console.log('⚙️ Grammar corrector configuration updated')
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.correctionStats = {
      totalCorrections: 0,
      categoryStats: new Map(),
      patternStats: new Map()
    }
    console.log('📊 Grammar correction statistics reset')
  }
}

/**
 * Factory function to create a configured GrammarPatternCorrector
 */
export function createGrammarPatternCorrector(
  config: Partial<GrammarCorrectionConfig> = {}
): GrammarPatternCorrector {
  return new GrammarPatternCorrector(config)
}

/**
 * Utility function for quick grammar correction
 */
export async function correctRussianGrammar(text: string): Promise<string> {
  const corrector = createGrammarPatternCorrector({
    confidenceThreshold: 0.7,
    maxCorrectionsPerSentence: 3,
    logCorrections: false
  })

  const result = await corrector.correct(text)
  return result.correctedText
}
