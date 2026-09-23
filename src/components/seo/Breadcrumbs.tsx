import type { Crumb } from "@/lib/seo";

/** Sichtbare Brotkrumen – identisch zur BreadcrumbList im Seitenkopf. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Brotkrumen" className="text-sm text-muted-foreground mb-6">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="text-foreground">{c.name}</span>
              ) : (
                <>
                  <a href={c.path} className="hover:text-foreground underline-offset-2 hover:underline">
                    {c.name}
                  </a>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
