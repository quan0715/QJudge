import yaml from 'js-yaml';
import type { ProblemUpsertPayload } from '@/core/entities/problem.entity';

export type ProblemYAML = ProblemUpsertPayload;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ParseResult {
  success: boolean;
  data?: ProblemYAML;
  errors?: ValidationError[];
}

export function parseProblemYAML(yamlContent: string): ParseResult {
  const errors: ValidationError[] = [];

  try {
    // Parse YAML
    const data = yaml.load(yamlContent) as any;

    if (!data || typeof data !== 'object') {
      return {
        success: false,
        errors: [{ field: 'root', message: 'Invalid YAML format' }]
      };
    }

    // Validate required fields
    if (!data.title || typeof data.title !== 'string') {
      errors.push({ field: 'title', message: 'Title is required and must be a string' });
    }

    if (!data.difficulty || !['easy', 'medium', 'hard'].includes(data.difficulty)) {
      errors.push({ field: 'difficulty', message: 'Difficulty must be one of: easy, medium, hard' });
    }

    if (typeof data.time_limit !== 'number' || data.time_limit < 100 || data.time_limit > 10000) {
      errors.push({ field: 'time_limit', message: 'Time limit must be between 100 and 10000 milliseconds' });
    }

    if (typeof data.memory_limit !== 'number' || data.memory_limit < 16 || data.memory_limit > 512) {
      errors.push({ field: 'memory_limit', message: 'Memory limit must be between 16 and 512 MB' });
    }

    // Validate translations (required)
    if (!Array.isArray(data.translations) || data.translations.length === 0) {
      errors.push({ field: 'translations', message: 'At least one translation is required' });
    } else {
      data.translations.forEach((trans: any, index: number) => {
        if (!trans.language || typeof trans.language !== 'string') {
          errors.push({ field: `translations[${index}].language`, message: 'Language is required' });
        }
        if (!trans.title || typeof trans.title !== 'string') {
          errors.push({ field: `translations[${index}].title`, message: 'Title is required' });
        }
        if (!trans.description || typeof trans.description !== 'string') {
          errors.push({ field: `translations[${index}].description`, message: 'Description is required' });
        }
        if (!trans.input_description || typeof trans.input_description !== 'string') {
          errors.push({ field: `translations[${index}].input_description`, message: 'Input description is required' });
        }
        if (!trans.output_description || typeof trans.output_description !== 'string') {
          errors.push({ field: `translations[${index}].output_description`, message: 'Output description is required' });
        }
      });
    }

    // Validate test cases (optional but recommended)
    if (data.test_cases && Array.isArray(data.test_cases)) {
      data.test_cases.forEach((tc: any, index: number) => {
        if (typeof tc.input_data !== 'string') {
          errors.push({ field: `test_cases[${index}].input_data`, message: 'Input data must be a string' });
        }
        if (typeof tc.output_data !== 'string') {
          errors.push({ field: `test_cases[${index}].output_data`, message: 'Output data must be a string' });
        }
        if (typeof tc.is_sample !== 'boolean') {
          errors.push({ field: `test_cases[${index}].is_sample`, message: 'is_sample must be a boolean' });
        }
        // Score, order, is_hidden are optional now
        if (tc.score !== undefined && (typeof tc.score !== 'number' || tc.score < 0)) {
          errors.push({ field: `test_cases[${index}].score`, message: 'Score must be a non-negative number' });
        }
        if (tc.order !== undefined && typeof tc.order !== 'number') {
          errors.push({ field: `test_cases[${index}].order`, message: 'Order must be a number' });
        }
        if (tc.is_hidden !== undefined && typeof tc.is_hidden !== 'boolean') {
          errors.push({ field: `test_cases[${index}].is_hidden`, message: 'is_hidden must be a boolean' });
        }
      });
    }

    // Validate language configs (optional but recommended)
    if (data.language_configs) {
      if (!Array.isArray(data.language_configs)) {
        errors.push({ field: 'language_configs', message: 'Language configs must be an array' });
      } else {
        data.language_configs.forEach((lc: any, index: number) => {
          if (!lc.language || typeof lc.language !== 'string') {
            errors.push({ field: `language_configs[${index}].language`, message: 'Language is required' });
          }
          if (typeof lc.template_code !== 'string') {
            errors.push({ field: `language_configs[${index}].template_code`, message: 'Template code must be a string' });
          }
          if (lc.is_enabled !== undefined && typeof lc.is_enabled !== 'boolean') {
            errors.push({ field: `language_configs[${index}].is_enabled`, message: 'is_enabled must be a boolean' });
          }
          if (lc.order !== undefined && typeof lc.order !== 'number') {
            errors.push({ field: `language_configs[${index}].order`, message: 'Order must be a number' });
          }
        });
      }
    }

    // Validate keyword restrictions (optional)
    if (data.forbidden_keywords !== undefined) {
      if (!Array.isArray(data.forbidden_keywords)) {
        errors.push({ field: 'forbidden_keywords', message: 'forbidden_keywords must be an array of strings' });
      } else if (!data.forbidden_keywords.every((k: any) => typeof k === 'string')) {
        errors.push({ field: 'forbidden_keywords', message: 'All forbidden_keywords must be strings' });
      }
    }

    if (data.required_keywords !== undefined) {
      if (!Array.isArray(data.required_keywords)) {
        errors.push({ field: 'required_keywords', message: 'required_keywords must be an array of strings' });
      } else if (!data.required_keywords.every((k: any) => typeof k === 'string')) {
        errors.push({ field: 'required_keywords', message: 'All required_keywords must be strings' });
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return {
      success: true,
      data: data as ProblemYAML
    };

  } catch (error: any) {
    return {
      success: false,
      errors: [{ field: 'yaml', message: `YAML parsing error: ${error.message}` }]
    };
  }
}
