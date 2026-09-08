// pages — read the section settings extracted from the Shopify templates.
//
// src/data/pages/*.json preserves Shopify's setting names (snake_case) exactly as the
// theme stored them, so the data stays diffable against the Liquid templates. The page
// files map those onto the components' camelCase props explicitly; these helpers just
// find the right section and give back a typed bag.

export interface PageSection {
  id: string;
  type: string;
  settings: Record<string, any>;
  blocks?: { id: string; type: string; settings: Record<string, any> }[];
}

export interface PageData {
  title?: string;
  sections: PageSection[];
}

/** A section by its id, throwing rather than silently rendering an empty component. */
export function section(page: PageData, id: string): PageSection {
  const found = page.sections.find((s) => s.id === id);
  if (!found) {
    throw new Error(
      `no section "${id}" in page data (have: ${page.sections.map((s) => s.id).join(', ')})`
    );
  }
  return found;
}

/** Settings for a section, exactly as the template stored them.
 *
 *  Blanks are passed through rather than stripped. In Liquid a `{% schema %}` default
 *  is only the value a *new* section starts with — once a template records an empty
 *  string, that is what renders. Two of these matter: the second homepage promo band
 *  sets `lead_line: ""` and must show no lead line, while `issue_override`, `dossier`
 *  and `index_label` use "" to mean "fall back to the product's own value", which the
 *  components implement. Dropping the blanks would substitute schema defaults for
 *  both, and the theme never showed those.
 */
export function settings(page: PageData, id: string): Record<string, any> {
  return section(page, id).settings;
}

/** Blocks for a section, in template order.
 *
 *  Generic so a caller can state the settings shape its component requires - the
 *  page data is plain JSON, so this is the only place that knowledge can live. */
export function blocks<T = Record<string, any>>(
  page: PageData,
  id: string
): { id: string; type: string; settings: T }[] {
  return (section(page, id).blocks ?? []) as { id: string; type: string; settings: T }[];
}
