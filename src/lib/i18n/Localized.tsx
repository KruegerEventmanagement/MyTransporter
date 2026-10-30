import { isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import { useI18n } from "./index";
import { translateText } from "./text";
import type { Lang } from "./messages";

function localize(value: ReactNode, lang: Lang): ReactNode {
  if (typeof value === "string") return translateText(value, lang);
  if (Array.isArray(value)) {
    // Translate adjacent plain-text fragments as one sentence, keeping embedded elements intact.
    const result: ReactNode[] = [];
    let run: ReactNode[] = [];
    const flush = () => {
      if (!run.length) return;
      const joined = run.join("");
      const translated = translateText(joined, lang);
      result.push(...(translated === joined ? run.map((child) => localize(child, lang)) : [translated]));
      run = [];
    };
    for (const child of value) {
      if (typeof child === "string" || typeof child === "number") run.push(child);
      else { flush(); result.push(localize(child, lang)); }
    }
    flush();
    return result;
  }
  if (!isValidElement(value)) return value;
  const element = value as ReactElement<Record<string, unknown>>;
  if (element.props.translate === "no" || element.props["data-no-translate"]) return value;
  const props: Record<string, unknown> = {};
  for (const name of ["title", "placeholder", "alt", "aria-label", "label", "description", "emptyMessage", "error"]) {
    const original = element.props[name];
    if (typeof original === "string") props[name] = translateText(original, lang);
  }
  if (element.props.children !== undefined) props.children = localize(element.props.children as ReactNode, lang);
  return cloneElement(element, props);
}

/** React-owned translation: no DOM rewriting, remounts, requests or customer-data transmission. */
export function Localized({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  return localize(children, lang);
}