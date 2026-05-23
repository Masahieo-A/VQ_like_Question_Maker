"use client";

import { useMemo, useState } from "react";
import { buildFewShotPrompt, selectSimilarExamples } from "../lib/insightDataset";

type GrammarId =
  | "auto"
  | "tense"
  | "perfect"
  | "passive"
  | "modal"
  | "infinitive"
  | "gerund"
  | "participle"
  | "subjunctive"
  | "relative"
  | "comparative"
  | "negation"
  | "inanimate-subject"
  | "noun-construction"
  | "conjunction"
  | "preposition"
  | "interrogative"
  | "pronoun";

type GrammarOption = {
  id: GrammarId;
  label: string;
  description: string;
  keywords: string;
};

type GrammarFocus = GrammarOption & {
  detector: (sentence: string) => boolean;
  blanker: (sentence: string, blankCount: number) => ExerciseDraft | null;
};

type ExerciseDraft = {
  japanese: string;
  cloze: string;
  answer: string;
  tip: string;
  explanation: string;
  wordsToUse: string;
};

type SentenceSetting = {
  grammarId: GrammarId;
  blankCount: number;
};

type ApiGenerationResult = {
  sentence: string;
  mode: "openai" | "dataset-only";
  generated: unknown;
};

const fewShotExamples = [
  {
    focus: "現在形：習慣・不変の事実",
    japanese: "父はよくネットで買い物をする。",
    cloze: "My father often ( )( ).",
    answer: "shops / online",
    tip: "「現在の習慣」を表すとき、時制はどうする? 「買い物をする」を1語の自動詞で表すと?",
  },
  {
    focus: "現在進行形：今まさに行われている動作",
    japanese: "その女性は花に水をやっている。",
    cloze: "The woman ( )( ) some flowers.",
    answer: "is / watering",
    tip: "「現在行っている動作」を表す形は? 「〜に水をやる」を表す他動詞は?",
  },
  {
    focus: "過去形：過去の一時点・過去を示す語句",
    japanese: "おととしの夏、家族で富士山に登った。",
    cloze: "I ( ) Mt. Fuji with my family two ( ) ago.",
    answer: "climbed / summers",
    tip: "「過去を示す表現」と共に使われる時制は? 日本語を英語らしい語順に置き換えると?",
  },
  {
    focus: "未来表現：予想される未来",
    japanese: "自動運転車は交通をより安全にするだろう。",
    cloze: "Self-driving cars ( )( ) transportation safer.",
    answer: "will / make",
    tip: "「〜するだろう」と未来に起こると予想される事柄を表す一般的な表現は?",
  },
];

const sampleInput =
  "Self-driving cars will make transportation safer.\nShe has lived in Kyoto for three years.\nIf it rains tomorrow, we will stay home.";

const blankCountOptions = [1, 2, 3, 4];

const grammarOptions: GrammarOption[] = [
  {
    id: "auto",
    label: "自動判定",
    description: "英文内の目印からサービス側が文法項目を推定します。",
    keywords: "文法項目を指定しない場合",
  },
  {
    id: "tense",
    label: "時制",
    description: "現在・過去・未来など、時間の捉え方と動詞の形を問います。",
    keywords: "yesterday / now / ago / last / next / was / were",
  },
  {
    id: "perfect",
    label: "完了形",
    description: "has/have/had + 過去分詞で過去から現在・過去へのつながりを考えます。",
    keywords: "has / have / had + 過去分詞 / for / since / already / just",
  },
  {
    id: "passive",
    label: "受動態",
    description: "be done で「〜される」を作るときの be 動詞と過去分詞に注目します。",
    keywords: "be + 過去分詞 / by",
  },
  {
    id: "modal",
    label: "助動詞",
    description: "must / can / should / may など、話し手の判断・意志・推量を表します。",
    keywords: "must / can / should / may / might / would / could / have to",
  },
  {
    id: "infinitive",
    label: "不定詞",
    description: "to do が名詞・形容詞・副詞として文中で何の役割を担うかを考えます。",
    keywords: "to + 動詞の原形",
  },
  {
    id: "gerund",
    label: "動名詞",
    description: "doing が名詞として主語・目的語・補語になる用法を問います。",
    keywords: "doing / enjoy / finish / stop / mind / avoid",
  },
  {
    id: "participle",
    label: "分詞",
    description: "doing / done が形容詞として名詞を修飾する用法や分詞構文を問います。",
    keywords: "現在分詞 / 過去分詞 / 分詞構文",
  },
  {
    id: "subjunctive",
    label: "仮定法",
    description: "事実と異なる仮定を If S' did, S would do の形で考えます。",
    keywords: "if / were / would / could / had done / wish",
  },
  {
    id: "relative",
    label: "関係詞",
    description: "who / which / that / where などで名詞を後置修飾する構造を問います。",
    keywords: "who / which / that / where / when / whose / whom",
  },
  {
    id: "comparative",
    label: "比較",
    description: "比較級・最上級・同等比較など、程度の比べ方を問います。",
    keywords: "more / most / -er / -est / as ~ as / than / less",
  },
  {
    id: "negation",
    label: "否定",
    description: "not / never / no / hardly など、否定を表す語の使い方を問います。",
    keywords: "not / never / no / hardly / scarcely / seldom / rarely",
  },
  {
    id: "inanimate-subject",
    label: "無生物主語",
    description: "人ではない主語が、どのような結果や変化を引き起こすかを問います。",
    keywords: "make / bring / allow / prevent / cause / enable",
  },
  {
    id: "noun-construction",
    label: "名詞構文",
    description: "動詞・形容詞を名詞化して表現する構造を問います。",
    keywords: "-tion / -ness / -ment / -ity / -ance / of",
  },
  {
    id: "conjunction",
    label: "接続詞",
    description: "when / if / because / although など、節をつなぐ接続詞の用法を問います。",
    keywords: "when / if / because / although / while / since / until / unless",
  },
  {
    id: "preposition",
    label: "前置詞",
    description: "in / on / at / by / with など、前置詞の使い分けを問います。",
    keywords: "in / on / at / by / with / for / to / from / of / about",
  },
  {
    id: "interrogative",
    label: "疑問詞",
    description: "what / who / where / when / how など、疑問詞を含む構造を問います。",
    keywords: "what / who / where / when / why / how / which",
  },
  {
    id: "pronoun",
    label: "代名詞",
    description: "it / one / that / those など、代名詞の指示内容や格の形を問います。",
    keywords: "it / one / that / those / this / them / their",
  },
];


