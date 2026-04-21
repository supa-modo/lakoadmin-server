import { prisma } from "../../config/database";
import { cache } from "../../config/redis";
import { env } from "../../config/env";
import {
  comparePassword,
  hashPassword,
  generateSecureToken,
  hashToken,
  validatePasswordPolicy,
} from "../../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { fileLogger } from "../../services/fileLogger";
import { logger } from "../../utils/logger";
import { addJob } from "../../config/queues";
import { QUEUE_NAMES } from "../../config/queues";
import { buildPasswordResetEmail } from "../../services/emailService";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
    lastLoginAt: Date | null;
  };
}

export async function loginService(
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim(), deletedAt: null },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    fileLogger.warn("auth", "Login failed – user not found", {
      email,
      ipAddress,
    });
    throw new Error("Invalid email or password");
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000,
    );
    throw new Error(
      `Account temporarily locked. Try again in ${minutesLeft} minutes.`,
    );
  }

  if (!user.isActive) {
    throw new Error("Account is disabled. Please contact your administrator.");
  }

  const passwordMatch = await comparePassword(password, user.password);

  if (!passwordMatch) {
    const newFailedLogins = user.failedLogins + 1;
    const shouldLock = newFailedLogins >= env.MAX_LOGIN_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: newFailedLogins,
        lockedUntil: shouldLock
          ? new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000)
          : undefined,
      },
    });

    fileLogger.warn("auth", "Login failed – wrong password", {
      email,
      ipAddress,
      failedLogins: newFailedLogins,
      locked: shouldLock,
    });

    if (shouldLock) {
      throw new Error(
        `Too many failed attempts. Account locked for ${env.LOCKOUT_MINUTES} minutes.`,
      );
    }

    const remaining = env.MAX_LOGIN_ATTEMPTS - newFailedLogins;
    throw new Error(
      `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  // Reset failed logins
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(
      user.roles.flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.name),
      ),
    ),
  ];

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const jti = generateSecureToken(16);
  const refreshToken = signRefreshToken(user.id, jti);
  const refreshTokenHash = hashToken(refreshToken);

  // Store refresh token hash
  const updatedTokens = [...user.refreshTokens.slice(-9), refreshTokenHash]; // keep max 10

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLogins: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      refreshTokens: updatedTokens,
    },
  });

  // Invalidate permission cache
  await cache.del(`user:perms:${user.id}`);

  fileLogger.info("auth", "Login successful", {
    userId: user.id,
    email,
    ipAddress,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions,
      lastLoginAt: user.lastLoginAt,
    },
  };
}

export async function refreshTokenService(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error("Invalid refresh token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId, deletedAt: null },
  });

  if (!user || !user.isActive) {
    throw new Error("User not found or inactive");
  }

  const tokenHash = hashToken(refreshToken);
  if (!user.refreshTokens.includes(tokenHash)) {
    throw new Error("Refresh token revoked");
  }

  // Rotate refresh token
  const newJti = generateSecureToken(16);
  const newRefreshToken = signRefreshToken(user.id, newJti);
  const newRefreshTokenHash = hashToken(newRefreshToken);

  const updatedTokens = user.refreshTokens
    .filter((t) => t !== tokenHash)
    .concat(newRefreshTokenHash)
    .slice(-10);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokens: updatedTokens },
  });

  const newAccessToken = signAccessToken({
    userId: user.id,
    email: user.email,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logoutService(
  userId: string,
  refreshToken?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  let updatedTokens = user.refreshTokens;
  if (refreshToken) {
    const hash = hashToken(refreshToken);
    updatedTokens = user.refreshTokens.filter((t) => t !== hash);
  } else {
    updatedTokens = []; // Logout all sessions
  }

  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokens: updatedTokens },
  });

  await cache.del(`user:perms:${userId}`);
}

export async function forgotPasswordService(
  email: string,
  ipAddress: string,
): Promise<void> {
  // Always respond success (never leak if email exists)
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim(), deletedAt: null },
  });

  if (!user || !user.isActive) {
    // Log silently, respond success
    fileLogger.info(
      "auth",
      "Password reset requested for unknown/inactive email",
      { email, ipAddress },
    );
    return;
  }

  const token = generateSecureToken(32);
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: tokenHash,
      resetPasswordExpires: expires,
    },
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  const html = buildPasswordResetEmail(resetUrl, user.firstName);

  // Enqueue email (non-blocking)
  const queued = await addJob(
    QUEUE_NAMES.EMAIL_NOTIFICATIONS,
    "password-reset",
    {
      to: user.email,
      subject: "Password Reset Request – Lako Admin",
      html,
      userId: user.id,
    },
  );

  if (!queued) {
    // If queuing fails, log the reset URL for dev use
    fileLogger.info(
      "auth",
      "Password reset token generated (email queue unavailable)",
      {
        userId: user.id,
        email,
        resetUrl,
        ipAddress,
      },
    );
    logger.info(`[DEV] Password reset URL: ${resetUrl}`);
  } else {
    fileLogger.info("auth", "Password reset email queued", {
      userId: user.id,
      email,
      ipAddress,
    });
  }
}

export async function resetPasswordService(
  token: string,
  newPassword: string,
): Promise<void> {
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new Error(policy.errors.join(". "));
  }

  const tokenHash = hashToken(token);

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { gt: new Date() },
      deletedAt: null,
    },
  });

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      refreshTokens: [], // Invalidate all sessions
      failedLogins: 0,
      lockedUntil: null,
      passwordChangedAt: new Date(),
    },
  });

  await cache.del(`user:perms:${user.id}`);
  fileLogger.info("auth", "Password reset successful", { userId: user.id });
}

export async function changePasswordService(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new Error(policy.errors.join(". "));
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const match = await comparePassword(currentPassword, user.password);
  if (!match) throw new Error("Current password is incorrect");

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      passwordChangedAt: new Date(),
      refreshTokens: [],
    },
  });

  await cache.del(`user:perms:${userId}`);
  fileLogger.info("auth", "Password changed", { userId });
}

export async function getMeService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!user) throw new Error("User not found");

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    passwordChangedAt: user.passwordChangedAt,
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      displayName: ur.role.displayName,
    })),
    permissions: [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.name),
        ),
      ),
    ],
    createdAt: user.createdAt,
  };
}
