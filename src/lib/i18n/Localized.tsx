import { isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import { useI18n } from "./index";
import { translateText } from "./text";
import type { Lang } from "./messages";

function localize(value: ReactNode, lang: Lang): ReactNode {
  if (typeof value === "string") return translateText(value, lang);
  if (Array.isArray(value)) return value.map((child) => localize(child, lang));
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