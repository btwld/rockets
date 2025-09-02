#!/usr/bin/env node
import { Command } from 'commander';
import { generateModule } from './commands/generate-module';

const program = new Command();

program
  .name('rockets')
  .description('Rockets SDK code generator')
  .version('0.0.0');

program
  .command('generate:module')
  .alias('g:m')
  .description('Generate a full module structure (entity, dto, services, controller, module)')
  .requiredOption('-n, --name <name>', 'Entity name, e.g. Artist')
  .option('-f, --fields <fields>', 'Fields: name:string,status:enum,notes:string', 'name:string,status:enum')
  .option('-o, --outDir <outDir>', 'Output directory', 'src/modules')
  .option('--typeorm', 'Generate entity with TypeORM decorators', false)
  .action(async (options) => {
    const name = String(options.name || '').trim();
    const fields = String(options.fields || '').trim();
    const outDir = String(options.outDir || '').trim();
    const typeorm = Boolean(options.typeorm);

    if (!name) throw new Error('Missing --name');
    if (!fields) throw new Error('Missing --fields');
    if (!outDir) throw new Error('Missing --outDir');

    await generateModule({ name, fields, outDir, typeorm });
  });

program.parseAsync(process.argv);


