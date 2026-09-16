// Read-only API reference -- GET endpoints only, with full request (path/query
// params) and response schemas. Deliberately excludes every write method
// (POST/PATCH/PUT/DELETE) from the generated document entirely: this exists to
// give the AI bot (school-eos-ai-bot) and anyone else a safe surface to browse
// or scrape without ever seeing a mutating endpoint's shape suggested back to
// them. Request/response schemas come from the @nestjs/swagger CLI plugin
// (nest-cli.json's compilerOptions.plugins) reading each DTO's own
// class-validator decorators -- no manual @ApiProperty needed on every field.
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

const WRITE_METHODS = ['post', 'put', 'patch', 'delete'] as const;

function keepOnlyGetOperations(document: OpenAPIObject): OpenAPIObject {
  const filteredPaths: OpenAPIObject['paths'] = {};

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem || typeof pathItem.get === 'undefined') continue;

    const { get, ...rest } = pathItem;
    for (const method of WRITE_METHODS) delete (rest as Record<string, unknown>)[method];
    filteredPaths[path] = { get };
  }

  return { ...document, paths: filteredPaths };
}

export function setupReadOnlySwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('School EOS API — read-only reference')
    .setDescription(
      'GET endpoints only (request params + response schemas). Every write ' +
        'endpoint (POST/PATCH/PUT/DELETE) is deliberately excluded from this ' +
        'document — see src/swagger.ts.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const fullDocument = SwaggerModule.createDocument(app, config);
  const readOnlyDocument = keepOnlyGetOperations(fullDocument);

  SwaggerModule.setup('api/docs', app, readOnlyDocument);
}
