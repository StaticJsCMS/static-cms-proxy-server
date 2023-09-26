import Joi from 'joi';
import path from 'path';

export function pathTraversal(repoPath: string) {
  return Joi.extend({
    type: 'path',
    base: Joi.string().required(),
    messages: {
      'path.invalid': '{{#label}} must resolve to a path under the configured repository',
    },
    validate(value, helpers) {
      const resolvedRepoPath = path.join(repoPath, '');
      const resolvedPath = path.join(repoPath, value);
      if (!resolvedPath.startsWith(resolvedRepoPath)) {
        return { value, errors: helpers.error('path.invalid') };
      }
    },
  }).path();
}
