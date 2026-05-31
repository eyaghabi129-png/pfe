import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.json({ ok: true, service: 'backend', ts: new Date().toISOString() });
});
