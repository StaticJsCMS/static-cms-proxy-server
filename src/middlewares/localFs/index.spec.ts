import winston from 'winston';
import { join } from 'path';

import { getSchema, localFsMiddleware } from '.';
import { listRepoFiles } from '../utils/fs';

import type Joi from 'joi';
import type express from 'express';

jest.mock('../utils/fs');

function assetFailure(result: Joi.ValidationResult, expectedMessage: string) {
  const { error } = result;
  expect(error).not.toBeNull();
  expect(error!.details).toHaveLength(1);
  const message = error!.details.map(({ message }) => message)[0];
  expect(message).toBe(expectedMessage);
}

const defaultParams = {
  branch: 'master',
};

describe('localFsMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSchema', () => {
    it('should throw on path traversal', () => {
      const schema = getSchema({ repoPath: join('Users', 'user', 'documents', 'code', 'repo') });

      assetFailure(
        schema.validate({
          action: 'getEntry',
          params: { ...defaultParams, path: '../' },
        }),
        '"params.path" must resolve to a path under the configured repository',
      );
    });

    it('should not throw on valid path', () => {
      const schema = getSchema({ repoPath: join('Users', 'user', 'documents', 'code', 'repo') });

      const { error } = schema.validate({
        action: 'getEntry',
        params: { ...defaultParams, path: 'src/content/posts/title.md' },
      });

      expect(error).toBeUndefined();
    });

    it('should throw on folder traversal', () => {
      const schema = getSchema({ repoPath: join('Users', 'user', 'documents', 'code', 'repo') });

      assetFailure(
        schema.validate({
          action: 'entriesByFolder',
          params: { ...defaultParams, folder: '../', extension: 'md', depth: 1 },
        }),
        '"params.folder" must resolve to a path under the configured repository',
      );
    });

    it('should not throw on valid folder', () => {
      const schema = getSchema({ repoPath: join('Users', 'user', 'documents', 'code', 'repo') });

      const { error } = schema.validate({
        action: 'entriesByFolder',
        params: { ...defaultParams, folder: 'src/posts', extension: 'md', depth: 1 },
      });

      expect(error).toBeUndefined();
    });

    it('should throw on media folder traversal', () => {
      const schema = getSchema({ repoPath: join('Users', 'user', 'documents', 'code', 'repo') });

      assetFailure(
        schema.validate({
          action: 'getMedia',
          params: { ...defaultParams, mediaFolder: '../' },
        }),
        '"params.mediaFolder" must resolve to a path under the configured repository',
      );
    });

    it('should not throw on valid folder', () => {
      const schema = getSchema({ repoPath: join('Users', 'user', 'documents', 'code', 'repo') });
      const { error } = schema.validate({
        action: 'getMedia',
        params: { ...defaultParams, mediaFolder: 'static/images' },
      });

      expect(error).toBeUndefined();
    });
  });

  describe('getMedia', () => {
    it('should get media files', async () => {
      (listRepoFiles as jest.Mock).mockResolvedValue([
        'mediaFolder/asset1.jpg',
        'mediaFolder/asset2.jpg',
        'mediaFolder/asset3.jpg',
      ]);

      const json = jest.fn();
      const res: express.Response = { json } as unknown as express.Response;

      const req = {
        body: {
          action: 'getMedia',
          params: {
            mediaFolder: 'mediaFolder',
            branch: 'main',
          },
        },
      } as express.Request;

      const repoPath = '.';

      await localFsMiddleware({ repoPath, logger: winston.createLogger() })(req, res);

      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith([
        {
          path: 'mediaFolder/asset1.jpg',
          url: 'mediaFolder/asset1.jpg',
        },
        {
          path: 'mediaFolder/asset2.jpg',
          url: 'mediaFolder/asset2.jpg',
        },
        {
          path: 'mediaFolder/asset3.jpg',
          url: 'mediaFolder/asset3.jpg',
        },
      ]);
    });

    it('should translate media path to public path even when media path is absolute', async () => {
      (listRepoFiles as jest.Mock).mockResolvedValue([
        'mediaFolder/asset1.jpg',
        'mediaFolder/asset2.jpg',
        'mediaFolder/asset3.jpg',
      ]);

      const json = jest.fn();
      const res: express.Response = { json } as unknown as express.Response;

      const req = {
        body: {
          action: 'getMedia',
          params: {
            mediaFolder: '/mediaFolder',
            publicFolder: '/publicFolder',
            branch: 'main',
          },
        },
      } as express.Request;

      const repoPath = '.';

      await localFsMiddleware({ repoPath, logger: winston.createLogger() })(req, res);

      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith([
        {
          path: 'mediaFolder/asset1.jpg',
          url: '/publicFolder/asset1.jpg',
        },
        {
          path: 'mediaFolder/asset2.jpg',
          url: '/publicFolder/asset2.jpg',
        },
        {
          path: 'mediaFolder/asset3.jpg',
          url: '/publicFolder/asset3.jpg',
        },
      ]);
    });

    it('should translate media path to public path', async () => {
      (listRepoFiles as jest.Mock).mockResolvedValue([
        'mediaFolder/asset1.jpg',
        'mediaFolder/asset2.jpg',
        'mediaFolder/asset3.jpg',
      ]);

      const json = jest.fn();
      const res: express.Response = { json } as unknown as express.Response;

      const req = {
        body: {
          action: 'getMedia',
          params: {
            mediaFolder: 'mediaFolder',
            publicFolder: '/publicFolder',
            branch: 'main',
          },
        },
      } as express.Request;

      const repoPath = '.';

      await localFsMiddleware({ repoPath, logger: winston.createLogger() })(req, res);

      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith([
        {
          path: 'mediaFolder/asset1.jpg',
          url: '/publicFolder/asset1.jpg',
        },
        {
          path: 'mediaFolder/asset2.jpg',
          url: '/publicFolder/asset2.jpg',
        },
        {
          path: 'mediaFolder/asset3.jpg',
          url: '/publicFolder/asset3.jpg',
        },
      ]);
    });
  });
});
