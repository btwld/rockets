import path from 'path';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
// Fallback to change-case if param/pascal/constant packages unavailable in env
import { toParamCase, toPascalCase, toConstantCase } from '../utils/case';

interface GenerateModuleOptions {
  name: string;
  fields: string;
  outDir: string;
  typeorm?: boolean;
}

Handlebars.registerHelper('eq', function (a: any, b: any) {
  return a === b;
});

export async function generateModule(options: GenerateModuleOptions) {
  const entityName = toPascalCase(options.name);
  const entity = toParamCase(options.name);
  const ENTITY = toConstantCase(options.name);

  const fields = parseFields(options.fields);

  const requiredFields = fields.filter((f) => !f.optional).map((f) => f.name);
  const optionalFields = fields.filter((f) => f.optional).map((f) => f.name);
  const ctx = {
    entityName,
    entity,
    ENTITY,
    fields,
    requiredFieldNamesJoined: requiredFields.join("' | '"),
    optionalFieldNamesJoined: optionalFields.join("' | '"),
    allFieldNamesJoined: fields.map((f) => f.name).join("' | '"),
    typeorm: !!options.typeorm,
  };

  // Prefer dist/templates; fallback to src/templates when running from source
  let templatesDir = path.join(__dirname, '..', 'templates');
  if (!(await fs.pathExists(templatesDir))) {
    const srcTemplates = path.join(__dirname, '..', '..', 'src', 'templates');
    if (await fs.pathExists(srcTemplates)) {
      templatesDir = srcTemplates;
    }
  }
  const moduleDir = path.join(process.cwd(), options.outDir, entity);
  await fs.ensureDir(moduleDir);

  const files = [
    { tpl: 'entity.hbs', out: `${entity}.entity.ts` },
    { tpl: 'interface.hbs', out: `${entity}.interface.ts` },
    { tpl: 'dto.hbs', out: `${entity}.dto.ts` },
    { tpl: 'exception.hbs', out: `${entity}.exception.ts` },
    { tpl: 'model-service.hbs', out: `${entity}-model.service.ts` },
    { tpl: 'crud-adapter.hbs', out: `${entity}-typeorm-crud.adapter.ts` },
    { tpl: 'crud-service.hbs', out: `${entity}.crud.service.ts` },
    { tpl: 'crud-controller.hbs', out: `${entity}.crud.controller.ts` },
    { tpl: 'access-query.hbs', out: `${entity}-access-query.service.ts` },
    { tpl: 'types.hbs', out: `${entity}.types.ts` },
    { tpl: 'module.hbs', out: `${entity}.module.ts` },
    { tpl: 'index.hbs', out: `index.ts` },
  ];

  for (const file of files) {
    const tplPath = path.join(templatesDir, file.tpl);
    const outPath = path.join(moduleDir, file.out);
    const tpl = await fs.readFile(tplPath, 'utf-8');
    const compiled = Handlebars.compile(tpl);
    const content = compiled(ctx);
    await fs.writeFile(outPath, content);
  }

  process.stdout.write(`Generated module at ${moduleDir}\n`);
}

function parseFields(def: string) {
  if (!def) return [] as Array<{ name: string; type: string; optional: boolean; tsType: string }>;
  return def.split(',').map((raw) => {
    const part = raw.trim();
    const [rawName, rawType] = part.split(':');
    const lastChar = rawType?.slice(-1) ?? '';
    const optional = lastChar === '?' ? true : lastChar === '!' ? false : false; // default required
    const typeCore = optional || lastChar === '!' ? rawType.slice(0, -1) : (rawType || 'string');
    const name = rawName.trim();
    const type = (typeCore || 'string').trim();
    const tsType = mapToTsType(type);
    return { name, type, optional, tsType };
  });
}

function mapToTsType(type: string): string {
  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date';
    case 'json':
      return 'Record<string, any>';
    default:
      return 'string';
  }
}


