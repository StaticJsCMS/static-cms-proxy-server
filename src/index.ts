// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import express from 'express';

import { registerCommonMiddlewares } from './middlewares/common';
import { registerMiddleware as registerLocalFs } from './middlewares/localFs';
import { createLogger } from './logger';

const app = express();
const port = process.env.PORT || 8081;
const level = process.env.LOG_LEVEL || 'info';

(async () => {
  const logger = createLogger({ level });
  const options = {
    logger,
  };

  registerCommonMiddlewares(app, options);

  try {
	registerLocalFs(app, options);
  } catch (e: any) {
    logger.error(e.message);
    process.exit(1);
  }

  return app.listen(port, () => {
    logger.info(`Static CMS Proxy Server listening on port ${port}`);
  });
})();
