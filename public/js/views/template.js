// Plantillas locales sin eval ni expresiones ejecutables. Las vistas deciden
// qué valores escapar con esc() y qué fragmentos HTML componer explícitamente.
const templates = new Map();

export async function loadTemplates(collections) {
  const sources = await Promise.all(
    collections.map(async (name) => {
      const response = await fetch(`/views/${name}.html`);
      if (!response.ok) throw new Error(`No se pudo cargar la vista ${name}.`);
      return response.text();
    }),
  );
  for (const source of sources) {
    for (const match of source.matchAll(
      /<template id="([\w-]+)">([\s\S]*?)<\/template>/g,
    )) {
      if (templates.has(match[1]))
        throw new Error(`Vista duplicada: ${match[1]}`);
      templates.set(match[1], match[2].trim());
    }
  }
}

export function view(name, bindings = {}) {
  if (!templates.has(name)) throw new Error(`Vista no disponible: ${name}`);
  return templates.get(name).replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => {
    if (!Object.hasOwn(bindings, key))
      throw new Error(`Falta ${key} en ${name}.`);
    return String(bindings[key] ?? "");
  });
}
