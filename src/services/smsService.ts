import { env } from '../config/env';
import { logger } from '../utils/logger';
import { fileLogger } from './fileLogger';

export interface SmsOptions {
  to: string | string[];
  message: string;
  from?: string;
}

export interface SmsResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  response?: unknown;
  error?: string;
}

export function normalizeKenyanPhoneNumber(input: string): string {
  const cleaned = input.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('254')) return `+${cleaned}`;
  if (cleaned.startsWith('07') || cleaned.startsWith('01')) return `+254${cleaned.slice(1)}`;
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) return `+254${cleaned}`;
  return cleaned;
}

export async function sendSms(opts: SmsOptions): Promise<SmsResult> {
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(normalizeKenyanPhoneNumber);

  if (!env.AT_API_KEY || !env.AT_USERNAME) {
    fileLogger.info('system', 'SMS would be sent (Africa Talking not configured)', {
      to: recipients,
      message: opts.message,
    });
    logger.info('SMS skipped because Africa Talking credentials are not configured', { to: recipients });
    return { success: true, provider: 'africas-talking-dev-log' };
  }

  try {
    const params = new URLSearchParams();
    params.set('username', env.AT_USERNAME);
    params.set('to', recipients.join(','));
    params.set('message', opts.message);
    if (opts.from ?? env.AT_SENDER_ID) params.set('from', opts.from ?? env.AT_SENDER_ID);

    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: env.AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = `Africa Talking SMS failed with HTTP ${response.status}`;
      logger.error(error, { response: payload, to: recipients });
      return { success: false, provider: 'africas-talking', response: payload, error };
    }

    const recipient = payload?.SMSMessageData?.Recipients?.[0];
    const status = String(recipient?.status ?? '').toLowerCase();
    const success = !status || status.includes('success') || status.includes('queued');

    return {
      success,
      provider: 'africas-talking',
      providerMessageId: recipient?.messageId,
      response: payload,
      error: success ? undefined : recipient?.status,
    };
  } catch (error) {
    const message = (error as Error).message;
    logger.error('SMS send failed', { error: message, to: recipients });
    return { success: false, provider: 'africas-talking', error: message };
  }
}
