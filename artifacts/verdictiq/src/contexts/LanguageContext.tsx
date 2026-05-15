import { createContext, useContext, useState, type ReactNode } from "react";

export type UILanguage = "en-IN" | "kn-IN" | "hi-IN";

export const LANGUAGE_OPTIONS: { code: UILanguage; label: string; nativeLabel: string }[] = [
  { code: "en-IN", label: "English", nativeLabel: "English" },
  { code: "kn-IN", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "hi-IN", label: "Hindi", nativeLabel: "हिन्दी" },
];

interface LanguageContextValue {
  language: UILanguage;
  setLanguage: (lang: UILanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en-IN",
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<UILanguage>("en-IN");
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
