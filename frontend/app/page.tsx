"use client";

import { useMemo, useState } from "react";
import { buildFewShotPrompt, selectSimilarExamples } from "../lib/insightDataset";

type GrammarId =
  | "auto"
  | "tense"
  | "inanimate-subject"
  | "present-perfect"
  | "conditional"
  | "progressive"
  | "future"
  | "passive"
  | "infinitive"
  | "structure";

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
    description: "現在・過去・未来・完了など、時間の捉え方を中心に問います。",
    keywords: "yesterday / now / will / for / since",
  },
  {
    id: "inanimate-subject",
    label: "無生物主語",
    description: "人ではない主語が、どのような結果や変化を引き起こすかを問います。",
    keywords: "make / bring / allow / prevent / cause",
  },
  {
    id: "present-perfect",
    label: "現在完了形",
    description: "過去から現在へのつながりを has/have done で考えます。",
    keywords: "has / have + 過去分詞",
  },
  {
    id: "conditional",
    label: "時・条件の副詞節",
    description: "if / when 節では、未来の内容でも現在形を使う点に注目します。",
    keywords: "if / when / unless",
  },
  {
    id: "progressive",
    label: "進行形",
    description: "am/are/is doing で、今まさに進行中の動作を表します。",
    keywords: "be + doing",
  },
  {
    id: "future",
    label: "未来表現",
    description: "will do / be going to do など、これから起こることを表します。",
    keywords: "will / be going to",
  },
  {
    id: "passive",
    label: "受動態",
    description: "be done で「〜される」を作るときの be 動詞と過去分詞に注目します。",
    keywords: "be + 過去分詞",
  },
  {
    id: "infinitive",
    label: "不定詞",
    description: "to do が目的・原因・名詞的用法など、文中で何の働きをするかを考えます。",
    keywords: "to + 動詞の原形",
  },
  {
    id: "structure",
    label: "文構造・語法",
    description: "主語・動詞・目的語・修飾語の関係や語法を問います。",
    keywords: "SVOC / 前置詞 / 語法",
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
  presentPerfect: /\b(has|have)\s+([a-z]+(?:ed|en)|been|done|gone|seen|written|known|lived|studied|visited|worked)\b/i,
  conditional: /\b(If|When|Unless)\s+([^,.]+),\s*([^.!?]+)/i,
  progressive: /\b(am|are|is)\s+([a-z]+ing)\b/i,
  future: /\b(will)\s+([a-z]+)\b/i,
  passive: /\b(am|are|is|was|were|be|been)\s+([a-z]+ed|made|known|seen|written|built|given|called)\b/i,
  infinitive: /\b(to)\s+([a-z]+)\b/i,
  tense: /\b(will|yesterday|tomorrow|now|ago|for|since|last|next|has|have|was|were|is|are|am)\b/i,
  inanimateSubject: /^(Self-driving cars|This|That|The [A-Z]?[a-z-]+|[A-Z][a-z-]+(?:ing)? [a-z-]+)\s+(will\s+)?(make|made|makes|bring|brings|brought|allow|allows|allowed|prevent|prevents|prevented|cause|causes|caused)\b/i,
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
    ...getGrammarOption("conditional"),
    detector: (sentence) => tokenPatterns.conditional.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.conditional);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], "will"], {
        japanese: "時・条件を表す節と主節の時制関係を確認する英文。",
        tip: "条件を表すまとまりはどこまで? 未来の内容でも副詞節内はどの時制にする? 主節では未来をどう表す?",
        explanation:
          "時・条件を表す副詞節では、未来の内容でも現在形を使う。主節では will do などで未来に起こることを表す。",
        wordsToUse: "if / when / present tense / will / main clause",
      });
    },
  },
  {
    ...getGrammarOption("present-perfect"),
    detector: (sentence) => tokenPatterns.presentPerfect.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.presentPerfect);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], match[2], "for", "since"], {
        japanese: "過去に始まった状態・経験・完了が、現在とどうつながっているかを考える英文。",
        tip: "過去の一点だけを述べている? それとも現在とのつながりを述べている? 主語に合わせる助動詞は?",
        explanation:
          "現在完了形は has/have + 過去分詞で表す。for や since など期間を表す語句があるときは、過去から現在まで続く状態として考える。",
        wordsToUse: "has / have / past participle / for / since",
      });
    },
  },
  {
    ...getGrammarOption("progressive"),
    detector: (sentence) => tokenPatterns.progressive.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.progressive);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], match[2], "now"], {
        japanese: "今まさに行われている動作を表す英文。",
        tip: "「今しているところ」を表す形は? be 動詞は主語に合わせてどう変える? 動詞の語尾は?",
        explanation:
          "現在進行形は am/are/is doing の形で、今まさに行われている動作や一時的な状況を表す。",
        wordsToUse: "am / are / is / doing / now",
      });
    },
  },
  {
    ...getGrammarOption("future"),
    detector: (sentence) => tokenPatterns.future.test(sentence),
    blanker: (sentence, blankCount) => {
      const match = sentence.match(tokenPatterns.future);
      if (!match) return null;
      return makeDraftFromFocus(sentence, blankCount, [match[1], match[2], "tomorrow", "next"], {
        japanese: "未来に起こると予想される事柄を表す英文。",
        tip: "「〜するだろう」と未来の予想を表す助動詞は? 助動詞の後ろの動詞の形は?",
        explanation:
          "will do は未来に起こると予想される事柄を表す一般的な形。助動詞 will の後ろには動詞の原形を置く。",
        wordsToUse: "will / base verb / tomorrow / next",
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
        tip: "主語は動作をする側? される側? 「〜される」を表す基本の形は?",
        explanation:
          "受動態は be 動詞 + 過去分詞で表す。be 動詞は主語と時制に合わせて、過去分詞は動詞ごとの形を確認する。",
        wordsToUse: "be / past participle / by",
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
        tip: "to の後ろに続く動詞の形は? to do のまとまりは文の中で何の役割をしている?",
        explanation:
          "不定詞は to + 動詞の原形で表す。名詞・形容詞・副詞のように働き、文脈によって意味を判断する。",
        wordsToUse: "to / base verb / purpose / adjective use",
      });
    },
  },
  {
    ...getGrammarOption("tense"),
    detector: (sentence) => tokenPatterns.tense.test(sentence),
    blanker: (sentence, blankCount) => {
      const tenseWords = sentence.match(/\b(will|has|have|was|were|is|are|am|yesterday|tomorrow|now|ago|for|since|last|next)\b/gi) ?? [];
      return makeDraftFromFocus(sentence, blankCount, tenseWords, {
        japanese: "時を表す語句と動詞の形の対応を考える英文。",
        tip: "この文はいつの出来事・状態を表している? 時を示す語句はどれ? その時間に合う動詞の形は?",
        explanation:
          "時制問題では、まず時を表す語句や文脈を見つけ、現在・過去・未来・完了・進行のどれで捉えるかを決める。",
        wordsToUse: "tense marker / present / past / future / perfect / progressive",
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
        explanation:
          "無生物主語では、物・出来事・制度などを主語にし、その主語が人や状況に与える影響を動詞で表す。日本語では「〜によって」「〜のおかげで」のように訳すことが多い。",
        wordsToUse: "inanimate subject / make / allow / prevent / cause / result",
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

function fallbackExercise(sentence: string, blankCount: number, grammarId: GrammarId = "structure"): ExerciseDraft {
  const option = getGrammarOption(grammarId === "auto" ? "structure" : grammarId);
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
  const option = focus ?? getGrammarOption(grammarId === "auto" ? "structure" : grammarId);

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
