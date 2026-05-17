import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types/express';
import { sendError } from '../utils/apiResponse';
import type { Agent } from '@prisma/client';
import { hasAgentPortalStaffRole, hasAgentRole } from '../utils/roles';

export type AgentPortalRequest = AuthRequest & {
  agent?: Agent;
};

export function requireAgentPortalRole(
  req: AgentPortalRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return;
  }

  if (!hasAgentRole(req.user.roles) && !hasAgentPortalStaffRole(req.user.roles)) {
    sendError(res, 'Agent portal access requires an agent role', 403);
    return;
  }

  next();
}

export async function requireAgentProfile(
  req: AgentPortalRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.id) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    const agent = await prisma.agent.findFirst({
      where: {
        deletedAt: null,
        OR: [{ userId: req.user.id }, { email: req.user.email }],
      },
    });

    if (!agent) {
      sendError(res, 'Agent profile not linked to this user', 403);
      return;
    }

    req.agent = agent;
    next();
  } catch (error) {
    next(error);
  }
}

export function assertLeadOwnedByAgent(
  lead: { agentId: string | null } | null,
  agent: Agent,
): boolean {
  if (!lead) return false;
  if (lead.agentId === agent.id) return true;
  return false;
}
