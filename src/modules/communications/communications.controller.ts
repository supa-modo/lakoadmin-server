import { NextFunction, Response } from 'express';
import { sendCreated, sendError, sendPaginated, sendSuccess, buildPaginationMeta } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';
import {
  createMessage,
  communicationStats,
  getMessageLog,
  listMessageLogs,
  retryMessage,
} from './communications.service';
import {
  archiveTemplate,
  createTemplate,
  getTemplate,
  listTemplates,
  previewTemplate,
  updateTemplate,
} from './templates.service';
import { previewAudience, searchRecipients } from './messageRecipient.service';
import {
  cancelCampaign,
  createCampaign,
  getCampaign,
  listCampaigns,
  sendCampaign,
  updateCampaign,
} from './campaign.service';
import { listAutomationRules, testAutomationRule, updateAutomationRule } from './automation.service';
import { listEntityCommunications } from './communicationTimeline.service';
import { prisma } from '../../config/database';

export async function templatesIndex(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { data, total } = await listTemplates(req.query as any);
    sendPaginated(res, data, buildPaginationMeta(total, Number(req.query.page), Number(req.query.limit)));
  } catch (error) {
    next(error);
  }
}

export async function templatesCreate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const template = await createTemplate(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'MessageTemplate', template.id, null, req.body);
    sendCreated(res, template, 'Template created');
  } catch (error) {
    next(error);
  }
}

export async function templatesShow(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getTemplate(req.params.id));
  } catch (error) {
    if ((error as Error).message === 'Template not found') sendError(res, 'Template not found', 404);
    else next(error);
  }
}

export async function templatesUpdate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const template = await updateTemplate(req.params.id, req.body, req.user?.id);
    logAudit(req, 'UPDATE', 'MessageTemplate', template.id, null, req.body);
    sendSuccess(res, template, 'Template updated');
  } catch (error) {
    next(error);
  }
}

export async function templatesDelete(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const template = await archiveTemplate(req.params.id, req.user?.id);
    logAudit(req, 'ARCHIVE', 'MessageTemplate', template.id);
    sendSuccess(res, template, 'Template archived');
  } catch (error) {
    next(error);
  }
}

export async function templatesPreview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await previewTemplate(req.params.id, req.body.variables ?? {}, req.body.entity));
  } catch (error) {
    next(error);
  }
}

export async function sendMessageHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const message = await createMessage(req.body, req.user?.id);
    logAudit(req, req.body.scheduledAt ? 'SCHEDULE_MESSAGE' : 'SEND_MESSAGE', 'MessageLog', message?.id, null, {
      channel: req.body.channel,
      recipientCount: message?.recipients?.length ?? 0,
      relatedEntityType: req.body.relatedEntityType,
      relatedEntityId: req.body.relatedEntityId,
    });
    sendCreated(res, message, req.body.scheduledAt ? 'Message scheduled' : 'Message queued');
  } catch (error) {
    next(error);
  }
}

export async function sendBulkHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const campaign = await createCampaign(req.body, req.user?.id);
    const result = await sendCampaign(campaign.id, req.user?.id);
    logAudit(req, 'SEND_BULK_CAMPAIGN', 'CommunicationCampaign', campaign.id, null, {
      channel: req.body.channel,
      audienceType: req.body.audienceType,
      totalRecipients: result.campaign.totalRecipients,
    });
    sendCreated(res, result, 'Bulk campaign queued');
  } catch (error) {
    next(error);
  }
}

export async function logsIndex(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { data, total } = await listMessageLogs(req.query as any);
    sendPaginated(res, data, buildPaginationMeta(total, Number(req.query.page), Number(req.query.limit)));
  } catch (error) {
    next(error);
  }
}

export async function logsShow(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getMessageLog(req.params.id));
  } catch (error) {
    if ((error as Error).message === 'Message not found') sendError(res, 'Message not found', 404);
    else next(error);
  }
}

