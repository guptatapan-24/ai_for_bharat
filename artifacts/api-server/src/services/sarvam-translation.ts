const SARVAM_API_URL = "https://api.sarvam.ai/translate";

export type SupportedLanguage = "kn-IN" | "hi-IN" | "en-IN";

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  "en-IN": "English",
  "kn-IN": "ಕನ್ನಡ",
  "hi-IN": "हिन्दी",
};

interface SarvamTranslateRequest {
  input: string;
  source_language_code: string;
  target_language_code: string;
  speaker_gender?: "Male" | "Female";
  mode?: "formal" | "classic-colloquial" | "modern-colloquial";
  model?: "mayura:v1";
  enable_preprocessing?: boolean;
}

interface SarvamTranslateResponse {
  translated_text: string;
  source_language_code?: string;
  target_language_code?: string;
}

async function translateOne(text: string, targetLang: SupportedLanguage): Promise<string> {
  if (!text || !text.trim()) return text;

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error("SARVAM_API_KEY is not configured");

  const body: SarvamTranslateRequest = {
    input: text.trim(),
    source_language_code: "en-IN",
    target_language_code: targetLang,
    speaker_gender: "Male",
    mode: "formal",
    model: "mayura:v1",
    enable_preprocessing: true,
  };

  const res = await fetch(SARVAM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    throw new Error(`Sarvam API error ${res.status}: ${errText}`);
  }

  const data: SarvamTranslateResponse = await res.json();
  return data.translated_text || text;
}

export async function translateBatch(
  texts: string[],
  targetLang: SupportedLanguage
): Promise<string[]> {
  const results: string[] = [];

  for (const text of texts) {
    try {
      const translated = await translateOne(text, targetLang);
      results.push(translated);
    } catch (err) {
      results.push(text);
    }
  }

  return results;
}

export async function translateDirectiveFields(
  actionRequired: string,
  sourceText: string,
  targetLang: SupportedLanguage
): Promise<{ translatedAction: string; translatedSource: string }> {
  const [translatedAction, translatedSource] = await translateBatch(
    [actionRequired, sourceText],
    targetLang
  );
  return { translatedAction, translatedSource };
}