const translationDictionary: Record<string, string> = {
  "self-driving cars will make transportation safer":
    "自動運転車は交通をより安全にするだろう。",
  "she has lived in kyoto for three years":
    "彼女は京都に3年間住んでいる。",
  "if it rains tomorrow, we will stay home":
    "もし明日雨が降れば、私たちは家にいるだろう。",
  "i am studying english now": "私は今、英語を勉強している。",
};

const pronounTranslations: Record<string, string> = {
  i: "私は",
  you: "あなたは",
  he: "彼は",
  she: "彼女は",
  we: "私たちは",
  they: "彼らは",
  it: "それは",
};

const nounTranslations: Record<string, string> = {
  english: "英語",
  kyoto: "京都",
  transportation: "交通",
  home: "家",
  cars: "車",
  flowers: "花",
  music: "音楽",
  safer: "より安全",
  safe: "安全",
};

const verbTranslations: Record<string, string> = {
  study: "勉強する",
  studying: "勉強している",
  live: "住む",
  lived: "住んでいる",
  make: "〜を作る / 〜にする",
  stay: "いる",
  rain: "雨が降る",
  rains: "雨が降る",
};

function normalizeSentence(sentence: string) {
  return sentence.toLowerCase().replace(/[.!?]$/g, "").trim();
}

function translateKnownWords(text: string) {
  return text
    .replace(/[.!?]$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const normalized = word.toLowerCase().replace(/[^a-z-]/g, "");
      return pronounTranslations[normalized] ?? nounTranslations[normalized] ?? verbTranslations[normalized] ?? word;
    })
    .join("");
}

function translateSentence(sentence: string): string {
  const normalized = normalizeSentence(sentence);
  const dictionaryTranslation = translationDictionary[normalized];
  if (dictionaryTranslation) {
    return dictionaryTranslation;
  }

  const ifMatch = sentence.match(/^If\s+(.+?),\s*(.+)$/i);
  if (ifMatch) {
    return `もし「${translateSentence(ifMatch[1])}」なら、「${translateSentence(ifMatch[2])}」。`;
  }

  const presentPerfectMatch = sentence.match(/^([A-Za-z]+)\s+(has|have)\s+(.+?)\s+for\s+(.+)$/i);
  if (presentPerfectMatch) {
    const subject = pronounTranslations[presentPerfectMatch[1].toLowerCase()] ?? presentPerfectMatch[1];
    return `${subject}${presentPerfectMatch[4].replace(/[.!?]$/g, "")}の間、${translateKnownWords(presentPerfectMatch[3])}している。`;
  }

  const progressiveMatch = sentence.match(/^([A-Za-z]+)\s+(am|are|is)\s+([A-Za-z]+ing)\s+(.+)$/i);
  if (progressiveMatch) {
    const subject = pronounTranslations[progressiveMatch[1].toLowerCase()] ?? progressiveMatch[1];
    const verb = verbTranslations[progressiveMatch[3].toLowerCase()] ?? `${progressiveMatch[3]}している`;
    const object = translateKnownWords(progressiveMatch[4]);
    return `${subject}${object}を${verb}。`;
  }

  const futureMakeMatch = sentence.match(/^(.+?)\s+will\s+make\s+(.+?)\s+(.+)$/i);
  if (futureMakeMatch) {
    return `${translateKnownWords(futureMakeMatch[1])}は${translateKnownWords(futureMakeMatch[2])}を${translateKnownWords(futureMakeMatch[3])}にするだろう。`;
  }

  const futureMatch = sentence.match(/^(.+?)\s+will\s+([A-Za-z]+)\s*(.*)$/i);
  if (futureMatch) {
    const verb = verbTranslations[futureMatch[2].toLowerCase()] ?? futureMatch[2];
    return `${translateKnownWords(futureMatch[1])}は${translateKnownWords(futureMatch[3])}${verb}だろう。`;
  }

  return `日本語訳（自動下訳）: ${translateKnownWords(sentence.replace(/[.!?]$/g, ""))}`;
}

