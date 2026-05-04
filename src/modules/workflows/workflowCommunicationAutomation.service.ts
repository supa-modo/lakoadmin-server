import { prisma } from '../../config/database';
import { createMessage } from '../communications/communications.service';
import { clientName } from '../communications/messageRecipient.service';

export async function sendDirectPaymentAcknowledgement(directPaymentId: string, userId: string) {
  const payment = await prisma.directInsurerPayment.findUnique({
    where: { id: directPaymentId },
    include: { client: true, policy: true, insurer: true },
  });
  if (!payment) return null;

  const channel = payment.client.email ? 'EMAIL' : 'SMS';
  const name = clientName(payment.client);
  const amount = new Intl.NumberFormat('en-KE', { style: 'currency', currency: payment.currency }).format(Number(payment.amount));
  const body = channel === 'EMAIL'
    ? `Dear ${name},\n\nWe acknowledge that you paid ${amount} directly to ${payment.insurer.name} for policy ${payment.policy.policyNumber}. This acknowledgement is not an official Lako Agency receipt because premium was not received by Lako.\n\nRegards,\nLako Insurance Agency`
    : `We acknowledge direct premium payment of ${amount} to ${payment.insurer.shortName ?? payment.insurer.name} for policy ${payment.policy.policyNumber}. Not a Lako receipt.`;

  return createMessage({
    channel,
    messageType: 'WORKFLOW_AUTOMATION',
    category: 'DIRECT_INSURER_PAYMENT_ACKNOWLEDGEMENT',
    subject: channel === 'EMAIL' ? `Direct payment acknowledgement for ${payment.policy.policyNumber}` : null,
    body,
    recipients: [{ recipientType: 'CLIENT', clientId: payment.clientId }],
    clientId: payment.clientId,
    policyId: payment.policyId,
    relatedEntityType: 'DirectInsurerPayment',
    relatedEntityId: payment.id,
    variables: {
      policyNumber: payment.policy.policyNumber,
      insurerName: payment.insurer.name,
      amount,
      acknowledgementNumber: payment.acknowledgementNumber,
    },
  }, userId).catch(() => null);
}
