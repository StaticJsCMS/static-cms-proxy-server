import { Mutex, withTimeout } from "async-mutex";
import path from "path";
import simpleGit from "simple-git";

import { defaultSchema, joi } from "../joi";
import { pathTraversal } from "../joi/customValidators";
import { entriesFromFiles, readMediaFile } from "../utils/entries";
import { deleteFile, listRepoFiles, move, writeFile } from "../utils/fs";

import type express from "express";
import type { SimpleGit } from "simple-git";
import type winston from "winston";
import type {
  Asset,
  DataFile,
  DefaultParams,
  DeleteFileParams,
  DeleteFilesParams,
  EntriesByFilesParams,
  EntriesByFolderParams,
  GetEntryParams,
  GetMediaFileParams,
  GetMediaParams,
  PersistEntryParams,
  PersistMediaParams,
} from "../types";

async function commit(git: SimpleGit, commitMessage: string) {
  await git.add(".");
  await git.commit(commitMessage, undefined, {
    // setting the value to a string passes name=value
    // any other value passes just the key
    "--no-verify": null,
    "--no-gpg-sign": null,
  });
}

async function getCurrentBranch(git: SimpleGit) {
  const currentBranch = await git.branchLocal().then((summary) => summary.current);
  return currentBranch;
}

async function runOnBranch<T>(git: SimpleGit, branch: string, func: () => Promise<T>) {
  const currentBranch = await getCurrentBranch(git);
  try {
    if (currentBranch !== branch) {
      await git.checkout(branch);
    }
    const result = await func();
    return result;
  } finally {
    await git.checkout(currentBranch);
  }
}

type GitOptions = {
  repoPath: string;
  logger: winston.Logger;
};

async function commitEntry(
  git: SimpleGit,
  repoPath: string,
  dataFiles: DataFile[],
  assets: Asset[],
  commitMessage: string
) {
  // save entry content
  await Promise.all(dataFiles.map((dataFile) => writeFile(path.join(repoPath, dataFile.path), dataFile.raw)));
  // save assets
  await Promise.all(assets.map((a) => writeFile(path.join(repoPath, a.path), Buffer.from(a.content, a.encoding))));
  if (dataFiles.every((dataFile) => dataFile.newPath)) {
    dataFiles.forEach(async (dataFile) => {
      await move(path.join(repoPath, dataFile.path), path.join(repoPath, dataFile.newPath!));
    });
  }

  // commits files
  await commit(git, commitMessage);
}

async function isBranchExists(git: SimpleGit, branch: string) {
  const branchExists = await git.branchLocal().then(({ all }) => all.includes(branch));
  return branchExists;
}

export async function validateRepo({ repoPath }: { repoPath: string }) {
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw Error(`${repoPath} is not a valid git repository`);
  }
}

export function getSchema({ repoPath }: { repoPath: string }) {
  const schema = defaultSchema({ path: pathTraversal(repoPath) });
  return schema;
}

export function localGitMiddleware({ repoPath, logger }: GitOptions) {
  const git = simpleGit(repoPath);

  // we can only perform a single git operation at any given time
  const mutex = withTimeout(new Mutex(), 3000, new Error("Request timed out"));

  return async function (req: express.Request, res: express.Response) {
    let release;
    try {
      release = await mutex.acquire();
      const { body } = req;
      if (body.action === "info") {
        res.json({
          repo: path.basename(repoPath),
          type: "local_git",
        });
        return;
      }
      const { branch } = body.params as DefaultParams;

      const branchExists = await isBranchExists(git, branch);
      if (!branchExists) {
        const message = `Default branch '${branch}' doesn't exist`;
        res.status(422).json({ error: message });
        return;
      }

      switch (body.action) {
        case "entriesByFolder": {
          const payload = body.params as EntriesByFolderParams;
          const { folder, extension, depth } = payload;
          const entries = await runOnBranch(git, branch, () =>
            listRepoFiles(repoPath, folder, extension, depth).then((files) =>
              entriesFromFiles(
                repoPath,
                files.map((file) => ({ path: file }))
              )
            )
          );
          res.json(entries);
          break;
        }
        case "entriesByFiles": {
          const payload = body.params as EntriesByFilesParams;
          const entries = await runOnBranch(git, branch, () => entriesFromFiles(repoPath, payload.files));
          res.json(entries);
          break;
        }
        case "getEntry": {
          const payload = body.params as GetEntryParams;
          const [entry] = await runOnBranch(git, branch, () => entriesFromFiles(repoPath, [{ path: payload.path }]));
          res.json(entry);
          break;
        }
        case "persistEntry": {
          const { entry, dataFiles = [entry as DataFile], assets, options } = body.params as PersistEntryParams;

          await runOnBranch(git, branch, async () => {
            await commitEntry(git, repoPath, dataFiles, assets, options.commitMessage);
          });
          res.json({ message: "entry persisted" });
          break;
        }
        case "getMedia": {
          const { mediaFolder } = body.params as GetMediaParams;
          const mediaFiles = await runOnBranch(git, branch, async () => {
            const files = await listRepoFiles(repoPath, mediaFolder, "", 1);
            return files.map((file) => ({
              path: file.replace(/\\\\/g, '/'),
              url: path.join(repoPath, file).replace(/\\\\/g, '/'),
            }));
          });
          res.json(mediaFiles);
          break;
        }
        case "getMediaFile": {
          const { path } = body.params as GetMediaFileParams;
          const mediaFile = await runOnBranch(git, branch, () => {
            return readMediaFile(repoPath, path);
          });
          res.json(mediaFile);
          break;
        }
        case "persistMedia": {
          const {
            asset,
            options: { commitMessage },
          } = body.params as PersistMediaParams;

          const file = await runOnBranch(git, branch, async () => {
            await writeFile(path.join(repoPath, asset.path), Buffer.from(asset.content, asset.encoding));
            await commit(git, commitMessage);
            return readMediaFile(repoPath, asset.path);
          });
          res.json(file);
          break;
        }
        case "deleteFile": {
          const {
            path: filePath,
            options: { commitMessage },
          } = body.params as DeleteFileParams;
          await runOnBranch(git, branch, async () => {
            await deleteFile(repoPath, filePath);
            await commit(git, commitMessage);
          });
          res.json({ message: `deleted file ${filePath}` });
          break;
        }
        case "deleteFiles": {
          const {
            paths,
            options: { commitMessage },
          } = body.params as DeleteFilesParams;
          await runOnBranch(git, branch, async () => {
            await Promise.all(paths.map((filePath) => deleteFile(repoPath, filePath)));
            await commit(git, commitMessage);
          });
          res.json({ message: `deleted files ${paths.join(", ")}` });
          break;
        }
        case "getDeployPreview": {
          res.json(null);
          break;
        }
        default: {
          const message = `Unknown action ${body.action}`;
          res.status(422).json({ error: message });
          break;
        }
      }
    } catch (e: any) {
      logger.error(`Error handling ${JSON.stringify(req.body)}: ${e.message}`);
      res.status(500).json({ error: "Unknown error" });
    } finally {
      release && release();
    }
  };
}

type Options = {
  logger: winston.Logger;
};

export async function registerMiddleware(app: express.Express, options: Options) {
  const { logger } = options;
  const repoPath = path.resolve(process.env.GIT_REPO_DIRECTORY || process.cwd());
  await validateRepo({ repoPath });
  app.post("/api/v1", joi(getSchema({ repoPath })));
  app.post("/api/v1", localGitMiddleware({ repoPath, logger }));
  logger.info(`Static CMS Git Proxy Server configured with ${repoPath}`);
}