const tokenPatterns = {
  perfect: /\b(has|have|had)\s+([a-z]+(?:ed|en)|been|done|gone|seen|written|known|lived|studied|visited|worked|had)\b/i,
  passive: /\b(am|are|is|was|were|be|been)\s+([a-z]+ed|made|known|seen|written|built|given|called|used|replaced|stolen)\b/i,
  modal: /\b(must|can|could|should|may|might|would|ought to|have to|has to|had to|need to)\b/i,
  subjunctive: /\bIf\s+[^,]+(were|had\s+[a-z]+|[a-z]+ed)[^,]*,\s*[^.]+\b(would|could|might)\b/i,
  relative: /\b(who|which|where|when|whose|whom)\b(?!\s*\?)/i,
  comparative: /\b(more|most|less|least|better|best|worse|worst|fewer|fewest)\s+[a-z]|\b[a-z]+(?:er|est)\b.*\b(than|as)\b|\bas\s+[a-z]+\s+as\b/i,
  negation: /\b(not|never|no|nobody|nothing|nowhere|hardly|scarcely|seldom|rarely|without)\b/i,
  conjunction: /\b(because|although|though|while|since|until|unless|after|before|whenever|wherever|as soon as)\b|\bIf\s+[a-z]/i,
  interrogative: /^(What|Who|Where|When|Why|How|Which)\b/i,
  infinitive: /\b(to)\s+([a-z]+)\b/i,
  gerund: /\b(enjoy|finish|stop|mind|avoid|consider|suggest|practice|keep|imagine|give up|look forward to)\s+([a-z]+ing)\b|\b([A-Z][a-z]+ing)\s+(is|are|was|were)\b/i,
  participle: /\b([a-z]+(?:ing|ed))\s+(?:by\s+)?[a-z]/i,
  nounConstruction: /\b([a-z]+(?:tion|ness|ment|ity|ance|ence|al|ure))\b/i,
  preposition: /\b(in|on|at|by|with|for|from|of|about|into|through|during|after|before|between|among|over|under|near|around)\b/i,
  pronoun: /\b(it|one|those|these|them|their|its|our|us|your)\b/i,
  tense: /\b(yesterday|tomorrow|now|ago|last|next|was|were|is|are|am|will|going to)\b/i,
  inanimateSubject: /^(Self-driving cars|This|That|The [A-Z]?[a-z-]+|[A-Z][a-z-]+(?:ing)? [a-z-]+)\s+(will\s+)?(make|made|makes|bring|brings|brought|allow|allows|allowed|prevent|prevents|prevented|cause|causes|caused|enable|enables|enabled)\b/i,
};

function getGrammarOption(grammarId: GrammarId) {
  return grammarOptions.find((option) => option.id === grammarId) ?? grammarOptions[0];
}

function uniqueByIndex(indexes: number[], max: number) {
  return [...new Set(indexes)].filter((index) => index >= 0 && index < max);
}

function tokenize(sentence: string) {
  return sentence.match(/[A-Za-z']+|[^A-Za-z']+/g) ?? [sentence];
}

