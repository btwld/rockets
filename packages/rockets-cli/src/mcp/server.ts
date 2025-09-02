import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as types from '@modelcontextprotocol/sdk/types.js';
import { generateModule } from '../commands/generate-module';

const server = new Server({ name: 'rockets-codegen', version: '0.0.1' }, { capabilities: { tools: {} } });

type GenerateArgs = {
  name: string;
  fields: string;
  outDir?: string;
  typeorm?: boolean;
};

server.setRequestHandler(types.ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_module',
      description:
        'Generate a complete module (entity, dto, services, controller, module) using Rockets pattern.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          fields: { type: 'string' },
          outDir: { type: 'string' },
          typeorm: { type: 'boolean' },
        },
        required: ['name', 'fields'],
      },
    },
  ],
}));

server.setRequestHandler(types.CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'generate_module') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as GenerateArgs;
  if (!args || typeof args.name !== 'string' || !args.name.trim()) {
    throw new Error('Invalid arguments: name is required');
  }
  if (!args.fields || typeof args.fields !== 'string') {
    throw new Error('Invalid arguments: fields is required');
  }
  await generateModule({
    name: args.name,
    fields: args.fields,
    outDir: args.outDir ?? 'src/modules',
    typeorm: args.typeorm ?? false,
  });

  return {
    content: [
      {
        type: 'text',
        text: `Generated ${args.name} module at ${process.cwd()}/${args.outDir ?? 'src/modules'}/${args.name.toLowerCase()}`,
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


