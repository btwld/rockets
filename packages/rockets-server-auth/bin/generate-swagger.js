#!/usr/bin/env node

/**
 * CLI script to generate Swagger documentation for Rockets Server
 */

// Register ts-node to allow running TypeScript files directly
require('ts-node/register');

// Run the generator
require('../src/generate-swagger');

console.log('For more information about the Swagger generator, see SWAGGER.md'); 