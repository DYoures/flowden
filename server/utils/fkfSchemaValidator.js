const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'docs', 'knowledge-exchange', 'flowden-package.schema.json');

let cachedSchema = null;

function getFkfRootSchema() {
  if (!cachedSchema) {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    cachedSchema = JSON.parse(raw);
  }
  return cachedSchema;
}

function resolveRef(ref, rootSchema) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    throw new Error(`Unsupported JSON Schema $ref: ${ref}`);
  }
  const parts = ref.slice(2).split('/');
  let current = rootSchema;
  for (const part of parts) {
    current = current ? current[part] : undefined;
    if (current === undefined) {
      throw new Error(`Unresolved JSON Schema $ref: ${ref}`);
    }
  }
  return current;
}

/**
 * Recursive JSON Schema (Draft 2020-12 subset used by flowden-package.schema.json) validator.
 */
function validateAgainstSchemaNode(instance, schemaNode, rootSchema, fileLabel, pointer = '#') {
  const errors = [];

  if (schemaNode.$ref) {
    const targetNode = resolveRef(schemaNode.$ref, rootSchema);
    errors.push(...validateAgainstSchemaNode(instance, targetNode, rootSchema, fileLabel, pointer));
  }

  if (schemaNode.oneOf) {
    let matchCount = 0;
    for (const branch of schemaNode.oneOf) {
      const branchErrs = validateAgainstSchemaNode(instance, branch, rootSchema, fileLabel, pointer);
      if (branchErrs.length === 0) {
        matchCount += 1;
      }
    }
    if (matchCount !== 1) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `Value at ${pointer} failed oneOf constraint (matched ${matchCount} branches).`
      });
    }
    return errors;
  }

  if (schemaNode.type !== undefined) {
    const allowedTypes = Array.isArray(schemaNode.type) ? schemaNode.type : [schemaNode.type];
    const actualType =
      instance === null
        ? 'null'
        : Array.isArray(instance)
        ? 'array'
        : typeof instance === 'number' && Number.isInteger(instance)
        ? 'integer'
        : typeof instance;

    const typeMatched = allowedTypes.some(t => t === actualType || (t === 'number' && actualType === 'integer'));
    if (!typeMatched) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `Expected type ${allowedTypes.join('|')} at ${pointer}, got ${actualType}.`
      });
      return errors;
    }
  }

  if (schemaNode.const !== undefined && instance !== schemaNode.const) {
    errors.push({
      code: 'SCHEMA_VALIDATION_ERROR',
      file: fileLabel,
      pointer,
      message: `Expected constant ${JSON.stringify(schemaNode.const)} at ${pointer}, got ${JSON.stringify(instance)}.`
    });
  }

  if (schemaNode.enum !== undefined && !schemaNode.enum.includes(instance)) {
    errors.push({
      code: 'SCHEMA_VALIDATION_ERROR',
      file: fileLabel,
      pointer,
      message: `Value ${JSON.stringify(instance)} at ${pointer} is not in allowed enum [${schemaNode.enum.join(', ')}].`
    });
  }

  if (typeof instance === 'string') {
    if (schemaNode.minLength !== undefined && instance.length < schemaNode.minLength) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `String length (${instance.length}) at ${pointer} is less than minLength (${schemaNode.minLength}).`
      });
    }
    if (schemaNode.maxLength !== undefined && instance.length > schemaNode.maxLength) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `String length (${instance.length}) at ${pointer} exceeds maxLength (${schemaNode.maxLength}).`
      });
    }
    if (schemaNode.pattern !== undefined) {
      const regex = new RegExp(schemaNode.pattern);
      if (!regex.test(instance)) {
        errors.push({
          code: 'SCHEMA_VALIDATION_ERROR',
          file: fileLabel,
          pointer,
          message: `String ${JSON.stringify(instance)} at ${pointer} does not match pattern ${schemaNode.pattern}.`
        });
      }
    }
  }

  if (typeof instance === 'number') {
    if (schemaNode.minimum !== undefined && instance < schemaNode.minimum) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `Number (${instance}) at ${pointer} is less than minimum (${schemaNode.minimum}).`
      });
    }
    if (schemaNode.maximum !== undefined && instance > schemaNode.maximum) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `Number (${instance}) at ${pointer} exceeds maximum (${schemaNode.maximum}).`
      });
    }
  }

  if (Array.isArray(instance)) {
    if (schemaNode.minItems !== undefined && instance.length < schemaNode.minItems) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `Array length (${instance.length}) at ${pointer} is less than minItems (${schemaNode.minItems}).`
      });
    }
    if (schemaNode.maxItems !== undefined && instance.length > schemaNode.maxItems) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        file: fileLabel,
        pointer,
        message: `Array length (${instance.length}) at ${pointer} exceeds maxItems (${schemaNode.maxItems}).`
      });
    }
    if (schemaNode.uniqueItems) {
      const serialized = instance.map(item => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        errors.push({
          code: 'SCHEMA_VALIDATION_ERROR',
          file: fileLabel,
          pointer,
          message: `Array at ${pointer} contains duplicate items (uniqueItems: true).`
        });
      }
    }
    if (schemaNode.items) {
      for (let i = 0; i < instance.length; i++) {
        errors.push(...validateAgainstSchemaNode(instance[i], schemaNode.items, rootSchema, fileLabel, `${pointer}[${i}]`));
      }
    }
  }

  if (instance && typeof instance === 'object' && !Array.isArray(instance)) {
    if (Array.isArray(schemaNode.required)) {
      for (const reqProp of schemaNode.required) {
        if (!Object.prototype.hasOwnProperty.call(instance, reqProp)) {
          errors.push({
            code: 'SCHEMA_VALIDATION_ERROR',
            file: fileLabel,
            pointer,
            message: `Missing required property "${reqProp}" at ${pointer}.`
          });
        }
      }
    }

    if (schemaNode.properties) {
      for (const [key, val] of Object.entries(instance)) {
        if (Object.prototype.hasOwnProperty.call(schemaNode.properties, key)) {
          errors.push(...validateAgainstSchemaNode(val, schemaNode.properties[key], rootSchema, fileLabel, `${pointer}.${key}`));
        } else if (schemaNode.additionalProperties === false) {
          errors.push({
            code: 'SCHEMA_VALIDATION_ERROR',
            file: fileLabel,
            pointer: `${pointer}.${key}`,
            message: `Unexpected additional property "${key}" at ${pointer}.`
          });
        }
      }
    }
  }

  return errors;
}

function validateFkfDocument(data, defName, fileLabel) {
  const rootSchema = getFkfRootSchema();
  const targetSchema = defName ? rootSchema.$defs[defName] : rootSchema;
  if (!targetSchema) {
    throw new Error(`Unknown FKF schema definition: ${defName}`);
  }
  return validateAgainstSchemaNode(data, targetSchema, rootSchema, fileLabel, '#');
}

module.exports = {
  getFkfRootSchema,
  validateFkfDocument
};

