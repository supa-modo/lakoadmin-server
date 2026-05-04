import { NextFunction, Response } from 'express';
import { AuthRequest } from '../../types/express';
import { sendSuccess } from '../../utils/apiResponse';
import {
  getAgentPerformance,
  getCashPosition,
  getClaimsExposure,
  getClientGrowth,
  getCommissions,
  getExecutiveSummary,
  getInsurerPayables,
  getPremiumCollections,
  getRenewalRisk,
  getRevenuePipeline,
  getSlaBreaches,
  parseExecutiveFilters,
} from './executive.service';

function filters(req: AuthRequest) {
  return parseExecutiveFilters(req.query as Record<string, unknown>);
}

export async function summaryHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getExecutiveSummary(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function revenuePipelineHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getRevenuePipeline(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function premiumCollectionsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getPremiumCollections(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function commissionsHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getCommissions(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function insurerPayablesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getInsurerPayables(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function claimsExposureHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getClaimsExposure(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function renewalRiskHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getRenewalRisk(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function agentPerformanceHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getAgentPerformance(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function cashPositionHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getCashPosition());
  } catch (error) {
    next(error);
  }
}

export async function slaBreachesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getSlaBreaches(filters(req)));
  } catch (error) {
    next(error);
  }
}

export async function clientGrowthHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await getClientGrowth(filters(req)));
  } catch (error) {
    next(error);
  }
}
