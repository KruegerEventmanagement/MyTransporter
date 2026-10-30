import type { Plugin } from "vite";
import ts from "typescript";

/** Translate React-owned rendered trees; leave route metadata and all business logic untouched. */
export function localizeJsx(): Plugin {
  return {
    name: "mytransporter-localized-jsx",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?")[0];
      if (!/\/src\/(components|routes)\/.*\.tsx$/.test(filename) || /(?:\.test\.|\/ui\/|\/api\/|\/(?:agb|datenschutz|impressum)\.tsx$)/.test(filename)) return;
      const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const positions: Array<[number, number]> = [];
      function visit(node: ts.Node) {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
          positions.push([node.getStart(source), node.end]);
          return;
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      if (!positions.length) return;
      let output = code;
      for (const [start, end] of positions.reverse()) output = output.slice(0, start) + "<MtLocalized>" + output.slice(start, end) + "</MtLocalized>" + output.slice(end);
      return { code: 'import { Localized as MtLocalized } from "@/lib/i18n/Localized";\n' + output, map: null };
    },
  };
}