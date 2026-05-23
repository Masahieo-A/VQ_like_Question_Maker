import dataset from "../data/vision-quest-insight.json";

export type InsightExample = {
  id: number;
  chapter: string;
  grammar: string;
  focus: string;
  japanese: string;
  cloze: string;
  complete: string;
  answer: string;
  tip: string;
  explanation: string;
  wordsToUse: string;
};

export const insightExamples = dataset as InsightExample[];

const grammarAliases: Record<string, string[]> = {
  auto: [],
  tense: ["時制", "過去", "現在", "未来", "時制の一致"],
  "inanimate-subject": ["無生物主語", "make", "cause", "allow", "prevent"],
  "present-perfect": ["現在完了", "完了", "継続", "経験"],
  conditional: ["時・条件", "副詞節", "if", "when", "unless", "until"],
  progressive: ["進行形", "現在進行", "過去進行"],
  future: ["未来", "will", "be going to", "未来完了", "未来進行"],
  passive: ["受動態", "be done"],
  infinitive: ["不定詞", "to do"],
  structure: ["文構造", "語法", "名詞節", "動名詞"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ");
}

function tokenize(value: string) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function blankCountOf(example: InsightExample) {
  return example.answer.split("/").map((item) => item.trim()).filter(Boolean).length;
}

function grammarScore(example: InsightExample, grammarId: string) {
  if (grammarId === "auto") return 0;
  const aliases = grammarAliases[grammarId] ?? [grammarId];
  const haystack = `${example.grammar} ${example.focus} ${example.tip} ${example.explanation} ${example.wordsToUse}`.toLowerCase();
  return aliases.reduce((score, alias) => score + (haystack.includes(alias.toLowerCase()) ? 8 : 0), 0);
}

export function selectSimilarExamples(input: string, grammarId: string, blankCount: number, limit = 4) {
  const inputTokens = new Set(tokenize(input));

  return [...insightExamples]
    .map((example) => {
      const exampleTokens = tokenize(`${example.complete} ${example.japanese} ${example.wordsToUse} ${example.tip}`);
      const overlap = exampleTokens.filter((token) => inputTokens.has(token)).length;
      const blankDistance = Math.abs(blankCountOf(example) - blankCount);
      const score = grammarScore(example, grammarId) + overlap * 2 - blankDistance;
      return { example, score };
    })
    .sort((a, b) => b.score - a.score || a.example.id - b.example.id)
    .slice(0, limit)
    .map(({ example }) => example);
}

export function buildFewShotPrompt(input: string, grammarLabel: string, blankCount: number, examples: InsightExample[]) {
  const shots = examples
    .map(
      (example, index) =>
        `例${index + 1}\n文法事項: ${example.grammar} / ${example.focus}\n日本語: ${example.japanese}\n英文（穴埋め）: ${example.cloze}\n答え: ${example.answer}\nTip（思考誘導）: ${example.tip}\n解説: ${example.explanation}`,
    )
    .join("\n\n");

  return `あなたは高校英文法教材の作問者です。教材DBから選んだ類似例のトーンに合わせ、入力英文を空欄補充問題にします。\n\n${shots}\n\n制約:\n- 指定された文法事項を最優先し、同じ英文でも文法事項によって空欄位置とTipを変える。\n- 空欄数は${blankCount}個を目安にする。\n- 答えを直接教えすぎず、「何に注目するか」を疑問文で誘導する。\n- JSONのみを返す。\n\n文法事項: ${grammarLabel}\n入力英文:\n${input}`;
}
