import { NextResponse } from "next/server";
import { buildFewShotPrompt, selectSimilarExamples } from "../../../lib/insightDataset";

type GenerateItem = {
  sentence: string;
  grammarId: string;
  grammarLabel: string;
  blankCount: number;
};

type GenerateRequest = {
  items?: GenerateItem[];
  sentences?: string[];
  grammarId?: string;
  grammarLabel?: string;
  blankCount?: number;
};

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

async function generateWithOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  if (!apiKey) {
    return null;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate Japanese high-school English grammar cloze exercises. Return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? JSON.parse(content) : null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const items =
    body.items ??
    (body.sentences ?? []).map((sentence) => ({
      sentence,
      grammarId: body.grammarId ?? "auto",
      grammarLabel: body.grammarLabel ?? "自動判定",
      blankCount: body.blankCount ?? 2,
    }));

  const results = await Promise.all(
    items.filter((item) => item.sentence).map(async (item) => {
      const examples = selectSimilarExamples(item.sentence, item.grammarId, item.blankCount, 5);
      const prompt = buildFewShotPrompt(item.sentence, item.grammarLabel, item.blankCount, examples);
      const generated = await generateWithOpenAI(prompt);

      return {
        sentence: item.sentence,
        grammarId: item.grammarId,
        grammarLabel: item.grammarLabel,
        blankCount: item.blankCount,
        similarExamples: examples,
        prompt,
        generated,
        mode: generated ? "openai" : "dataset-only",
      };
    }),
  );

  return NextResponse.json({ results });
}