function applyBlanks(sentence: string, preferredWords: string[], blankCount: number) {
  const tokens = tokenize(sentence);
  const preferredIndexes = preferredWords
    .map((preferredWord) =>
      tokens.findIndex((token) => token.toLowerCase() === preferredWord.toLowerCase()),
    )
    .filter((index) => index >= 0);
  const contentIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => /^[A-Za-z']+$/.test(token) && token.length > 3)
    .map(({ index }) => index);
  const shortWordIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => /^[A-Za-z']+$/.test(token))
    .map(({ index }) => index);
  const selectedIndexes = uniqueByIndex(
    [...preferredIndexes, ...contentIndexes, ...shortWordIndexes],
    tokens.length,
  ).slice(0, blankCount);
  const answers = selectedIndexes.map((index) => tokens[index]);
  const cloze = tokens
    .map((token, index) => (selectedIndexes.includes(index) ? "( )" : token))
    .join("");

  return {
    cloze,
    answer: answers.join(" / ") || sentence,
  };
}

function makeDraftFromFocus(
  sentence: string,
  blankCount: number,
  preferredWords: string[],
  draft: Omit<ExerciseDraft, "cloze" | "answer">,
): ExerciseDraft {
  return {
    ...draft,
    ...applyBlanks(sentence, preferredWords, blankCount),
  };
}

const grammarFocuses: GrammarFocus[] = [
  {
    ...getGrammarOption("perfect"),
    detector: (sentence) => tokenPatterns.perfect.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.perfect);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], match[2], "for", "since", "already", "just", "ever", "never"], {
        japanese: "過去から現在・過去へのつながりを表す英文。",
        tip: "時制はいつからいつまでのつながりを表している? has/have/had の後ろの動詞の形は? for と since の使い分けは?",
        explanation: "完了形は has/have/had + 過去分詞で表す。現在完了は過去から現在、過去完了は大過去から過去へのつながりを示す。",
        wordsToUse: "has / have / had / past participle / for / since / already / just",
      });
    },
  },
  {
    ...getGrammarOption("passive"),
    detector: (sentence) => tokenPatterns.passive.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.passive);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], match[2], "by"], {
        japanese: "主語が動作を受ける側になっている英文。",
        tip: "主語は動作をする側? される側? 「〜される」を表す基本の形は? be 動詞は時制に合わせてどう変わる?",
        explanation: "受動態は be 動詞 + 過去分詞で表す。be 動詞は主語と時制に合わせて変化し、過去分詞は動詞ごとの形を確認する。",
        wordsToUse: "be / past participle / by",
      });
    },
  },
  {
    ...getGrammarOption("subjunctive"),
    detector: (sentence) => tokenPatterns.subjunctive.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.subjunctive);
      const preferred = match ? [match[1], match[2], "would", "could"] : ["would", "could", "were"];
      return makeDraftFromFocus(sentence, blankCount, preferred.filter(Boolean), {
        japanese: "現実とは異なる仮定を述べている英文。",
        tip: "これは今の事実? 過去の事実? それと違うことを述べるには動詞・助動詞をどの形にする?",
        explanation: "仮定法では動詞を過去形や過去完了形にして、実際には起こっていないことを表す。If S' did, S would do が仮定法過去の基本形。",
        wordsToUse: "if / were / would / could / had done / wish",
      });
    },
  },
  {
    ...getGrammarOption("relative"),
    detector: (sentence) => tokenPatterns.relative.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.relative);
      const preferred = match ? [match[1]] : ["who", "which", "that"];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "関係詞が名詞を後ろから修飾している英文。",
        tip: "先行詞は何? 関係詞節の中で関係詞はどんな役割をしている(主格/目的格/所有格)? 先行詞が人か物かで関係詞は変わる?",
        explanation: "関係代名詞は先行詞と関係詞節をつなぐ。who は人、which は物・事、that は両方に使える。",
        wordsToUse: "who / which / that / where / when / whose / whom",
      });
    },
  },
  {
    ...getGrammarOption("modal"),
    detector: (sentence) => tokenPatterns.modal.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.modal);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1]], {
        japanese: "話し手の判断・意志・義務・推量を助動詞で表した英文。",
        tip: "この文で表している気持ちは義務? 推量? 許可? それを表す助動詞は? 助動詞の後ろの動詞の形は?",
        explanation: "助動詞は動詞の前に置いて話し手の気持ちや判断を加える。助動詞の後ろには動詞の原形を置く。must は義務・確信、can は能力・許可、should は当然・忠告を表す。",
        wordsToUse: "must / can / should / may / might / would / could / have to",
      });
    },
  },
  {
    ...getGrammarOption("comparative"),
    detector: (sentence) => tokenPatterns.comparative.test(sentence),
    blanker: (sentence, blankCount) => {
      const compWords = sentence.match(/\b(more|most|less|least|better|best|worse|worst|fewer|fewest|than|as)\b/gi) ?? [];
      return makeDraftFromFocus(sentence, blankCount, compWords, {
        japanese: "二つ以上のものの程度を比べている英文。",
        tip: "比べているものは何と何? 「より〜」は比較級、「最も〜」は最上級、「同じくらい〜」は原級で表すが、この文はどれ?",
        explanation: "比較級は more + 形容詞 または 形容詞 + -er で表し than と使う。最上級は most + 形容詞 または 形容詞 + -est。同等比較は as ~ as を使う。",
        wordsToUse: "more / most / -er / -est / than / as ~ as / less / fewer",
      });
    },
  },
  {
    ...getGrammarOption("negation"),
    detector: (sentence) => tokenPatterns.negation.test(sentence),
    blanker: (sentence, blankCount) => {
      const negWords = sentence.match(/\b(not|never|no|nobody|nothing|nowhere|hardly|scarcely|seldom|rarely|without|few|little)\b/gi) ?? [];
      return makeDraftFromFocus(sentence, blankCount, negWords, {
        japanese: "否定を表す語句が使われている英文。",
        tip: "どの語が否定の意味を担っている? not 以外の否定語は? 準否定語(hardly/seldomなど)の意味は?",
        explanation: "否定文では not だけでなく never / no / hardly / scarcely / seldom など準否定語も否定の意味を表す。二重否定に注意。",
        wordsToUse: "not / never / no / hardly / scarcely / seldom / rarely / without",
      });
    },
  },
  {
    ...getGrammarOption("inanimate-subject"),
    detector: (sentence) => tokenPatterns.inanimateSubject.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.inanimateSubject);
      const preferred = match ? [match[1], match[3], "make", "allow", "prevent", "cause"] : ["make", "allow", "prevent", "cause"];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "人ではない主語が、結果や変化を引き起こしている英文。",
        tip: "主語は人? 物・出来事・仕組み? その主語が何を引き起こすと考える? 日本語では副詞句のように訳すと自然では?",
        explanation: "無生物主語では、物・出来事・制度などを主語にし、その主語が人や状況に与える影響を動詞で表す。日本語では「〜によって」「〜のおかげで」のように訳すことが多い。",
        wordsToUse: "inanimate subject / make / allow / prevent / cause / enable / result",
      });
    },
  },
  {
    ...getGrammarOption("conjunction"),
    detector: (sentence) => tokenPatterns.conjunction.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.conjunction);
      const preferred = match ? [match[1] ?? "if"] : ["because", "although", "while"];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "接続詞が節と節をつないでいる英文。",
        tip: "接続詞が表す意味は時? 条件? 原因? 譲歩? その接続詞が導く節の中の動詞の形は?",
        explanation: "接続詞は二つの節をつなぐ。時・条件を表す副詞節(when/if/until)では、未来でも現在形を使う。",
        wordsToUse: "when / if / because / although / while / since / until / unless / after / before",
      });
    },
  },
  {
    ...getGrammarOption("interrogative"),
    detector: (sentence) => tokenPatterns.interrogative.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.interrogative);
      const preferred = match ? [match[1]] : ["what", "how"];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "疑問詞を含む文で、何を尋ねているかを考える英文。",
        tip: "疑問詞は文中でどんな役割をしている? 間接疑問文なら語順はどうなる(疑問詞+平叙文の語順)?",
        explanation: "疑問詞(what/who/where/when/why/how)は文頭に置いて疑問文を作る。間接疑問では疑問詞 + 平叙文の語順になる。",
        wordsToUse: "what / who / where / when / why / how / which",
      });
    },
  },
  {
    ...getGrammarOption("infinitive"),
    detector: (sentence) => tokenPatterns.infinitive.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.infinitive);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], match[2]], {
        japanese: "to do のまとまりが文中で働いている英文。",
        tip: "to の後ろに続く動詞の形は? to do のまとまりは文の中で何の役割をしている(名詞的/形容詞的/副詞的用法)?",
        explanation: "不定詞は to + 動詞の原形で表す。名詞・形容詞・副詞のように働き、文脈によって意味を判断する。",
        wordsToUse: "to / base verb / purpose / adjective use / noun use",
      });
    },
  },
  {
    ...getGrammarOption("gerund"),
    detector: (sentence) => tokenPatterns.gerund.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.gerund);
      const preferred = match ? [match[2] ?? match[3] ?? ""].filter(Boolean) : [];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "動詞の -ing 形が名詞として働いている英文。",
        tip: "-ing 形が文の中で主語・目的語・補語のどれになっている? 動名詞と不定詞で意味が変わる動詞は?",
        explanation: "動名詞は動詞の原形 + -ing で「〜すること」を表す名詞。主語・補語・目的語になれる。enjoy / finish / stop / avoid などは動名詞のみを目的語に取る。",
        wordsToUse: "doing / enjoy / finish / stop / mind / avoid / consider",
      });
    },
  },
  {
    ...getGrammarOption("participle"),
    detector: (sentence) => tokenPatterns.participle.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.participle);
      const preferred = match ? [match[1]] : [];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "分詞が名詞を修飾するか、分詞構文として使われている英文。",
        tip: "分詞が修飾している名詞は? 名詞と分詞の関係は能動(〜している)か受動(〜された)か?",
        explanation: "現在分詞(doing)は「〜している」、過去分詞(done)は「〜された」の意味で名詞を修飾する。分詞構文では接続詞+主語を省略して分詞で副詞節の意味を表す。",
        wordsToUse: "doing / done / present participle / past participle / 分詞構文",
      });
    },
  },
  {
    ...getGrammarOption("noun-construction"),
    detector: (sentence) => tokenPatterns.nounConstruction.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.nounConstruction);
      const preferred = match ? [match[1]] : [];
      return makeDraftFromFocus(sentence, blankCount, preferred, {
        japanese: "動詞・形容詞を名詞化して表現している英文。",
        tip: "日本語の動詞や形容詞が英語でどんな名詞に変わっている? of の後ろには何が来る?",
        explanation: "名詞構文では動詞・形容詞を名詞化（-tion / -ness / -ment など）して表現する。日本語の動詞文を英語では名詞中心の文で表すことが多い。",
        wordsToUse: "-tion / -ness / -ment / -ity / -ance / of",
      });
    },
  },
  {
    ...getGrammarOption("preposition"),
    detector: (sentence) => tokenPatterns.preposition.test(sentence),
    blanker: (sentence, blankCount) => {
      const prepWords = sentence.match(/\b(in|on|at|by|with|for|from|of|about|into|through|during|after|before|between|among|over|under|near|around)\b/gi) ?? [];
      return makeDraftFromFocus(sentence, blankCount, prepWords.slice(0, blankCount * 2), {
        japanese: "前置詞が正確に使われているかを問う英文。",
        tip: "空欄の前後から、場所・時・手段・理由のどれを表しているか判断できる? その意味を表す前置詞は?",
        explanation: "前置詞は名詞の前に置いて場所・時・手段・方向などを表す。in / on / at の使い分けや、動詞・形容詞と結びつく前置詞に注目する。",
        wordsToUse: "in / on / at / by / with / for / to / from / of / about",
      });
    },
  },
  {
    ...getGrammarOption("pronoun"),
    detector: (sentence) => tokenPatterns.pronoun.test(sentence),
    blanker: (sentence, blankCount) => {
      const pronounWords = sentence.match(/\b(it|one|that|those|this|these|they|their|them|he|she|his|her|its|we|our|us|you|your)\b/gi) ?? [];
      return makeDraftFromFocus(sentence, blankCount, pronounWords.slice(0, blankCount * 2), {
        japanese: "代名詞が何を指しているか、または適切な代名詞の形を問う英文。",
        tip: "この代名詞は何を指している? 人称・数・格は正しい形になっている? it と one の使い分けは?",
        explanation: "代名詞は名詞の代わりに使う語。it / one / that の使い分け、人称・数・格(主格/目的格/所有格)の一致に注目する。",
        wordsToUse: "it / one / that / those / this / they / their / him / her",
      });
    },
  },
  {
    ...getGrammarOption("tense"),
    detector: (sentence) => tokenPatterns.tense.test(sentence),
    blanker: (sentence, blankCount) => {
      const tenseWords = sentence.match(/\b(was|were|is|are|am|will|yesterday|tomorrow|now|ago|last|next)\b/gi) ?? [];
      return makeDraftFromFocus(sentence, blankCount, tenseWords, {
        japanese: "時を表す語句と動詞の形の対応を考える英文。",
        tip: "この文はいつの出来事・状態を表している? 時を示す語句はどれ? その時間に合う動詞の形は?",
        explanation: "時制問題では、まず時を表す語句や文脈を見つけ、現在・過去・未来のどれで捉えるかを決める。",
        wordsToUse: "present / past / future / tense marker / yesterday / tomorrow / ago",
      });
    },
  },
];

