export const GEMINI_MODEL = "gemini-3.6-flash";

export type OutputLength = "short" | "normal" | "detailed";

export interface SystemPreset {
  id: string;
  label: string;
  instruction: string;
}

export interface PromptTemplate {
  id: string;
  label: string;
  text: string;
}

export interface UsageSummary {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  usage?: UsageSummary;
  elapsedMs?: number;
  isError?: boolean;
}

export interface GeminiContentPart {
  text: string;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: "default",
    label: "標準",
    instruction:
      "親切で正確なAIアシスタントとして、見出しや箇条書きを活用して読みやすい日本語で回答してください。",
  },
  {
    id: "concise",
    label: "結論ファースト",
    instruction:
      "最初に結論を1〜2文で明確に述べ、その後に重要なポイントを箇条書きで簡潔に整理して回答してください。",
  },
  {
    id: "teacher",
    label: "初心者向け先生",
    instruction:
      "プログラミング初心者にも理解できるように、専門用語はかみ砕き、身近なたとえや具体例を交えて丁寧に説明してください。",
  },
  {
    id: "engineer",
    label: "技術解説",
    instruction:
      "実践的なソフトウェアエンジニアとして、仕組み・設計意図・注意点・コード例を構造化してわかりやすく解説してください。",
  },
  {
    id: "translator",
    label: "翻訳・添削",
    instruction:
      "入力文が日本語なら自然な英語へ、英語なら自然な日本語へ翻訳してください。あわせて表現のポイントや別案を1〜2点補足してください。",
  },
];

export const LENGTH_OPTIONS: {
  id: OutputLength;
  label: string;
  suffix: string;
}[] = [
  {
    id: "short",
    label: "短め",
    suffix: "回答は要点だけに絞り、全体で300文字程度以内に簡潔にまとめてください。",
  },
  {
    id: "normal",
    label: "普通",
    suffix: "",
  },
  {
    id: "detailed",
    label: "詳細",
    suffix: "背景・手順・具体例・注意点も含めて、体系的かつ詳しく説明してください。",
  },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "summarize",
    label: "要約して",
    text: "以下の内容を3つのポイントに絞って要約してください：\n\n",
  },
  {
    id: "example",
    label: "具体例を出して",
    text: "初心者にもイメージしやすい具体例を3つ挙げて説明してください：\n\n",
  },
  {
    id: "compare",
    label: "比較表にして",
    text: "以下の違いを表形式で比較し、使い分けを教えてください：\n\n",
  },
  {
    id: "review",
    label: "問題点と改善案",
    text: "以下の内容・コードについて、問題点と具体的な改善案を教えてください：\n\n",
  },
];

export function buildSystemInstruction(
  baseInstruction: string,
  outputLength: OutputLength
): string | undefined {
  const parts: string[] = [];
  const trimmedBase = baseInstruction.trim();
  if (trimmedBase) {
    parts.push(trimmedBase);
  }
  const lengthOption = LENGTH_OPTIONS.find((opt) => opt.id === outputLength);
  if (lengthOption?.suffix) {
    parts.push(lengthOption.suffix);
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function buildGeminiContents(
  messages: Array<{ role: "user" | "model"; text: string; isError?: boolean }>,
  nextPrompt?: string
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.isError || !msg.text.trim()) continue;
    contents.push({
      role: msg.role,
      parts: [{ text: msg.text }],
    });
  }

  if (nextPrompt && nextPrompt.trim()) {
    contents.push({
      role: "user",
      parts: [{ text: nextPrompt.trim() }],
    });
  }

  return contents;
}

export function extractGeminiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  let detail = message;
  try {
    const parsed = JSON.parse(message);
    const data = parsed?.error ?? parsed;
    if (data?.code || data?.message) {
      detail = `code(${data?.code}) message(${data?.message})`;
    }
  } catch {
    // JSONでないエラー（通信エラーなど）はそのまま扱う
  }
  return `Gemini APIの呼び出しに失敗しました ${detail.substring(0, 180)}`;
}
