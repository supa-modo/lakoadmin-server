import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { universalSearchHandler } from './search.controller';

const router = Router();

router.use(authenticateToken);

router.get('/universal', universalSearchHandler);

export default router;