function splitIntoSentences(input: string) {
  return input
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function fallbackExercise(sentence: string, blankCount: number, grammarId: GrammarId = "tense"): ExerciseDraft {
  const option = getGrammarOption(grammarId === "auto" ? "tense" : grammarId);
  const preferredWords = option.id === "inanimate-subject" ? ["make", "allow", "prevent", "cause"] : [];

  return makeDraftFromFocus(sentence, blankCount, preferredWords, {
    japanese: `${option.label}を意識して、入力英文の文構造を確認する問題。`,
    tip: `今回は「${option.label}」がポイント。空欄の語は、文の中でどの役割をしている? 前後の語とのつながりは?`,
    explanation:
      "英文を語順だけで暗記せず、指定された文法項目と空欄の前後関係から必要な品詞・形・意味を判断する。",
    wordsToUse: option.keywords,
  });
}

function resolveFocus(sentence: string, grammarId: GrammarId) {
  if (grammarId !== "auto") {
    return grammarFocuses.find((item) => item.id === grammarId) ?? null;
  }

  return grammarFocuses.find((item) => item.detector(sentence)) ?? null;
}

function makeExercise(sentence: string, grammarId: GrammarId, blankCount: number) {
  const focus = resolveFocus(sentence, grammarId);
  const draft = focus?.blanker(sentence, blankCount) ?? fallbackExercise(sentence, blankCount, grammarId);
  const option = focus ?? getGrammarOption(grammarId === "auto" ? "tense" : grammarId);

  return {
    sentence,
    focus: option.label,
    description: option.description,
    requestedBlankCount: blankCount,
    ...draft,
    japanese: translateSentence(sentence),
  };
}

function makeFewShotPrompt(input: string, grammarId: GrammarId, grammarLabel: string, blankCount: number) {
  const examples = selectSimilarExamples(input, grammarId, blankCount, 4);
  return buildFewShotPrompt(input, grammarLabel, blankCount, examples);
}


export default function HomePage() {
  const [input, setInput] = useState(sampleInput);
  const [settingMode, setSettingMode] = useState<"bulk" | "individual">("bulk");
  const [bulkGrammarId, setBulkGrammarId] = useState<GrammarId>("auto");
  const [bulkBlankCount, setBulkBlankCount] = useState(2);
  const [sentenceSettings, setSentenceSettings] = useState<Record<number, SentenceSetting>>({});
  const [apiResults, setApiResults] = useState<ApiGenerationResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const sentences = useMemo(() => splitIntoSentences(input), [input]);

  const exercises = useMemo(
    () =>
      sentences.map((sentence, index) => {
        const individual = sentenceSettings[index];
        const grammarId = settingMode === "individual" ? individual?.grammarId ?? bulkGrammarId : bulkGrammarId;
        const blankCount = settingMode === "individual" ? individual?.blankCount ?? bulkBlankCount : bulkBlankCount;
        return makeExercise(sentence, grammarId, blankCount);
      }),
    [bulkBlankCount, bulkGrammarId, sentenceSettings, sentences, settingMode],
  );
  const prompt = useMemo(() => {
    const grammarLabel =
      settingMode === "bulk"
        ? getGrammarOption(bulkGrammarId).label
        : "文ごとに個別指定";
    return makeFewShotPrompt(input, bulkGrammarId, grammarLabel, bulkBlankCount);
  }, [bulkBlankCount, bulkGrammarId, input, settingMode]);


  async function generateWithApi() {
    setIsGenerating(true);
    setApiError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: sentences.map((sentence, index) => {
            const individual = sentenceSettings[index];
            const grammarId = settingMode === "individual" ? individual?.grammarId ?? bulkGrammarId : bulkGrammarId;
            const blankCount = settingMode === "individual" ? individual?.blankCount ?? bulkBlankCount : bulkBlankCount;
            return {
              sentence,
              grammarId,
              grammarLabel: getGrammarOption(grammarId).label,
              blankCount,
            };
          }),
        }),
      });

      if (!response.ok) {
        throw new Error(`API generation failed: ${response.status}`);
      }

      const data = (await response.json()) as { results: ApiGenerationResult[] };
      setApiResults(data.results);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "API generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateSentenceSetting(index: number, patch: Partial<SentenceSetting>) {
    setSentenceSettings((current) => ({
      ...current,
      [index]: {
        grammarId: current[index]?.grammarId ?? bulkGrammarId,
        blankCount: current[index]?.blankCount ?? bulkBlankCount,
        ...patch,
      },
    }));
  }

  return (
    <div className="stack">
      <section className="hero insight-hero">
        <div>
          <p className="eyebrow">Insight-style grammar generator</p>
          <h1>文法項目を指定して「思考のヒント」付き問題を生成</h1>
          <p className="lead">
            同じ英文でも、時制を問うのか、無生物主語を問うのかで空欄位置と Tip は変わります。文法項目と空欄数を指定して、意図に合う疑似 Vision Quest Insight 風の問題を作ります。
          </p>
        </div>
        <div className="upload-card prompt-card">
          <p className="upload-title">生成ポリシー</p>
          <p className="upload-subtitle">
            まず文法項目を確定し、その文法判断に必要な語句を空欄化。Tip は「どこに注目すべきか」を問いかけます。
          </p>
          <span className="pill">grammar-aware</span>
          <span className="pill">blank count</span>
          <span className="pill">thinking hint</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <div className="section-heading">
            <p className="eyebrow">Input</p>
            <h2>例文をまとめて入力</h2>
          </div>
          <textarea
            className="sentence-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={9}
            aria-label="問題化したい英文"
          />
          <p className="helper-text">
            1文ずつ改行、またはピリオド・疑問符・感嘆符で区切ると複数問を生成できます。
          </p>
        </div>

        <div className="panel settings-panel">
          <div className="section-heading">
            <p className="eyebrow">Grammar settings</p>
            <h2>文法項目と空欄数</h2>
          </div>

          <div className="mode-toggle" aria-label="文法項目と空欄数の設定方法">
            <label className={settingMode === "bulk" ? "mode-option selected" : "mode-option"}>
              <input
                checked={settingMode === "bulk"}
                onChange={() => setSettingMode("bulk")}
                type="checkbox"
              />
              まとめて設定する
            </label>
            <label className={settingMode === "individual" ? "mode-option selected" : "mode-option"}>
              <input
                checked={settingMode === "individual"}
                onChange={() => setSettingMode("individual")}
                type="checkbox"
              />
              個別に設定する
            </label>
          </div>

          <div className="control-grid">
            <label>
              <span>文法項目</span>
              <select
                value={bulkGrammarId}
                onChange={(event) => setBulkGrammarId(event.target.value as GrammarId)}
              >
                {grammarOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>空欄数</span>
              <select
                value={bulkBlankCount}
                onChange={(event) => setBulkBlankCount(Number(event.target.value))}
              >
                {blankCountOptions.map((count) => (
                  <option key={count} value={count}>
                    {count}個
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="helper-text">
            「個別に設定する」を選ぶと、下の文別設定で各英文ごとに文法項目と空欄数を上書きできます。
          </p>
        </div>
      </section>

      <section className="panel sentence-settings">
        <div className="section-heading">
          <p className="eyebrow">Sentence controls</p>
          <h2>文ごとの設定</h2>
        </div>
        <div className="sentence-setting-list">
          {sentences.map((sentence, index) => {
            const current = sentenceSettings[index] ?? {
              grammarId: bulkGrammarId,
              blankCount: bulkBlankCount,
            };
            const disabled = settingMode === "bulk";

            return (
              <div className="sentence-setting-row" key={`${sentence}-${index}`}>
                <div className="sentence-preview">
                  <span>文{index + 1}</span>
                  <p>{sentence}</p>
                </div>
                <label>
                  <span>文法項目</span>
                  <select
                    disabled={disabled}
                    value={current.grammarId}
                    onChange={(event) =>
                      updateSentenceSetting(index, { grammarId: event.target.value as GrammarId })
                    }
                  >
                    {grammarOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>空欄数</span>
                  <select
                    disabled={disabled}
                    value={current.blankCount}
                    onChange={(event) =>
                      updateSentenceSetting(index, { blankCount: Number(event.target.value) })
                    }
                  >
                    {blankCountOptions.map((count) => (
                      <option key={count} value={count}>
                        {count}個
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel prompt-preview">
        <div className="section-heading prompt-heading">
          <div>
            <p className="eyebrow">Few-shot prompt</p>
            <h2>参照トーン</h2>
          </div>
          <button className="primary-button" type="button" onClick={generateWithApi} disabled={isGenerating}>
            {isGenerating ? "生成中..." : "OpenAI APIで生成"}
          </button>
        </div>
        {apiError ? <p className="api-error">{apiError}</p> : null}
        {apiResults.length > 0 ? (
          <div className="api-result-list">
            {apiResults.map((result, index) => (
              <div className="api-result-card" key={`${result.sentence}-${index}`}>
                <p>{result.mode === "openai" ? "OpenAI生成" : "DB類似例のみ（OPENAI_API_KEY未設定）"}</p>
                <pre>{JSON.stringify(result.generated ?? result, null, 2)}</pre>
              </div>
            ))}
          </div>
        ) : null}
        <pre>{prompt}</pre>
      </section>

      <section className="output-section" id="generated-exercises">
        <div className="section-heading">
          <p className="eyebrow">Generated exercises</p>
          <h2>疑似 Insight 問題</h2>
        </div>
        <div className="exercise-list">
          {exercises.map((exercise, index) => (
            <article className="exercise-card" key={`${exercise.sentence}-${index}`}>
              <div className="exercise-header">
                <span className="question-number">Q{index + 1}</span>
                <div>
                  <h3>{exercise.focus}</h3>
                  <p>{exercise.description}</p>
                </div>
              </div>
              <dl className="exercise-detail">
                <div>
                  <dt>元英文</dt>
                  <dd>{exercise.sentence}</dd>
                </div>
                <div>
                  <dt>空欄数</dt>
                  <dd>{exercise.requestedBlankCount}個</dd>
                </div>
                <div>
                  <dt>日本語</dt>
                  <dd>{exercise.japanese}</dd>
                </div>
                <div>
                  <dt>英文（穴埋め）</dt>
                  <dd className="cloze">{exercise.cloze}</dd>
                </div>
                <div>
                  <dt>答え</dt>
                  <dd>{exercise.answer}</dd>
                </div>
                <div>
                  <dt>Tip（思考誘導）</dt>
                  <dd>{exercise.tip}</dd>
                </div>
                <div>
                  <dt>解説</dt>
                  <dd>{exercise.explanation}</dd>
                </div>
                <div>
                  <dt>Words to Use</dt>
                  <dd>{exercise.wordsToUse}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="card-grid">
        {fewShotExamples.map((example) => (
          <div className="card" key={example.focus}>
            <h3>{example.focus}</h3>
            <p className="mini-label">英文（穴埋め）</p>
            <p>{example.cloze}</p>
            <p className="mini-label">Tip</p>
            <p>{example.tip}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
