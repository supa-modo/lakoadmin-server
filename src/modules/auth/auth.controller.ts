import { Response, NextFunction } from 'express';
import {
  loginService,
  refreshTokenService,
  logoutService,
  forgotPasswordService,
  resetPasswordService,
  changePasswordService,
  getMeService,
} from './auth.service';
import { sendSuccess, sendError } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';

export async function login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const result = await loginService(email, password, ipAddress, userAgent);

    logAudit(req, 'LOGIN', 'User', result.user.id);

    sendSuccess(res, result, 'Login successful');
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('locked') || message.includes('disabled')) {
      sendError(res, message, 403);
    } else if (message.includes('Invalid email')) {
      sendError(res, message, 401);
    } else {
      next(err);
    }
  }
}

export async function refreshToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken: token } = req.body;
    const result = await refreshTokenService(token);
    sendSuccess(res, result, 'Token refreshed');
  } catch (err) {
    sendError(res, (err as Error).message, 401);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }
    const { refreshToken: token } = req.body;
    await logoutService(req.user.id, token);
    logAudit(req, 'LOGOUT', 'User', req.user.id);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    await forgotPasswordService(email, ipAddress);
    // Always return success
    sendSuccess(res, null, 'If that email is registered, a reset link has been sent.');
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    await resetPasswordService(token, password);
    logAudit(req, 'PASSWORD_RESET', 'User');
    sendSuccess(res, null, 'Password reset successfully. Please log in.');
  } catch (err) {
    sendError(res, (err as Error).message, 400);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }
    const { currentPassword, newPassword } = req.body;
    await changePasswordService(req.user.id, currentPassword, newPassword);
    logAudit(req, 'PASSWORD_CHANGE', 'User', req.user.id);
    sendSuccess(res, null, 'Password changed successfully');
  } catch (err) {
    sendError(res, (err as Error).message, 400);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }
    const user = await getMeService(req.user.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
