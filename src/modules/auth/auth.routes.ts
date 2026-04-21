import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticateToken } from '../../middleware/auth';
import { authRateLimiter, passwordResetRateLimiter } from '../../middleware/rateLimiter';
import {
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
} from './auth.controller';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
} from './auth.validation';

const router = Router();

router.post('/login', authRateLimiter, validate(loginSchema), login);
router.post('/logout', authenticateToken, logout);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);
router.post('/forgot-password', passwordResetRateLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.post('/change-password', authenticateToken, validate(changePasswordSchema), changePassword);
router.get('/me', authenticateToken, getMe);

export default router;