export async function logsRetry(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const message = await retryMessage(req.params.id);
    logAudit(req, 'RETRY_MESSAGE', 'MessageLog', req.params.id);
    sendSuccess(res, message, 'Message retry queued');
  } catch (error) {
    next(error);
  }
}

export async function recipientsSearchHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await searchRecipients(req.query as any));
  } catch (error) {
    next(error);
  }
}

export async function audiencePreviewHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await previewAudience(req.body));
  } catch (error) {
    next(error);
  }
}

export async function campaignsIndex(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { data, total } = await listCampaigns(req.query as any);
    sendPaginated(res, data, buildPaginationMeta(total, Number(req.query.page), Number(req.query.limit)));
  } catch (error) {
    next(error);
  }
}

export async function campaignsCreate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const campaign = await createCampaign(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'CommunicationCampaign', campaign.id, null, req.body);
    sendCreated(res, campaign, 'Campaign created');
  } catch (error) {
    next(error);
  }
}

export async function campaignsShow(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getCampaign(req.params.id));
  } catch (error) {
    if ((error as Error).message === 'Campaign not found') sendError(res, 'Campaign not found', 404);
    else next(error);
  }
}

export async function campaignsUpdate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const campaign = await updateCampaign(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'CommunicationCampaign', campaign.id, null, req.body);
    sendSuccess(res, campaign, 'Campaign updated');
  } catch (error) {
    next(error);
  }
}

export async function campaignsSend(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await sendCampaign(req.params.id, req.user?.id);
    logAudit(req, 'SEND_CAMPAIGN', 'CommunicationCampaign', req.params.id);
    sendSuccess(res, result, 'Campaign queued');
  } catch (error) {
    next(error);
  }
}

export async function campaignsCancel(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const campaign = await cancelCampaign(req.params.id);
    logAudit(req, 'CANCEL_CAMPAIGN', 'CommunicationCampaign', req.params.id);
    sendSuccess(res, campaign, 'Campaign cancelled');
  } catch (error) {
    next(error);
  }
}

export async function automationsIndex(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await listAutomationRules());
  } catch (error) {
    next(error);
  }
}

export async function automationsUpdate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const rule = await updateAutomationRule(req.params.id, req.body, req.user?.id);
    logAudit(req, 'UPDATE', 'AutomationRule', req.params.id, null, req.body);
    sendSuccess(res, rule, 'Automation rule updated');
  } catch (error) {
    next(error);
  }
}

export async function automationsTest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await testAutomationRule(req.params.id, req.user?.id);
    sendSuccess(res, result, 'Automation test queued');
  } catch (error) {
    next(error);
  }
}

export async function preferencesShow(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = await prisma.communicationPreference.findMany({ where: { clientId: req.params.clientId } });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function preferencesUpdate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const updates = await Promise.all(req.body.preferences.map((pref: any) =>
      prisma.communicationPreference.upsert({
        where: { clientId_channel_category: { clientId: req.params.clientId, channel: pref.channel, category: pref.category } },
        update: {
          isOptedIn: pref.isOptedIn,
          optedOutAt: pref.isOptedIn ? null : new Date(),
          reason: pref.reason ?? null,
        },
        create: {
          clientId: req.params.clientId,
          channel: pref.channel,
          category: pref.category,
          isOptedIn: pref.isOptedIn,
          optedOutAt: pref.isOptedIn ? null : new Date(),
          reason: pref.reason ?? null,
        },
      }),
    ));
    logAudit(req, 'UPDATE', 'CommunicationPreference', req.params.clientId, null, req.body);
    sendSuccess(res, updates, 'Communication preferences updated');
  } catch (error) {
    next(error);
  }
}

export async function entityCommunicationsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const entityType = req.params.entityType ?? req.baseUrl.split('/').pop()?.replace(/s$/, '') ?? '';
    const entityId = req.params.entityId ?? req.params.id;
    sendSuccess(res, await listEntityCommunications(entityType, entityId));
  } catch (error) {
    next(error);
  }
}

export async function statsHandler(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await communicationStats());
  } catch (error) {
    next(error);
  }
}
