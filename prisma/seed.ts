// @ts-nocheck
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { seedRealisticSampleData } from './realistic-sample-data';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const SEED_TAG = '[SEED:sample]';

// ─────────────────────────────────────────────────────────
// PERMISSIONS - comprehensive catalog covering all modules
// ─────────────────────────────────────────────────────────
const PERMISSIONS = [
  // Users
  { name: 'users.read', module: 'users', action: 'read', description: 'View users' },
  { name: 'users.create', module: 'users', action: 'create', description: 'Create users' },
  { name: 'users.update', module: 'users', action: 'update', description: 'Update users' },
  { name: 'users.delete', module: 'users', action: 'delete', description: 'Delete users' },

  // Roles
  { name: 'roles.read', module: 'roles', action: 'read', description: 'View roles' },
  { name: 'roles.create', module: 'roles', action: 'create', description: 'Create roles' },
  { name: 'roles.update', module: 'roles', action: 'update', description: 'Update roles' },
  { name: 'roles.delete', module: 'roles', action: 'delete', description: 'Delete roles' },

  // Permissions
  { name: 'permissions.read', module: 'permissions', action: 'read', description: 'View permissions' },

  // Audit
  { name: 'audit.read', module: 'audit', action: 'read', description: 'View audit logs' },

  // Leads
  { name: 'leads.read', module: 'leads', action: 'read', description: 'View leads' },
  { name: 'leads.create', module: 'leads', action: 'create', description: 'Create leads' },
  { name: 'leads.update', module: 'leads', action: 'update', description: 'Update leads' },
  { name: 'leads.delete', module: 'leads', action: 'delete', description: 'Delete leads' },
  { name: 'leads.assign', module: 'leads', action: 'assign', description: 'Assign leads to users' },
  { name: 'leads.convert', module: 'leads', action: 'convert', description: 'Convert leads to clients' },
  { name: 'leads.import', module: 'leads', action: 'import', description: 'Import leads from CSV' },

  // Clients
  { name: 'clients.read', module: 'clients', action: 'read', description: 'View clients' },
  { name: 'clients.create', module: 'clients', action: 'create', description: 'Create clients' },
  { name: 'clients.update', module: 'clients', action: 'update', description: 'Update clients' },
  { name: 'clients.delete', module: 'clients', action: 'delete', description: 'Delete clients' },
  { name: 'clients.merge', module: 'clients', action: 'merge', description: 'Merge duplicate clients' },

  // Tasks
  { name: 'tasks.read', module: 'tasks', action: 'read', description: 'View tasks' },
  { name: 'tasks.create', module: 'tasks', action: 'create', description: 'Create tasks' },
  { name: 'tasks.update', module: 'tasks', action: 'update', description: 'Update tasks' },
  { name: 'tasks.delete', module: 'tasks', action: 'delete', description: 'Delete tasks' },
  { name: 'tasks.complete', module: 'tasks', action: 'complete', description: 'Complete tasks' },

  // Onboarding
  { name: 'onboarding.read', module: 'onboarding', action: 'read', description: 'View onboarding cases' },
  { name: 'onboarding.create', module: 'onboarding', action: 'create', description: 'Create onboarding cases' },
  { name: 'onboarding.update', module: 'onboarding', action: 'update', description: 'Update onboarding cases' },
  { name: 'onboarding.approve', module: 'onboarding', action: 'approve', description: 'Approve onboarding cases' },
  { name: 'onboarding.reject', module: 'onboarding', action: 'reject', description: 'Reject onboarding cases' },

  // Insurers
  { name: 'insurers.read', module: 'insurers', action: 'read', description: 'View insurers' },
  { name: 'insurers.create', module: 'insurers', action: 'create', description: 'Create insurers' },
  { name: 'insurers.update', module: 'insurers', action: 'update', description: 'Update insurers' },
  { name: 'insurers.delete', module: 'insurers', action: 'delete', description: 'Delete insurers' },

  // Products
  { name: 'products.read', module: 'products', action: 'read', description: 'View products' },
  { name: 'products.create', module: 'products', action: 'create', description: 'Create products' },
  { name: 'products.update', module: 'products', action: 'update', description: 'Update products' },
  { name: 'products.delete', module: 'products', action: 'delete', description: 'Delete products' },

  // Policies
  { name: 'policies.read', module: 'policies', action: 'read', description: 'View policies' },
  { name: 'policies.create', module: 'policies', action: 'create', description: 'Create policies' },
  { name: 'policies.update', module: 'policies', action: 'update', description: 'Update policies' },
  { name: 'policies.delete', module: 'policies', action: 'delete', description: 'Delete policies' },
  { name: 'policies.activate', module: 'policies', action: 'activate', description: 'Activate policies after readiness checks pass' },
  { name: 'policies.underwrite', module: 'policies', action: 'underwrite', description: 'Underwrite policies' },

  // Claims
  { name: 'claims.read', module: 'claims', action: 'read', description: 'View claims' },
  { name: 'claims.create', module: 'claims', action: 'create', description: 'Create claims' },
  { name: 'claims.update', module: 'claims', action: 'update', description: 'Update claims' },
  { name: 'claims.delete', module: 'claims', action: 'delete', description: 'Delete claims' },
  { name: 'claims.approve', module: 'claims', action: 'approve', description: 'Approve/reject claims' },
  { name: 'claims.assign', module: 'claims', action: 'assign', description: 'Assign claims to owners' },
  { name: 'claims.status.update', module: 'claims', action: 'status.update', description: 'Update claim workflow status' },
  { name: 'claims.submit_to_insurer', module: 'claims', action: 'submit_to_insurer', description: 'Submit claims to insurers' },
  { name: 'claims.documents.upload', module: 'claims', action: 'documents.upload', description: 'Upload claim documents' },
  { name: 'claims.documents.verify', module: 'claims', action: 'documents.verify', description: 'Verify or reject claim documents' },
  { name: 'claims.assessment.manage', module: 'claims', action: 'assessment.manage', description: 'Manage claim assessments' },
  { name: 'claims.settlement.manage', module: 'claims', action: 'settlement.manage', description: 'Manage claim settlements' },
  { name: 'claims.close', module: 'claims', action: 'close', description: 'Close claims' },
  { name: 'claims.reports.read', module: 'claims', action: 'reports.read', description: 'View claims reports and dashboards' },
  { name: 'claims.override_policy_eligibility', module: 'claims', action: 'override_policy_eligibility', description: 'Override policy eligibility warnings during claim registration' },

  // Payments
  { name: 'payments.read', module: 'payments', action: 'read', description: 'View payments' },
  { name: 'payments.create', module: 'payments', action: 'create', description: 'Record payments' },
  { name: 'payments.update', module: 'payments', action: 'update', description: 'Update payments' },
  { name: 'payments.verify', module: 'payments', action: 'verify', description: 'Verify payments' },
  { name: 'payments.reverse', module: 'payments', action: 'reverse', description: 'Reverse payments' },
  { name: 'payments.record_direct_insurer_payment', module: 'payments', action: 'record_direct_insurer_payment', description: 'Record direct-to-insurer premium payments' },
  { name: 'payments.verify_direct_insurer_payment', module: 'payments', action: 'verify_direct_insurer_payment', description: 'Verify direct-to-insurer premium payments' },

  // Receipts
  { name: 'receipts.generate', module: 'receipts', action: 'generate', description: 'Generate official receipts' },
  { name: 'receipts.generate_acknowledgement', module: 'receipts', action: 'generate_acknowledgement', description: 'Generate payment acknowledgements for direct insurer payments' },

  // Agents
  { name: 'agents.read', module: 'agents', action: 'read', description: 'View agents' },
  { name: 'agents.create', module: 'agents', action: 'create', description: 'Create agents' },
  { name: 'agents.update', module: 'agents', action: 'update', description: 'Update agents' },
  { name: 'agents.delete', module: 'agents', action: 'delete', description: 'Delete agents' },

  // Commissions
  { name: 'commissions.read', module: 'commissions', action: 'read', description: 'View commissions' },
  { name: 'commissions.create', module: 'commissions', action: 'create', description: 'Create commission entries' },
  { name: 'commissions.calculate', module: 'commissions', action: 'calculate', description: 'Calculate commissions' },
  { name: 'commissions.override', module: 'commissions', action: 'override', description: 'Override commission calculations with a reason' },
  { name: 'commissions.approve', module: 'commissions', action: 'approve', description: 'Approve commissions' },
  { name: 'commissions.pay', module: 'commissions', action: 'pay', description: 'Process commission payments' },
  { name: 'commissions.hold', module: 'commissions', action: 'hold', description: 'Hold commissions' },
  { name: 'commissions.clawback', module: 'commissions', action: 'clawback', description: 'Create commission clawbacks' },
  { name: 'commissions.statement', module: 'commissions', action: 'statement', description: 'Generate agent commission statements' },

  // Accounting
  { name: 'accounting.read', module: 'accounting', action: 'read', description: 'View accounting records' },
  { name: 'accounting.dashboard.read', module: 'accounting', action: 'dashboard.read', description: 'View finance dashboard' },
  { name: 'accounting.create', module: 'accounting', action: 'create', description: 'Create journal entries' },
  { name: 'accounting.approve', module: 'accounting', action: 'approve', description: 'Approve journal entries' },
  { name: 'accounting.post', module: 'accounting', action: 'post', description: 'Post journal entries' },
  { name: 'accounting.reconcile', module: 'accounting', action: 'reconcile', description: 'Reconcile accounts' },
  { name: 'accounting.accounts.read', module: 'accounting', action: 'accounts.read', description: 'View bank, M-Pesa, and ledger accounts' },
  { name: 'accounting.accounts.create', module: 'accounting', action: 'accounts.create', description: 'Create bank and M-Pesa accounts' },
  { name: 'accounting.accounts.update', module: 'accounting', action: 'accounts.update', description: 'Update bank and M-Pesa accounts' },
  { name: 'accounting.transactions.read', module: 'accounting', action: 'transactions.read', description: 'View finance transactions' },
  { name: 'accounting.expenses.read', module: 'accounting', action: 'expenses.read', description: 'View expenses' },
  { name: 'accounting.expenses.create', module: 'accounting', action: 'expenses.create', description: 'Create expenses' },
  { name: 'accounting.expenses.approve', module: 'accounting', action: 'expenses.approve', description: 'Approve expenses' },
  { name: 'accounting.expenses.pay', module: 'accounting', action: 'expenses.pay', description: 'Pay expenses' },
  { name: 'accounting.vendors.manage', module: 'accounting', action: 'vendors.manage', description: 'Manage vendors and suppliers' },
  { name: 'accounting.commission_receivables.manage', module: 'accounting', action: 'commission_receivables.manage', description: 'Manage insurer commission receivables' },
  { name: 'accounting.agent_payables.manage', module: 'accounting', action: 'agent_payables.manage', description: 'Manage agent commission payables' },
  { name: 'accounting.chart_of_accounts.manage', module: 'accounting', action: 'chart_of_accounts.manage', description: 'Manage chart of accounts' },
  { name: 'accounting.journals.reverse', module: 'accounting', action: 'journals.reverse', description: 'Reverse posted journals' },
  { name: 'accounting.reports.read', module: 'accounting', action: 'reports.read', description: 'View finance reports' },
  { name: 'accounting.settings.manage', module: 'accounting', action: 'settings.manage', description: 'Manage finance settings' },
  { name: 'accounting.accounts.manage', module: 'accounting', action: 'accounts.manage', description: 'Manage chart of accounts' },
  { name: 'accounting.journals.create', module: 'accounting', action: 'journals.create', description: 'Create manual journals' },
  { name: 'accounting.journals.approve', module: 'accounting', action: 'journals.approve', description: 'Approve journals' },
  { name: 'accounting.journals.post', module: 'accounting', action: 'journals.post', description: 'Post journals' },
  { name: 'accounting.reports.view', module: 'accounting', action: 'reports.view', description: 'View accounting reports' },
  { name: 'accounting.periods.manage', module: 'accounting', action: 'periods.manage', description: 'Manage financial periods' },
  { name: 'accounting.reconciliation.manage', module: 'accounting', action: 'reconciliation.manage', description: 'Manage reconciliation' },
  { name: 'accounting.expenses.manage', module: 'accounting', action: 'expenses.manage', description: 'Manage expenses' },
  { name: 'accounting.remittances.manage', module: 'accounting', action: 'remittances.manage', description: 'Manage insurer remittances' },

  // Reports
  { name: 'reports.read', module: 'reports', action: 'read', description: 'View reports' },
  { name: 'reports.export', module: 'reports', action: 'export', description: 'Export reports' },

  // Executive
  { name: 'executive.dashboard.read', module: 'executive', action: 'dashboard.read', description: 'View director executive command center' },

  // Settings
  { name: 'settings.read', module: 'settings', action: 'read', description: 'View settings' },
  { name: 'settings.update', module: 'settings', action: 'update', description: 'Update settings' },

  // Documents
  { name: 'documents.read', module: 'documents', action: 'read', description: 'View documents' },
  { name: 'documents.create', module: 'documents', action: 'create', description: 'Upload documents' },
  { name: 'documents.update', module: 'documents', action: 'update', description: 'Update document metadata' },
  { name: 'documents.verify', module: 'documents', action: 'verify', description: 'Verify or reject documents' },
  { name: 'documents.delete', module: 'documents', action: 'delete', description: 'Delete documents' },
  { name: 'documents.requirements.manage', module: 'documents', action: 'requirements.manage', description: 'Manage reusable document requirements' },

  // Communications & Automation
  { name: 'communications.read', module: 'communications', action: 'read', description: 'View communications center and entity timelines' },
  { name: 'communications.send', module: 'communications', action: 'send', description: 'Send individual communications' },
  { name: 'communications.send_bulk', module: 'communications', action: 'send_bulk', description: 'Send bulk communications and campaigns' },
  { name: 'communications.schedule', module: 'communications', action: 'schedule', description: 'Schedule communications' },
  { name: 'communications.templates.read', module: 'communications', action: 'templates.read', description: 'View message templates' },
  { name: 'communications.templates.create', module: 'communications', action: 'templates.create', description: 'Create message templates' },
  { name: 'communications.templates.update', module: 'communications', action: 'templates.update', description: 'Update message templates' },
  { name: 'communications.templates.delete', module: 'communications', action: 'templates.delete', description: 'Archive message templates' },
  { name: 'communications.campaigns.read', module: 'communications', action: 'campaigns.read', description: 'View communication campaigns' },
  { name: 'communications.campaigns.create', module: 'communications', action: 'campaigns.create', description: 'Create communication campaigns' },
  { name: 'communications.campaigns.send', module: 'communications', action: 'campaigns.send', description: 'Send or cancel communication campaigns' },
  { name: 'communications.automations.manage', module: 'communications', action: 'automations.manage', description: 'Manage automation rules' },
  { name: 'communications.settings.manage', module: 'communications', action: 'settings.manage', description: 'Manage communication settings and preferences' },
  { name: 'communications.logs.read', module: 'communications', action: 'logs.read', description: 'View delivery logs' },
  { name: 'notifications.read', module: 'notifications', action: 'read', description: 'Read in-app notifications' },
  { name: 'notifications.manage', module: 'notifications', action: 'manage', description: 'Manage in-app notifications' },
];

// ─────────────────────────────────────────────────────────
// ROLES definition
// ─────────────────────────────────────────────────────────
const ALL_PERMS = PERMISSIONS.map((p) => p.name);

const CLAIM_DOCUMENT_REQUIREMENTS = [
  ['MOTOR_PRIVATE', 'MOTOR_ACCIDENT', 'ACCIDENT', 'CLAIM_FORM', 'Claim form', 'Completed motor accident claim form.'],
  ['MOTOR_PRIVATE', 'MOTOR_ACCIDENT', 'ACCIDENT', 'POLICE_ABSTRACT', 'Police abstract', 'Police abstract or OB number.'],
  ['MOTOR_PRIVATE', 'MOTOR_ACCIDENT', 'ACCIDENT', 'DRIVING_LICENSE', 'Driving license', 'Driver license copy.'],
  ['MOTOR_PRIVATE', 'MOTOR_ACCIDENT', 'ACCIDENT', 'PHOTOS', 'Accident photos', 'Photos showing damage and scene.'],
  ['MOTOR_PRIVATE', 'MOTOR_ACCIDENT', 'ACCIDENT', 'REPAIR_ESTIMATE', 'Repair estimate', 'Garage assessment or estimate.'],
  ['MOTOR_PRIVATE', 'MOTOR_THEFT', 'THEFT', 'CLAIM_FORM', 'Claim form', 'Completed motor theft claim form.'],
  ['MOTOR_PRIVATE', 'MOTOR_THEFT', 'THEFT', 'POLICE_REPORT', 'Police report', 'Police report for theft incident.'],
  ['MOTOR_PRIVATE', 'MOTOR_THEFT', 'THEFT', 'LOGBOOK', 'Vehicle logbook', 'Vehicle ownership/logbook copy.'],
  ['MOTOR_PRIVATE', 'MOTOR_THEFT', 'THEFT', 'KEYS_CONFIRMATION', 'Keys confirmation', 'Original/spare keys confirmation.'],
  ['FIRE_DOMESTIC', 'PROPERTY_FIRE', 'FIRE', 'CLAIM_FORM', 'Claim form', 'Completed property claim form.'],
  ['FIRE_DOMESTIC', 'PROPERTY_FIRE', 'FIRE', 'FIRE_BRIGADE_REPORT', 'Fire brigade report', 'Fire brigade report where applicable.'],
  ['FIRE_DOMESTIC', 'PROPERTY_FIRE', 'FIRE', 'PHOTOS', 'Loss photos', 'Photos of damaged property.'],
  ['FIRE_DOMESTIC', 'PROPERTY_FIRE', 'FIRE', 'REPLACEMENT_ESTIMATE', 'Repair/replacement estimates', 'Repair or replacement quotations.'],
  ['MEDICAL_COMPREHENSIVE', 'MEDICAL', 'ILLNESS', 'CLAIM_FORM', 'Claim form', 'Completed medical claim form.'],
  ['MEDICAL_COMPREHENSIVE', 'MEDICAL', 'ILLNESS', 'MEDICAL_REPORT', 'Medical report', 'Doctor or hospital medical report.'],
  ['MEDICAL_COMPREHENSIVE', 'MEDICAL', 'ILLNESS', 'INVOICES', 'Hospital invoices', 'Hospital/clinic invoices.'],
  ['MEDICAL_COMPREHENSIVE', 'MEDICAL', 'ILLNESS', 'RECEIPTS', 'Receipts', 'Payment receipts for reimbursement.'],
  ['LIFE_ORDINARY', 'LIFE_DEATH', 'DEATH', 'CLAIM_FORM', 'Claim form', 'Completed life/death claim form.'],
  ['LIFE_ORDINARY', 'LIFE_DEATH', 'DEATH', 'DEATH_CERTIFICATE', 'Death certificate', 'Official death certificate.'],
  ['LIFE_ORDINARY', 'LIFE_DEATH', 'DEATH', 'BURIAL_PERMIT', 'Burial permit', 'Burial permit where required.'],
  ['LIFE_ORDINARY', 'LIFE_DEATH', 'DEATH', 'BENEFICIARY_ID', 'Beneficiary ID', 'Beneficiary identification document.'],
  [null, 'GENERAL', 'OTHER', 'CLAIM_FORM', 'Claim form', 'Completed insurer claim form.'],
  [null, 'GENERAL', 'OTHER', 'SUPPORTING_EVIDENCE', 'Supporting evidence', 'Documents supporting the claim event and amount.'],
] as const;

const DEFAULT_MESSAGE_TEMPLATES = [
  {
    code: 'CLIENT_WELCOME_EMAIL',
    name: 'Client welcome email',
    channel: 'EMAIL',
    category: 'CLIENT_WELCOME',
    subject: 'Welcome to {{companyName}}, {{clientName}}',
    body: 'Dear {{clientName}},\n\nWelcome to {{companyName}}. Our team is ready to support your insurance needs with clear advice, timely service, and proactive follow-up.\n\nRegards,\n{{companyName}}',
    variables: { clientName: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'ONBOARDING_DOCUMENT_REQUEST_SMS',
    name: 'Onboarding document request SMS',
    channel: 'SMS',
    category: 'ONBOARDING_DOCUMENT_REQUEST',
    subject: null,
    body: 'Dear {{clientName}}, please share the pending onboarding documents for your insurance setup. {{companyName}}',
    variables: { clientName: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'POLICY_ACTIVATED_EMAIL',
    name: 'Policy activation confirmation',
    channel: 'EMAIL',
    category: 'POLICY_ACTIVATED',
    subject: 'Policy {{policyNumber}} is now active',
    body: 'Dear {{clientName}},\n\nYour {{productName}} policy {{policyNumber}} with {{insurerName}} is now active. Please contact us if you need clarification on benefits, endorsements, claims, or renewals.\n\nRegards,\n{{companyName}}',
    variables: { clientName: '', policyNumber: '', productName: '', insurerName: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'POLICY_RENEWAL_REMINDER_SMS',
    name: 'Policy renewal reminder SMS',
    channel: 'SMS',
    category: 'POLICY_RENEWAL_REMINDER',
    subject: null,
    body: 'Reminder: Policy {{policyNumber}} expires on {{dueDate}}. Contact {{companyName}} to renew in good time.',
    variables: { policyNumber: '', dueDate: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'PAYMENT_REMINDER_EMAIL',
    name: 'Premium payment reminder',
    channel: 'EMAIL',
    category: 'PAYMENT_REMINDER',
    subject: 'Payment reminder for policy {{policyNumber}}',
    body: 'Dear {{clientName}},\n\nThis is a reminder that KES {{amount}} remains outstanding for policy {{policyNumber}}. Please make payment or share proof of payment for allocation.\n\nRegards,\n{{companyName}}',
    variables: { clientName: '', amount: '', policyNumber: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'CLAIM_REGISTERED_EMAIL',
    name: 'Claim registration acknowledgement',
    channel: 'EMAIL',
    category: 'CLAIM_REGISTERED',
    subject: 'Claim {{claimNumber}} has been registered',
    body: 'Dear {{clientName}},\n\nWe have registered claim {{claimNumber}} and our claims team will keep you updated. Kindly provide any pending documents requested by the team.\n\nRegards,\n{{companyName}}',
    variables: { clientName: '', claimNumber: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'CLAIM_DOCUMENT_REQUEST_SMS',
    name: 'Claim document request SMS',
    channel: 'SMS',
    category: 'CLAIM_DOCUMENT_REQUEST',
    subject: null,
    body: 'Claim {{claimNumber}} update: please share the pending claim documents so we can proceed. {{companyName}}',
    variables: { claimNumber: '', companyName: 'Lako Insurance Agency' },
  },
  {
    code: 'TASK_REMINDER_INTERNAL',
    name: 'Internal task reminder',
    channel: 'INTERNAL_NOTIFICATION',
    category: 'TASK_REMINDER',
    subject: 'Task reminder: {{taskTitle}}',
    body: 'Reminder: {{taskTitle}} is due on {{dueDate}}.',
    variables: { taskTitle: '', dueDate: '' },
  },
] as const;

const DEFAULT_AUTOMATION_RULES = [
  ['Welcome new client', 'CLIENT_CREATED', 'EMAIL', 'CLIENT_WELCOME_EMAIL', { recipient: 'client' }],
  ['Missing onboarding documents', 'ONBOARDING_DOCUMENT_MISSING', 'SMS', 'ONBOARDING_DOCUMENT_REQUEST_SMS', { recipient: 'client', repeatDays: 3 }],
  ['Policy activation confirmation', 'POLICY_ACTIVATED', 'EMAIL', 'POLICY_ACTIVATED_EMAIL', { recipient: 'client' }],
  ['Renewal reminder - 30 days', 'POLICY_RENEWAL_UPCOMING', 'SMS', 'POLICY_RENEWAL_REMINDER_SMS', { daysBeforeExpiry: 30 }],
  ['Premium payment reminder', 'PAYMENT_DUE', 'EMAIL', 'PAYMENT_REMINDER_EMAIL', { recipient: 'client' }],
  ['Claim registered acknowledgement', 'CLAIM_REGISTERED', 'EMAIL', 'CLAIM_REGISTERED_EMAIL', { recipient: 'client' }],
  ['Claim documents missing', 'CLAIM_DOCUMENTS_MISSING', 'SMS', 'CLAIM_DOCUMENT_REQUEST_SMS', { recipient: 'client' }],
  ['Task due soon', 'TASK_DUE_SOON', 'INTERNAL_NOTIFICATION', 'TASK_REMINDER_INTERNAL', { hoursBeforeDue: 24 }],
] as const;

const ROLES: Record<string, {
  displayName: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}> = {
  SuperAdmin: {
    displayName: 'Super Administrator',
    description: 'Full system access – no restrictions',
    isSystem: true,
    permissions: ALL_PERMS,
  },
  Admin: {
    displayName: 'Administrator',
    description: 'Administrative access excluding certain super-admin functions',
    isSystem: true,
    permissions: ALL_PERMS.filter(
      (p) => !['users.delete', 'settings.update', 'accounting.post'].includes(p),
    ),
  },
  SalesAgent: {
    displayName: 'Sales Agent',
    description: 'CRM, leads, clients, and policy creation',
    isSystem: false,
    permissions: [
      'leads.read', 'leads.create', 'leads.update', 'leads.convert',
      'clients.read', 'clients.create', 'clients.update',
      'tasks.read', 'tasks.create', 'tasks.update', 'tasks.complete',
      'onboarding.read', 'onboarding.create', 'onboarding.update',
      'policies.read', 'policies.create',
      'insurers.read', 'products.read',
      'claims.read',
      'documents.read', 'documents.create', 'documents.update',
      'communications.read', 'communications.send', 'communications.templates.read',
      'notifications.read',
      'reports.read',
    ],
  },
  RelationshipManager: {
    displayName: 'Relationship Manager',
    description: 'Manage client relationships and policies',
    isSystem: false,
    permissions: [
      'leads.read', 'leads.create', 'leads.update', 'leads.assign', 'leads.convert',
      'clients.read', 'clients.create', 'clients.update',
      'tasks.read', 'tasks.create', 'tasks.update', 'tasks.complete',
      'onboarding.read', 'onboarding.create', 'onboarding.update',
      'policies.read', 'policies.create', 'policies.update', 'policies.activate',
      'insurers.read', 'products.read',
      'claims.read', 'claims.create',
      'payments.read',
      'documents.read', 'documents.create', 'documents.update', 'documents.verify',
      'communications.read', 'communications.send', 'communications.schedule',
      'communications.templates.read', 'communications.logs.read',
      'notifications.read',
      'reports.read',
    ],
  },
  ClaimsOfficer: {
    displayName: 'Claims Officer',
    description: 'Handle and process insurance claims',
    isSystem: false,
    permissions: [
      'clients.read',
      'policies.read',
      'tasks.read', 'tasks.create', 'tasks.update', 'tasks.complete',
      'claims.read', 'claims.create', 'claims.update', 'claims.approve', 'claims.assign',
      'claims.status.update', 'claims.submit_to_insurer', 'claims.documents.upload',
      'claims.documents.verify', 'claims.assessment.manage', 'claims.settlement.manage',
      'claims.close', 'claims.reports.read', 'claims.override_policy_eligibility',
      'documents.read', 'documents.create',
      'communications.read', 'communications.send', 'communications.templates.read',
      'communications.logs.read', 'notifications.read',
      'reports.read',
    ],
  },
  Accountant: {
    displayName: 'Accountant',
    description: 'Accounting and payment processing',
    isSystem: false,
    permissions: [
      'clients.read',
      'policies.read',
      'claims.read', 'claims.settlement.manage', 'claims.reports.read',
      'payments.read', 'payments.create', 'payments.verify', 'payments.record_direct_insurer_payment',
      'receipts.generate', 'receipts.generate_acknowledgement',
      'accounting.read', 'accounting.create', 'accounting.reconcile', 'accounting.journals.create',
      'accounting.dashboard.read', 'accounting.accounts.read', 'accounting.transactions.read',
      'accounting.expenses.read', 'accounting.expenses.create', 'accounting.expenses.pay',
      'accounting.reports.view', 'accounting.reports.read', 'accounting.expenses.manage',
      'accounting.vendors.manage', 'accounting.reconciliation.manage',
      'commissions.read', 'commissions.calculate',
      'communications.read', 'communications.send', 'communications.templates.read',
      'communications.logs.read', 'notifications.read',
      'reports.read', 'reports.export',
      'documents.read', 'documents.create',
    ],
  },
  FinanceManager: {
    displayName: 'Finance Manager',
    description: 'Full financial oversight',
    isSystem: false,
    permissions: [
      'clients.read',
      'policies.read',
      'claims.read', 'claims.settlement.manage', 'claims.reports.read',
      'payments.read', 'payments.create', 'payments.verify', 'payments.reverse',
      'payments.record_direct_insurer_payment', 'payments.verify_direct_insurer_payment',
      'receipts.generate', 'receipts.generate_acknowledgement',
      'accounting.read', 'accounting.create', 'accounting.approve', 'accounting.post', 'accounting.reconcile',
      'accounting.accounts.manage', 'accounting.journals.create', 'accounting.journals.approve', 'accounting.journals.post',
      'accounting.reports.view', 'accounting.periods.manage', 'accounting.reconciliation.manage', 'accounting.expenses.manage',
      'accounting.remittances.manage',
      'accounting.dashboard.read', 'accounting.accounts.read', 'accounting.accounts.create', 'accounting.accounts.update',
      'accounting.transactions.read', 'accounting.expenses.read', 'accounting.expenses.create',
      'accounting.expenses.approve', 'accounting.expenses.pay', 'accounting.vendors.manage',
      'accounting.commission_receivables.manage', 'accounting.agent_payables.manage',
      'accounting.chart_of_accounts.manage', 'accounting.journals.reverse',
      'accounting.reports.read', 'accounting.settings.manage',
      'commissions.read', 'commissions.calculate', 'commissions.override', 'commissions.approve', 'commissions.pay', 'commissions.hold',
      'commissions.clawback', 'commissions.statement',
      'executive.dashboard.read',
      'communications.read', 'communications.send', 'communications.send_bulk', 'communications.schedule',
      'communications.templates.read', 'communications.campaigns.read', 'communications.logs.read',
      'notifications.read', 'notifications.manage',
      'reports.read', 'reports.export',
      'documents.read', 'documents.create', 'documents.update', 'documents.verify',
    ],
  },
  OpsManager: {
    displayName: 'Operations Manager',
    description: 'Operations oversight across all modules',
    isSystem: false,
    permissions: [
      'leads.read', 'leads.assign', 'clients.read',
      'tasks.read', 'tasks.update',
      'onboarding.read', 'onboarding.approve', 'onboarding.reject',
      'insurers.read', 'products.read',
      'policies.read', 'policies.update', 'policies.activate',
      'claims.read', 'claims.create', 'claims.update', 'claims.assign', 'claims.status.update',
      'claims.submit_to_insurer', 'claims.documents.upload', 'claims.documents.verify',
      'claims.assessment.manage', 'claims.settlement.manage', 'claims.close',
      'claims.reports.read', 'claims.override_policy_eligibility',
      'payments.read',
      'agents.read',
      'commissions.read',
      'executive.dashboard.read',
      'reports.read', 'reports.export',
      'documents.read', 'documents.create', 'documents.update', 'documents.verify', 'documents.requirements.manage',
      'settings.read',
      'communications.read', 'communications.send', 'communications.send_bulk', 'communications.schedule',
      'communications.templates.read', 'communications.templates.create', 'communications.templates.update',
      'communications.campaigns.read', 'communications.campaigns.create', 'communications.campaigns.send',
      'communications.automations.manage', 'communications.settings.manage', 'communications.logs.read',
      'notifications.read', 'notifications.manage',
    ],
  },
  Support: {
    displayName: 'Support Staff',
    description: 'Read-only access for support and helpdesk',
    isSystem: false,
    permissions: [
      'leads.read', 'clients.read',
      'policies.read', 'claims.read',
      'payments.read',
      'documents.read',
      'communications.read', 'communications.logs.read', 'notifications.read',
    ],
  },
  Auditor: {
    displayName: 'Auditor',
    description: 'Read-only access including audit logs for compliance',
    isSystem: false,
    permissions: [
      'leads.read', 'clients.read',
      'insurers.read', 'products.read',
      'policies.read', 'claims.read',
      'payments.read',
      'accounting.read', 'accounting.dashboard.read', 'accounting.accounts.read',
      'accounting.transactions.read', 'accounting.reports.read', 'accounting.reports.view',
      'commissions.read',
      'audit.read',
      'executive.dashboard.read',
      'communications.read', 'communications.templates.read', 'communications.campaigns.read',
      'communications.logs.read', 'notifications.read',
      'reports.read', 'reports.export',
      'documents.read',
    ],
  },
};

async function main(): Promise<void> {
  console.log('🌱 Starting seed...');
  const seedSampleData = (process.env.SEED_SAMPLE_DATA ?? '').toLowerCase() === 'true';

  // ── Permissions ──────────────────────────────────────
  console.log('Creating permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`✓ ${PERMISSIONS.length} permissions seeded`);

  // ── Roles ─────────────────────────────────────────────
  console.log('Creating roles...');
  const permissionMap = new Map<string, string>();
  const allPerms = await prisma.permission.findMany();
  for (const p of allPerms) permissionMap.set(p.name, p.id);

  for (const [roleName, roleData] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { displayName: roleData.displayName, description: roleData.description },
      create: {
        name: roleName,
        displayName: roleData.displayName,
        description: roleData.description,
        isSystem: roleData.isSystem,
      },
    });

    // Reset permissions
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const permIds = roleData.permissions
      .map((name) => permissionMap.get(name))
      .filter((id): id is string => !!id);

    if (permIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    console.log(`  ✓ ${roleName} (${permIds.length} permissions)`);
  }

  // ── Admin User ────────────────────────────────────────
  console.log('Creating admin user...');
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@lako.co.ke';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@1234!';
  const adminFirstName = process.env.ADMIN_FIRST_NAME ?? 'System';
  const adminLastName = process.env.ADMIN_LAST_NAME ?? 'Admin';

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SuperAdmin' } });
  if (!superAdminRole) throw new Error('SuperAdmin role not found!');

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        firstName: adminFirstName,
        lastName: adminLastName,
        isActive: true,
        roles: {
          create: { roleId: superAdminRole.id },
        },
      },
    });
    console.log(`✓ Admin user created: ${admin.email}`);
  } else {
    console.log(`✓ Admin user already exists: ${existingAdmin.email}`);
  }

  // ── Default Settings ──────────────────────────────────
  console.log('Creating default settings...');
  const defaultSettings = [
    { key: 'company.name', value: 'Lako Insurance Agency', type: 'string', category: 'company', description: 'Company name', isPublic: true },
    { key: 'company.email', value: 'info@lako.co.ke', type: 'string', category: 'company', description: 'Company email', isPublic: true },
    { key: 'company.phone', value: '+254 700 000 000', type: 'string', category: 'company', description: 'Company phone', isPublic: true },
    { key: 'company.currency', value: 'KES', type: 'string', category: 'company', description: 'Default currency', isPublic: true },
    { key: 'auth.maxLoginAttempts', value: '5', type: 'number', category: 'security', description: 'Maximum login attempts before lockout' },
    { key: 'auth.lockoutMinutes', value: '15', type: 'number', category: 'security', description: 'Lockout duration in minutes' },
    { key: 'policy.renewalReminderDays', value: '30,15,7,1', type: 'string', category: 'policies', description: 'Days before policy expiry to send renewal reminders' },
    { key: 'commission.defaultAgencyCommissionRate', value: '0.10', type: 'number', category: 'commissions', description: 'Fallback agency commission rate used when no active commission rule matches' },
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`✓ ${defaultSettings.length} settings seeded`);

  console.log('Creating default communication templates...');
  const templateIds = new Map<string, string>();
  for (const template of DEFAULT_MESSAGE_TEMPLATES) {
    const row = await prisma.messageTemplate.upsert({
      where: { code: template.code },
      update: {
        name: template.name,
        channel: template.channel as any,
        category: template.category as any,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isSystem: true,
        isActive: true,
      },
      create: {
        name: template.name,
        code: template.code,
        channel: template.channel as any,
        category: template.category as any,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isSystem: true,
        isActive: true,
      },
    });
    templateIds.set(template.code, row.id);
  }
  console.log(`Seeded ${DEFAULT_MESSAGE_TEMPLATES.length} communication templates`);

  console.log('Creating default automation rules...');
  for (const [name, triggerType, channel, templateCode, scheduleConfig] of DEFAULT_AUTOMATION_RULES) {
    const existing = await prisma.automationRule.findFirst({ where: { triggerType: triggerType as any, name } });
    const data = {
      name,
      triggerType: triggerType as any,
      channel: channel as any,
      templateId: templateIds.get(templateCode) ?? null,
      isActive: false,
      scheduleConfig,
      conditions: {},
      recipientConfig: scheduleConfig,
    };
    if (existing) await prisma.automationRule.update({ where: { id: existing.id }, data });
    else await prisma.automationRule.create({ data });
  }
  console.log(`Seeded ${DEFAULT_AUTOMATION_RULES.length} automation rules`);

  console.log('Creating claim document requirements...');
  for (const [insuranceClass, claimType, lossType, documentType, documentName, description] of CLAIM_DOCUMENT_REQUIREMENTS) {
    const id = `seed-${claimType}-${documentType}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    await prisma.claimDocumentRequirement.upsert({
      where: { id },
      update: { documentName, description, isActive: true },
      create: {
        id,
        insuranceClass: insuranceClass as any,
        claimType,
        lossType,
        documentType,
        documentName,
        description,
        isRequired: true,
      },
    });
  }
  console.log(`Seeded ${CLAIM_DOCUMENT_REQUIREMENTS.length} claim document requirements`);

  // ─────────────────────────────────────────────────────────
  // SAMPLE DATA (optional) - gated by SEED_SAMPLE_DATA=true
  // ─────────────────────────────────────────────────────────
  if (!seedSampleData) {
    console.log('\nℹ️  Sample data seeding skipped (set SEED_SAMPLE_DATA=true to enable).');
    console.log('\n✅ Seed completed successfully!');
    return;
  }

  console.log('\n🧪 Seeding sample data...');

  await seedRealisticSampleData(prisma);
  console.log('Realistic sample data seeded successfully');
  console.log('\nSeed completed successfully!');
  return;

  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  const makeClientNumber = (i: number) => `CL-${pad(i, 4)}`;
  const makePolicyNumber = (i: number) => `POL-2026-${pad(i, 6)}`;
  const makePaymentNumber = (i: number) => `PAY-2026-${pad(i, 6)}`;
  const makeReceiptNumber = (i: number) => `RCT-2026-${pad(i, 6)}`;
  const makeInvoiceNumber = (i: number) => `INV-2026-${pad(i, 6)}`;

  /**
   * Deterministic RFC-4122-style UUID from a seed string.
   * Sample FKs must be valid UUIDs so API validation (e.g. lead assignedToId) passes.
   */
  const sampleId = (name: string): string => {
    const h = createHash('sha256').update(`lako-agency:sample:${name}`).digest();
    const b = Buffer.allocUnsafe(16);
    h.copy(b, 0, 0, 16);
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const hex = b.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  };
  const sampleEmail = (name: string) => `${name}@seed.lako.co.ke`;
  const hashPassword = async (plain: string) => bcrypt.hash(plain, 12);
  const resolveClientName = (client: { companyName: string | null; firstName: string | null; lastName: string | null; clientNumber: string }) =>
    client.companyName ??
    ((`${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()) || `Client ${client.clientNumber}`);

  // ── Roles lookup (already seeded above) ───────────────────
  const [
    roleSales,
    roleRelationship,
    roleClaims,
    roleFinance,
  ] = await Promise.all([
    prisma.role.findUnique({ where: { name: 'SalesAgent' } }),
    prisma.role.findUnique({ where: { name: 'RelationshipManager' } }),
    prisma.role.findUnique({ where: { name: 'ClaimsOfficer' } }),
    prisma.role.findUnique({ where: { name: 'FinanceManager' } }),
  ]);

  if (!roleSales || !roleRelationship || !roleClaims || !roleFinance) {
    throw new Error('Required roles not found (SalesAgent/RelationshipManager/ClaimsOfficer/FinanceManager). Ensure baseline seed runs first.');
  }

  // ─────────────────────────────────────────────────────────
  // 1) Sample users (4) + roles
  // ─────────────────────────────────────────────────────────
  const samplePassword = process.env.SEED_SAMPLE_PASSWORD ?? 'Seed@1234!';
  const samplePasswordHash = await hashPassword(samplePassword);

  const sampleUsers = [
    {
      id: sampleId('user-sales'),
      email: sampleEmail('sales'),
      firstName: 'Amina',
      lastName: 'Sales',
      phone: '+254700111001',
      roleId: roleSales.id,
    },
    {
      id: sampleId('user-relationship'),
      email: sampleEmail('staff'),
      firstName: 'Brian',
      lastName: 'Staff',
      phone: '+254700111002',
      roleId: roleRelationship.id,
    },
    {
      id: sampleId('user-claims'),
      email: sampleEmail('claims'),
      firstName: 'Cynthia',
      lastName: 'Claims',
      phone: '+254700111003',
      roleId: roleClaims.id,
    },
    {
      id: sampleId('user-finance'),
      email: sampleEmail('finance'),
      firstName: 'David',
      lastName: 'Finance',
      phone: '+254700111004',
      roleId: roleFinance.id,
    },
  ] as const;

  for (const u of sampleUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        isActive: true,
        password: samplePasswordHash,
      },
      create: {
        id: u.id,
        email: u.email,
        password: samplePasswordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        isActive: true,
      },
    });

    const user = await prisma.user.findUnique({ where: { email: u.email } });
    if (!user) throw new Error(`Failed to upsert sample user ${u.email}`);

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: u.roleId } },
      update: {},
      create: { userId: user.id, roleId: u.roleId, assignedBy: 'seed' },
    });
  }

  const [salesUser, relationshipUser, claimsUser, financeUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: sampleEmail('sales') } }),
    prisma.user.findUnique({ where: { email: sampleEmail('staff') } }),
    prisma.user.findUnique({ where: { email: sampleEmail('claims') } }),
    prisma.user.findUnique({ where: { email: sampleEmail('finance') } }),
  ]);
  if (!salesUser || !relationshipUser || !claimsUser || !financeUser) {
    throw new Error('Failed to load sample users after upsert.');
  }

  // ─────────────────────────────────────────────────────────
  // 2) Agents (2) - used by policies/commissions
  // ─────────────────────────────────────────────────────────
  const agents = [
    {
      id: sampleId('agent-001'),
      agentNumber: 'AG-0001',
      agentCode: 'AG001',
      type: 'INTERNAL' as const,
      firstName: 'Ian',
      lastName: 'Agent',
      email: 'ian.agent@lako.co.ke',
      phone: '+254700222001',
      userId: salesUser.id,
      defaultCommissionRate: '0.1000',
      withholdingTaxRate: '0.0500',
      notes: `${SEED_TAG} Internal agent`,
    },
    {
      id: sampleId('agent-002'),
      agentNumber: 'AG-0002',
      agentCode: 'AG002',
      type: 'EXTERNAL' as const,
      companyName: 'Mtaa Insurance Partners',
      email: 'partners@mtaa.co.ke',
      phone: '+254700222002',
      defaultCommissionRate: '0.0800',
      withholdingTaxRate: '0.0500',
      notes: `${SEED_TAG} External agent`,
    },
  ] as const;

  for (const a of agents) {
    await prisma.agent.upsert({
      where: { agentNumber: a.agentNumber },
      update: {
        agentCode: a.agentCode,
        type: a.type as any,
        firstName: (a as any).firstName ?? null,
        lastName: (a as any).lastName ?? null,
        companyName: (a as any).companyName ?? null,
        email: a.email,
        phone: a.phone,
        userId: (a as any).userId ?? null,
        defaultCommissionRate: a.defaultCommissionRate as any,
        withholdingTaxRate: a.withholdingTaxRate as any,
        notes: a.notes,
        status: 'ACTIVE' as any,
      },
      create: {
        id: a.id,
        agentNumber: a.agentNumber,
        agentCode: a.agentCode,
        type: a.type as any,
        firstName: (a as any).firstName ?? null,
        lastName: (a as any).lastName ?? null,
        companyName: (a as any).companyName ?? null,
        email: a.email,
        phone: a.phone,
        userId: (a as any).userId ?? null,
        defaultCommissionRate: a.defaultCommissionRate as any,
        withholdingTaxRate: a.withholdingTaxRate as any,
        notes: a.notes,
        status: 'ACTIVE' as any,
      },
    });
  }

  const [agent1, agent2] = await Promise.all([
    prisma.agent.findUnique({ where: { agentNumber: 'AG-0001' } }),
    prisma.agent.findUnique({ where: { agentNumber: 'AG-0002' } }),
  ]);
  if (!agent1 || !agent2) throw new Error('Failed to upsert sample agents');

  // ─────────────────────────────────────────────────────────
  // 3) Insurers (8) + contacts
  // ─────────────────────────────────────────────────────────
  const insurers: Array<{
    id: string;
    name: string;
    shortName?: string;
    iraLicenseNumber: string;
    phone: string;
    email: string;
    county: string;
  }> = [
    { id: sampleId('insurer-jubilee'), name: 'Jubilee Insurance', shortName: 'Jubilee', iraLicenseNumber: 'IRA-JUB-001', phone: '+254711000001', email: 'info@jubilee.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-britam'), name: 'Britam', shortName: 'Britam', iraLicenseNumber: 'IRA-BRT-002', phone: '+254711000002', email: 'info@britam.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-apa'), name: 'APA Insurance', shortName: 'APA', iraLicenseNumber: 'IRA-APA-003', phone: '+254711000003', email: 'info@apa.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-cic'), name: 'CIC Insurance Group', shortName: 'CIC', iraLicenseNumber: 'IRA-CIC-004', phone: '+254711000004', email: 'info@cic.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-icea'), name: 'ICEA LION', shortName: 'ICEA', iraLicenseNumber: 'IRA-ICE-005', phone: '+254711000005', email: 'info@icealion.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-oldmutual'), name: 'Old Mutual Kenya', shortName: 'OldMutual', iraLicenseNumber: 'IRA-OMK-006', phone: '+254711000006', email: 'info@oldmutual.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-heritage'), name: 'Heritage Insurance', shortName: 'Heritage', iraLicenseNumber: 'IRA-HER-007', phone: '+254711000007', email: 'info@heritage.co.ke', county: 'Nairobi' },
    { id: sampleId('insurer-ga'), name: 'GA Insurance', shortName: 'GA', iraLicenseNumber: 'IRA-GAI-008', phone: '+254711000008', email: 'info@gainsurance.co.ke', county: 'Nairobi' },
  ];

  for (const ins of insurers) {
    await prisma.insurer.upsert({
      where: { id: ins.id },
      update: {
        name: ins.name,
        shortName: ins.shortName,
        iraLicenseNumber: ins.iraLicenseNumber,
        phone: ins.phone,
        email: ins.email,
        county: ins.county,
        status: 'ACTIVE',
        notes: `${SEED_TAG} sample insurer`,
        createdById: financeUser.id,
        iraClassifications: ['MOTOR_PRIVATE', 'MEDICAL_COMPREHENSIVE', 'FIRE_DOMESTIC'] as any,
      },
      create: {
        id: ins.id,
        name: ins.name,
        shortName: ins.shortName,
        iraLicenseNumber: ins.iraLicenseNumber,
        phone: ins.phone,
        email: ins.email,
        county: ins.county,
        status: 'ACTIVE',
        notes: `${SEED_TAG} sample insurer`,
        createdById: financeUser.id,
        iraClassifications: ['MOTOR_PRIVATE', 'MEDICAL_COMPREHENSIVE', 'FIRE_DOMESTIC'] as any,
      },
    });

    const contactId = sampleId(`insurer-contact-${ins.shortName?.toLowerCase() ?? ins.name.toLowerCase()}`);
    await prisma.insurerContact.upsert({
      where: { id: contactId },
      update: {
        insurerId: ins.id,
        name: `${ins.shortName ?? ins.name} Underwriting Desk`,
        email: `uw@${(ins.shortName ?? ins.name).toLowerCase().replace(/\s+/g, '')}.co.ke`,
        phone: '+254700333001',
        isPrimary: true,
        notes: SEED_TAG,
      },
      create: {
        id: contactId,
        insurerId: ins.id,
        name: `${ins.shortName ?? ins.name} Underwriting Desk`,
        email: `uw@${(ins.shortName ?? ins.name).toLowerCase().replace(/\s+/g, '')}.co.ke`,
        phone: '+254700333001',
        isPrimary: true,
        notes: SEED_TAG,
      },
    });
  }

  const insurerRows = await prisma.insurer.findMany({ where: { id: { in: insurers.map((i) => i.id) } } });
  if (insurerRows.length !== insurers.length) throw new Error('Failed to seed insurers');

  // ─────────────────────────────────────────────────────────
  // 4) Products (12) + versions + commission rules
  // ─────────────────────────────────────────────────────────
  const insurerById = new Map(insurerRows.map((i) => [i.id, i]));
  const pickInsurerId = (i: number) => insurers[i % insurers.length].id;

  const products = Array.from({ length: 12 }).map((_, idx) => {
    const insurerId = pickInsurerId(idx);
    const code = `PRD-${pad(idx + 1, 3)}`;
    const insuranceClass = (idx % 3 === 0
      ? 'MOTOR_PRIVATE'
      : idx % 3 === 1
        ? 'MEDICAL_COMPREHENSIVE'
        : 'FIRE_DOMESTIC') as any;
    const name =
      insuranceClass === 'MOTOR_PRIVATE'
        ? `Motor Comprehensive ${code}`
        : insuranceClass === 'MEDICAL_COMPREHENSIVE'
          ? `Medical Cover ${code}`
          : `Home & Property ${code}`;

    return {
      id: sampleId(`product-${code.toLowerCase()}`),
      insurerId,
      code,
      name,
      insuranceClass,
      category: insuranceClass === 'MOTOR_PRIVATE' ? 'Motor' : insuranceClass === 'MEDICAL_COMPREHENSIVE' ? 'Medical' : 'Property',
      subcategory: insuranceClass === 'MOTOR_PRIVATE' ? 'Comprehensive' : insuranceClass === 'MEDICAL_COMPREHENSIVE' ? 'Comprehensive' : 'Fire',
      description: `${SEED_TAG} sample product`,
      eligibleClientTypes: ['INDIVIDUAL', 'CORPORATE'] as any,
      policyDurations: ['12 months'] as string[],
      paymentOptions: ['ANNUAL', 'MONTHLY'] as any,
      requiredDocuments: ['National ID', 'KRA PIN'] as any,
      createdById: relationshipUser.id,
    };
  });

  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {
        insurerId: p.insurerId,
        name: p.name,
        insuranceClass: p.insuranceClass,
        category: p.category,
        subcategory: p.subcategory,
        description: p.description,
        eligibleClientTypes: p.eligibleClientTypes,
        policyDurations: p.policyDurations,
        paymentOptions: p.paymentOptions,
        requiredDocuments: p.requiredDocuments,
        status: 'ACTIVE',
        createdById: p.createdById,
      },
      create: {
        id: p.id,
        insurerId: p.insurerId,
        code: p.code,
        name: p.name,
        insuranceClass: p.insuranceClass,
        category: p.category,
        subcategory: p.subcategory,
        description: p.description,
        eligibleClientTypes: p.eligibleClientTypes,
        policyDurations: p.policyDurations,
        paymentOptions: p.paymentOptions,
        requiredDocuments: p.requiredDocuments,
        status: 'ACTIVE',
        createdById: p.createdById,
      },
    });

    // Resolve actual PK: upsert matches on `code`; existing DB rows may still have pre-UUID ids.
    const productRow = await prisma.product.findUniqueOrThrow({ where: { code: p.code } });
    const productDbId = productRow.id;

    const versionId = sampleId(`product-version-${p.code.toLowerCase()}`);
    // Upsert on (productId, versionNumber): DB may already have v1.0 with a different id after product PK/code reconciliation.
    await prisma.productVersion.upsert({
      where: {
        productId_versionNumber: { productId: productDbId, versionNumber: 'v1.0' },
      },
      update: {
        effectiveDate: daysFromNow(-365),
        terms: `${SEED_TAG} Standard terms`,
        exclusions: `${SEED_TAG} Standard exclusions`,
        claimsProcess: `${SEED_TAG} Standard claims process`,
        isActive: true,
      },
      create: {
        id: versionId,
        productId: productDbId,
        versionNumber: 'v1.0',
        effectiveDate: daysFromNow(-365),
        terms: `${SEED_TAG} Standard terms`,
        exclusions: `${SEED_TAG} Standard exclusions`,
        claimsProcess: `${SEED_TAG} Standard claims process`,
        isActive: true,
      },
    });

    const ruleId = sampleId(`commission-rule-${p.code.toLowerCase()}`);
    await prisma.commissionRule.upsert({
      where: { id: ruleId },
      update: {
        productId: productDbId,
        insurerId: p.insurerId,
        commissionType: 'FIRST_YEAR' as any,
        rate: '0.1000' as any,
        calculationBasis: 'GROSS_PREMIUM' as any,
        effectiveFrom: daysFromNow(-365),
        effectiveTo: null,
        isActive: true,
        notes: `${SEED_TAG} 10% gross premium`,
      },
      create: {
        id: ruleId,
        productId: productDbId,
        insurerId: p.insurerId,
        commissionType: 'FIRST_YEAR' as any,
        rate: '0.1000' as any,
        calculationBasis: 'GROSS_PREMIUM' as any,
        effectiveFrom: daysFromNow(-365),
        effectiveTo: null,
        isActive: true,
        notes: `${SEED_TAG} 10% gross premium`,
      },
    });
  }

  const productRows = await prisma.product.findMany({ where: { code: { in: products.map((p) => p.code) } } });
  if (productRows.length !== products.length) throw new Error('Failed to seed products');

  // ─────────────────────────────────────────────────────────
  // 5) Leads (18) across UI pipeline stages
  //    NEW, PROPOSAL_SENT, NEGOTIATING, WON (4 stages)
  // ─────────────────────────────────────────────────────────
  const leadStages = ['NEW', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON'] as const;
  const leadStageForIndex = (i: number) => leadStages[i % leadStages.length];
  const leadAssigneeForIndex = (i: number) =>
    i % 4 === 0 ? salesUser.id : i % 4 === 1 ? relationshipUser.id : i % 4 === 2 ? claimsUser.id : financeUser.id;

  for (let i = 1; i <= 18; i++) {
    const id = sampleId(`lead-${pad(i, 3)}`);
    const status = leadStageForIndex(i - 1);
    const assignedToId = leadAssigneeForIndex(i - 1);
    const expectedPremium = (50000 + i * 2500).toFixed(2);
    await prisma.lead.upsert({
      where: { id },
      update: {
        name: `Lead ${pad(i, 2)}`,
        email: `lead${pad(i, 2)}@example.com`,
        phone: `+25470188${pad(i, 2)}`,
        companyName: i % 3 === 0 ? `Acme Kenya ${i} Ltd` : null,
        leadType: (i % 3 === 0 ? 'CORPORATE' : 'INDIVIDUAL') as any,
        source: 'Seed',
        sourceDetail: `${SEED_TAG} batch=sample`,
        status: status as any,
        priority: (i % 3 === 0 ? 'HOT' : i % 3 === 1 ? 'WARM' : 'COLD') as any,
        productsOfInterest: [products[(i - 1) % products.length].name] as any,
        expectedPremium: expectedPremium as any,
        assignedToId,
        notes: `${SEED_TAG} lead notes`,
        nextFollowUp: daysFromNow((i % 10) + 1),
        createdById: salesUser.id,
        lostReason: null,
        lostAt: null,
      },
      create: {
        id,
        name: `Lead ${pad(i, 2)}`,
        email: `lead${pad(i, 2)}@example.com`,
        phone: `+25470188${pad(i, 2)}`,
        companyName: i % 3 === 0 ? `Acme Kenya ${i} Ltd` : null,
        leadType: (i % 3 === 0 ? 'CORPORATE' : 'INDIVIDUAL') as any,
        source: 'Seed',
        sourceDetail: `${SEED_TAG} batch=sample`,
        status: status as any,
        priority: (i % 3 === 0 ? 'HOT' : i % 3 === 1 ? 'WARM' : 'COLD') as any,
        productsOfInterest: [products[(i - 1) % products.length].name] as any,
        expectedPremium: expectedPremium as any,
        assignedToId,
        notes: `${SEED_TAG} lead notes`,
        nextFollowUp: daysFromNow((i % 10) + 1),
        createdById: salesUser.id,
      },
    });
  }

  // ─────────────────────────────────────────────────────────
  // 6) Clients (15) + contacts
  // ─────────────────────────────────────────────────────────
  const counties = ['Nairobi', 'Kiambu', 'Mombasa', 'Nakuru', 'Kisumu', 'Uasin Gishu', 'Machakos', 'Nyeri'] as const;
  for (let i = 1; i <= 15; i++) {
    const id = sampleId(`client-${pad(i, 3)}`);
    const isCorporate = i % 5 === 0;
    const clientNumber = makeClientNumber(i);
    const email = isCorporate ? `accounts${i}@sampleco.ke` : `client${i}@example.com`;
    const phone = `+25471244${pad(i, 2)}`;
    await prisma.client.upsert({
      where: { clientNumber },
      update: {
        type: (isCorporate ? 'CORPORATE' : 'INDIVIDUAL') as any,
        firstName: isCorporate ? null : `Client${i}`,
        lastName: isCorporate ? null : 'Sample',
        companyName: isCorporate ? `Sample Company ${i} Ltd` : null,
        registrationNumber: isCorporate ? `CPR/${pad(1000 + i, 4)}` : null,
        email,
        phone,
        county: counties[(i - 1) % counties.length],
        physicalAddress: `${SEED_TAG} Nairobi CBD, Building ${i}`,
        kraPin: `A${pad(1234500 + i, 7)}Z`,
        relationshipManagerId: relationshipUser.id,
        marketingOptIn: i % 2 === 0,
        preferredLanguage: 'en',
        createdById: relationshipUser.id,
      },
      create: {
        id,
        clientNumber,
        type: (isCorporate ? 'CORPORATE' : 'INDIVIDUAL') as any,
        firstName: isCorporate ? null : `Client${i}`,
        lastName: isCorporate ? null : 'Sample',
        companyName: isCorporate ? `Sample Company ${i} Ltd` : null,
        registrationNumber: isCorporate ? `CPR/${pad(1000 + i, 4)}` : null,
        email,
        phone,
        county: counties[(i - 1) % counties.length],
        physicalAddress: `${SEED_TAG} Nairobi CBD, Building ${i}`,
        kraPin: `A${pad(1234500 + i, 7)}Z`,
        relationshipManagerId: relationshipUser.id,
        marketingOptIn: i % 2 === 0,
        preferredLanguage: 'en',
        createdById: relationshipUser.id,
      },
    });

    const contactId = sampleId(`client-contact-${pad(i, 3)}`);
    const clientRow = await prisma.client.findUnique({ where: { clientNumber } });
    if (!clientRow) throw new Error(`Failed to upsert client ${clientNumber}`);

    await prisma.clientContact.upsert({
      where: { id: contactId },
      update: {
        clientId: clientRow.id,
        name: isCorporate ? `Finance Desk ${i}` : `Client${i} Sample`,
        title: isCorporate ? 'Accounts' : null,
        department: isCorporate ? 'Finance' : null,
        email,
        phone,
        isPrimary: true,
        canAuthorize: true,
        notes: SEED_TAG,
      },
      create: {
        id: contactId,
        clientId: clientRow.id,
        name: isCorporate ? `Finance Desk ${i}` : `Client${i} Sample`,
        title: isCorporate ? 'Accounts' : null,
        department: isCorporate ? 'Finance' : null,
        email,
        phone,
        isPrimary: true,
        canAuthorize: true,
        notes: SEED_TAG,
      },
    });
  }

  const clientRows = await prisma.client.findMany({ where: { clientNumber: { in: Array.from({ length: 15 }).map((_, i) => makeClientNumber(i + 1)) } } });
  if (clientRows.length !== 15) throw new Error('Failed to seed clients');

  // ─────────────────────────────────────────────────────────
  // 7) Onboarding cases (5) + documents (connected to clients)
  // ─────────────────────────────────────────────────────────
  for (let i = 1; i <= 5; i++) {
    const client = clientRows[i - 1];
    const leadId = sampleId(`lead-${pad(i, 3)}`);
    const product = productRows[(i - 1) % productRows.length];
    const insurer = insurerById.get(product.insurerId);
    if (!insurer) throw new Error('Insurer not found for product');

    const caseId = sampleId(`onboarding-${pad(i, 3)}`);
    const caseNumber = `ONB-2026-${pad(i, 5)}`;
    await prisma.onboardingCase.upsert({
      where: { caseNumber },
      update: {
        clientId: client.id,
        leadId,
        productId: product.id,
        insurerId: insurer.id,
        clientType: client.type as any,
        status: (i % 2 === 0 ? 'UNDER_REVIEW' : 'DOCUMENTS_PENDING') as any,
        premiumEstimate: (65000 + i * 5000).toFixed(2) as any,
        riskDetails: { tag: SEED_TAG, notes: 'Initial risk notes', segment: 'Retail' },
        memberData: { tag: SEED_TAG, dependants: i % 2 === 0 ? 2 : 0 },
        reviewerId: i % 2 === 0 ? relationshipUser.id : null,
        reviewNotes: i % 2 === 0 ? `${SEED_TAG} review in progress` : null,
        submittedAt: daysFromNow(-i),
        createdById: relationshipUser.id,
      },
      create: {
        id: caseId,
        caseNumber,
        clientId: client.id,
        leadId,
        productId: product.id,
        insurerId: insurer.id,
        clientType: client.type as any,
        status: (i % 2 === 0 ? 'UNDER_REVIEW' : 'DOCUMENTS_PENDING') as any,
        premiumEstimate: (65000 + i * 5000).toFixed(2) as any,
        riskDetails: { tag: SEED_TAG, notes: 'Initial risk notes', segment: 'Retail' },
        memberData: { tag: SEED_TAG, dependants: i % 2 === 0 ? 2 : 0 },
        reviewerId: i % 2 === 0 ? relationshipUser.id : null,
        reviewNotes: i % 2 === 0 ? `${SEED_TAG} review in progress` : null,
        submittedAt: daysFromNow(-i),
        createdById: relationshipUser.id,
      },
    });

    const onboardingCaseRow = await prisma.onboardingCase.findUniqueOrThrow({ where: { caseNumber } });
    const onboardingCaseDbId = onboardingCaseRow.id;

    const docId = sampleId(`onboarding-doc-${pad(i, 3)}`);
    await prisma.onboardingDocument.upsert({
      where: { id: docId },
      update: {
        onboardingCaseId: onboardingCaseDbId,
        documentType: 'NATIONAL_ID',
        fileName: `national-id-${i}.pdf`,
        fileUrl: `https://example.com/${SEED_TAG}/national-id-${i}.pdf`,
        fileSize: 1024 * 150,
        mimeType: 'application/pdf',
        status: (i % 2 === 0 ? 'VERIFIED' : 'PENDING') as any,
        verifiedById: i % 2 === 0 ? relationshipUser.id : null,
        verifiedAt: i % 2 === 0 ? daysFromNow(-i + 1) : null,
      },
      create: {
        id: docId,
        onboardingCaseId: onboardingCaseDbId,
        documentType: 'NATIONAL_ID',
        fileName: `national-id-${i}.pdf`,
        fileUrl: `https://example.com/${SEED_TAG}/national-id-${i}.pdf`,
        fileSize: 1024 * 150,
        mimeType: 'application/pdf',
        status: (i % 2 === 0 ? 'VERIFIED' : 'PENDING') as any,
        verifiedById: i % 2 === 0 ? relationshipUser.id : null,
        verifiedAt: i % 2 === 0 ? daysFromNow(-i + 1) : null,
      },
    });
  }

  const onboardingRows = await prisma.onboardingCase.findMany({ where: { caseNumber: { startsWith: 'ONB-2026-' } } });

  // ─────────────────────────────────────────────────────────
  // 8) Policies (12) + payments + allocations + receipts + commissions
  // ─────────────────────────────────────────────────────────
  type PolicySeedSpec = {
    status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_PAYMENT';
    endDate: Date;
  };
  const policySpecs: PolicySeedSpec[] = [
    // 6 ACTIVE
    { status: 'ACTIVE', endDate: daysFromNow(180) },
    { status: 'ACTIVE', endDate: daysFromNow(210) },
    { status: 'ACTIVE', endDate: daysFromNow(240) },
    { status: 'ACTIVE', endDate: daysFromNow(270) },
    { status: 'ACTIVE', endDate: daysFromNow(300) },
    { status: 'ACTIVE', endDate: daysFromNow(330) },
    // 2 SUSPENDED
    { status: 'SUSPENDED', endDate: daysFromNow(200) },
    { status: 'SUSPENDED', endDate: daysFromNow(220) },
    // 3 pending renewals (ACTIVE but expiring within 30 days)
    { status: 'ACTIVE', endDate: daysFromNow(10) },
    { status: 'ACTIVE', endDate: daysFromNow(20) },
    { status: 'ACTIVE', endDate: daysFromNow(28) },
    // 1 PENDING_PAYMENT
    { status: 'PENDING_PAYMENT', endDate: daysFromNow(365) },
  ];

  for (let i = 1; i <= 12; i++) {
    const spec = policySpecs[i - 1];
    const id = sampleId(`policy-${pad(i, 3)}`);
    const policyNumber = makePolicyNumber(i);
    const client = clientRows[(i - 1) % clientRows.length];
    const product = productRows[(i - 1) % productRows.length];
    const insurer = insurerById.get(product.insurerId);
    if (!insurer) throw new Error('Insurer not found for policy product');

    const startDate = daysFromNow(-200);
    const endDate = spec.endDate;
    const basePremium = 80000 + i * 3500;
    const trainingLevy = basePremium * 0.0025;
    const pcifLevy = basePremium * 0.0025;
    const stampDuty = 40;
    const policyFee = 0;
    const totalPremium = basePremium + trainingLevy + pcifLevy + stampDuty + policyFee;

    const paidAmount = spec.status === 'PENDING_PAYMENT' ? 0 : totalPremium * 0.85;
    const outstandingAmount = Math.max(0, totalPremium - paidAmount);

    const onboardingCase = onboardingRows[(i - 1) % onboardingRows.length] ?? null;
    const sourceLeadId = sampleId(`lead-${pad(((i - 1) % 18) + 1, 3)}`);
    const agentId = i % 2 === 0 ? agent1.id : agent2.id;

    await prisma.policy.upsert({
      where: { policyNumber },
      update: {
        clientId: client.id,
        productId: product.id,
        insurerId: insurer.id,
        agentId,
        onboardingCaseId: onboardingCase?.id ?? null,
        sourceLeadId,
        startDate,
        endDate,
        basePremium: basePremium.toFixed(2) as any,
        trainingLevy: trainingLevy.toFixed(2) as any,
        pcifLevy: pcifLevy.toFixed(2) as any,
        stampDuty: stampDuty.toFixed(2) as any,
        policyFee: policyFee.toFixed(2) as any,
        totalPremium: totalPremium.toFixed(2) as any,
        paymentFrequency: 'ANNUAL' as any,
        paidAmount: paidAmount.toFixed(2) as any,
        outstandingAmount: outstandingAmount.toFixed(2) as any,
        premiumCollectionMode: 'BROKER_COLLECTED' as any,
        premiumPaidTo: 'BROKER' as any,
        brokerCollectedAmount: paidAmount.toFixed(2) as any,
        directToInsurerAmount: '0.00' as any,
        totalPremiumAmount: totalPremium.toFixed(2) as any,
        outstandingPremiumAmount: outstandingAmount.toFixed(2) as any,
        commissionSettlementMode: 'PAID_BY_INSURER' as any,
        insurerCommissionStatus: outstandingAmount === 0 ? ('RECEIVABLE' as any) : ('NOT_DUE' as any),
        status: spec.status as any,
        underwritingStatus: (spec.status === 'ACTIVE' ? 'APPROVED' : 'PENDING') as any,
        suspensionDate: spec.status === 'SUSPENDED' ? daysFromNow(-5) : null,
        suspensionReason: spec.status === 'SUSPENDED' ? `${SEED_TAG} premium follow-up` : null,
        notes: `${SEED_TAG} policy notes`,
        createdById: relationshipUser.id,
      },
      create: {
        id,
        policyNumber,
        clientId: client.id,
        productId: product.id,
        insurerId: insurer.id,
        agentId,
        onboardingCaseId: onboardingCase?.id ?? null,
        sourceLeadId,
        startDate,
        endDate,
        basePremium: basePremium.toFixed(2) as any,
        trainingLevy: trainingLevy.toFixed(2) as any,
        pcifLevy: pcifLevy.toFixed(2) as any,
        stampDuty: stampDuty.toFixed(2) as any,
        policyFee: policyFee.toFixed(2) as any,
        totalPremium: totalPremium.toFixed(2) as any,
        paymentFrequency: 'ANNUAL' as any,
        paidAmount: paidAmount.toFixed(2) as any,
        outstandingAmount: outstandingAmount.toFixed(2) as any,
        premiumCollectionMode: 'BROKER_COLLECTED' as any,
        premiumPaidTo: 'BROKER' as any,
        brokerCollectedAmount: paidAmount.toFixed(2) as any,
        directToInsurerAmount: '0.00' as any,
        totalPremiumAmount: totalPremium.toFixed(2) as any,
        outstandingPremiumAmount: outstandingAmount.toFixed(2) as any,
        commissionSettlementMode: 'PAID_BY_INSURER' as any,
        insurerCommissionStatus: outstandingAmount === 0 ? ('RECEIVABLE' as any) : ('NOT_DUE' as any),
        status: spec.status as any,
        underwritingStatus: (spec.status === 'ACTIVE' ? 'APPROVED' : 'PENDING') as any,
        suspensionDate: spec.status === 'SUSPENDED' ? daysFromNow(-5) : null,
        suspensionReason: spec.status === 'SUSPENDED' ? `${SEED_TAG} premium follow-up` : null,
        notes: `${SEED_TAG} policy notes`,
        createdById: relationshipUser.id,
      },
    });

    // Payments & allocations for non-pending policies
    if (paidAmount > 0) {
      const policyRow = await prisma.policy.findUniqueOrThrow({ where: { policyNumber } });
      const policyDbId = policyRow.id;

      const payId = sampleId(`payment-${pad(i, 3)}`);
      const paymentNumber = makePaymentNumber(i);
      const method = (i % 2 === 0 ? 'MPESA' : 'BANK_TRANSFER') as any;
      await prisma.payment.upsert({
        where: { paymentNumber },
        update: {
          clientId: client.id,
          amount: paidAmount.toFixed(2) as any,
          currency: 'KES',
          premiumCollectionMode: 'BROKER_COLLECTED' as any,
          premiumPaidTo: 'BROKER' as any,
          method,
          reference: `REF-${paymentNumber}`,
          transactionCode: method === 'MPESA' ? `QWE${pad(100000 + i, 6)}` : null,
          paymentDate: daysFromNow(-10 - i),
          status: 'COMPLETED' as any,
          verifiedById: financeUser.id,
          verifiedAt: daysFromNow(-9 - i),
          notes: `${SEED_TAG} payment`,
          createdById: financeUser.id,
        },
        create: {
          id: payId,
          paymentNumber,
          clientId: client.id,
          amount: paidAmount.toFixed(2) as any,
          currency: 'KES',
          premiumCollectionMode: 'BROKER_COLLECTED' as any,
          premiumPaidTo: 'BROKER' as any,
          method,
          reference: `REF-${paymentNumber}`,
          transactionCode: method === 'MPESA' ? `QWE${pad(100000 + i, 6)}` : null,
          paymentDate: daysFromNow(-10 - i),
          status: 'COMPLETED' as any,
          verifiedById: financeUser.id,
          verifiedAt: daysFromNow(-9 - i),
          notes: `${SEED_TAG} payment`,
          createdById: financeUser.id,
        },
      });

      const paymentRow = await prisma.payment.findUniqueOrThrow({ where: { paymentNumber } });
      const paymentDbId = paymentRow.id;

      const allocationId = sampleId(`allocation-${pad(i, 3)}`);
      await prisma.paymentAllocation.upsert({
        where: { id: allocationId },
        update: {
          paymentId: paymentDbId,
          policyId: policyDbId,
          amount: paidAmount.toFixed(2) as any,
          notes: `${SEED_TAG} allocation`,
          createdById: financeUser.id,
        },
        create: {
          id: allocationId,
          paymentId: paymentDbId,
          policyId: policyDbId,
          amount: paidAmount.toFixed(2) as any,
          notes: `${SEED_TAG} allocation`,
          createdById: financeUser.id,
        },
      });

      const receiptId = sampleId(`receipt-${pad(i, 3)}`);
      const receiptNumber = makeReceiptNumber(i);
      const receiptClientName = resolveClientName({
        companyName: client.companyName ?? null,
        firstName: client.firstName ?? null,
        lastName: client.lastName ?? null,
        clientNumber: client.clientNumber,
      });
      await prisma.receipt.upsert({
        where: { receiptNumber },
        update: {
          paymentId: paymentDbId,
          clientName: receiptClientName,
          clientAddress: client.physicalAddress ?? null,
          amount: paidAmount.toFixed(2) as any,
          amountInWords: `KES ${paidAmount.toFixed(0)} only`,
          particulars: `${SEED_TAG} Premium payment for ${policyNumber}`,
          issuedById: financeUser.id,
        },
        create: {
          id: receiptId,
          receiptNumber,
          paymentId: paymentDbId,
          clientName: receiptClientName,
          clientAddress: client.physicalAddress ?? null,
          amount: paidAmount.toFixed(2) as any,
          amountInWords: `KES ${paidAmount.toFixed(0)} only`,
          particulars: `${SEED_TAG} Premium payment for ${policyNumber}`,
          issuedById: financeUser.id,
        },
      });

      // Commission entry (10% of paid premium) - derived from the commission rule seeded above
      const commissionId = sampleId(`commission-${pad(i, 3)}`);
      const commissionRate = 0.10;
      const grossCommission = paidAmount * commissionRate;
      const withholdingTax = grossCommission * 0.05;
      const netCommission = grossCommission - withholdingTax;

      await prisma.commissionEntry.upsert({
        where: { id: commissionId },
        update: {
          agentId,
          policyId: policyDbId,
          insurerId: insurer.id,
          productId: product.id,
          premiumAmount: paidAmount.toFixed(2) as any,
          commissionRate: commissionRate.toFixed(4) as any,
          grossCommission: grossCommission.toFixed(2) as any,
          withholdingTax: withholdingTax.toFixed(2) as any,
          otherDeductions: '0.00' as any,
          netCommission: netCommission.toFixed(2) as any,
          commissionType: 'FIRST_YEAR' as any,
          commissionSource: 'BROKER_COLLECTED_PREMIUM' as any,
          paymentCollectionMode: 'BROKER_COLLECTED' as any,
          settlementMode: 'PAID_BY_INSURER' as any,
          insurerCommissionStatus: 'RECEIVABLE' as any,
          commissionReceivableAmount: netCommission.toFixed(2) as any,
          commissionReceivedAmount: '0.00' as any,
          status: 'CALCULATED' as any,
          earnedDate: daysFromNow(-8 - i),
          notes: `${SEED_TAG} commission derived from payment`,
        },
        create: {
          id: commissionId,
          agentId,
          policyId: policyDbId,
          insurerId: insurer.id,
          productId: product.id,
          premiumAmount: paidAmount.toFixed(2) as any,
          commissionRate: commissionRate.toFixed(4) as any,
          grossCommission: grossCommission.toFixed(2) as any,
          withholdingTax: withholdingTax.toFixed(2) as any,
          otherDeductions: '0.00' as any,
          netCommission: netCommission.toFixed(2) as any,
          commissionType: 'FIRST_YEAR' as any,
          commissionSource: 'BROKER_COLLECTED_PREMIUM' as any,
          paymentCollectionMode: 'BROKER_COLLECTED' as any,
          settlementMode: 'PAID_BY_INSURER' as any,
          insurerCommissionStatus: 'RECEIVABLE' as any,
          commissionReceivableAmount: netCommission.toFixed(2) as any,
          commissionReceivedAmount: '0.00' as any,
          status: 'CALCULATED' as any,
          earnedDate: daysFromNow(-8 - i),
          notes: `${SEED_TAG} commission derived from payment`,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Explicit connected payment mode scenarios for workflow demos.
  const corporateDirectPolicy = await prisma.policy.findUnique({ where: { policyNumber: makePolicyNumber(2) }, include: { client: true, insurer: true } });
  if (corporateDirectPolicy) {
    const directAmount = Number(corporateDirectPolicy.totalPremium);
    const proofId = sampleId('document-direct-insurer-proof');
    await prisma.document.upsert({
      where: { id: proofId },
      update: {
        entityType: 'POLICY',
        entityId: corporateDirectPolicy.id,
        relatedEntityType: 'DIRECT_INSURER_PAYMENT_STAGED',
        relatedEntityId: corporateDirectPolicy.id,
        clientId: corporateDirectPolicy.clientId,
        policyId: corporateDirectPolicy.id,
        insurerId: corporateDirectPolicy.insurerId,
        type: 'PROOF_OF_PAYMENT',
        documentType: 'PROOF_OF_PAYMENT',
        category: 'PAYMENTS',
        name: 'direct-insurer-bank-slip.pdf',
        title: 'Direct insurer bank slip',
        fileName: 'direct-insurer-bank-slip.pdf',
        originalFileName: 'direct-insurer-bank-slip.pdf',
        fileUrl: `https://example.com/${SEED_TAG}/direct-insurer-bank-slip.pdf`,
        storageKey: `${SEED_TAG}/payments/direct-insurer-bank-slip.pdf`,
        checksum: createHash('sha256').update(proofId).digest('hex'),
        fileSize: 1024 * 180,
        mimeType: 'application/pdf',
        status: 'VERIFIED' as any,
        visibility: 'INTERNAL' as any,
        sourceModule: 'payments',
        isVerified: true,
        verifiedById: financeUser.id,
        verifiedAt: daysFromNow(-7),
        tags: ['direct-insurer-payment', 'proof'],
        uploadedById: financeUser.id,
        createdById: financeUser.id,
      },
      create: {
        id: proofId,
        entityType: 'POLICY',
        entityId: corporateDirectPolicy.id,
        relatedEntityType: 'DIRECT_INSURER_PAYMENT_STAGED',
        relatedEntityId: corporateDirectPolicy.id,
        clientId: corporateDirectPolicy.clientId,
        policyId: corporateDirectPolicy.id,
        insurerId: corporateDirectPolicy.insurerId,
        type: 'PROOF_OF_PAYMENT',
        documentType: 'PROOF_OF_PAYMENT',
        category: 'PAYMENTS',
        name: 'direct-insurer-bank-slip.pdf',
        title: 'Direct insurer bank slip',
        fileName: 'direct-insurer-bank-slip.pdf',
        originalFileName: 'direct-insurer-bank-slip.pdf',
        fileUrl: `https://example.com/${SEED_TAG}/direct-insurer-bank-slip.pdf`,
        storageKey: `${SEED_TAG}/payments/direct-insurer-bank-slip.pdf`,
        checksum: createHash('sha256').update(proofId).digest('hex'),
        fileSize: 1024 * 180,
        mimeType: 'application/pdf',
        status: 'VERIFIED' as any,
        visibility: 'INTERNAL' as any,
        sourceModule: 'payments',
        isVerified: true,
        verifiedById: financeUser.id,
        verifiedAt: daysFromNow(-7),
        tags: ['direct-insurer-payment', 'proof'],
        uploadedById: financeUser.id,
        createdById: financeUser.id,
      },
    });
    await prisma.policy.update({
      where: { id: corporateDirectPolicy.id },
      data: {
        premiumCollectionMode: 'DIRECT_TO_INSURER' as any,
        premiumPaidTo: 'INSURER' as any,
        paidAmount: directAmount.toFixed(2) as any,
        outstandingAmount: '0.00' as any,
        brokerCollectedAmount: '0.00' as any,
        directToInsurerAmount: directAmount.toFixed(2) as any,
        totalPremiumAmount: directAmount.toFixed(2) as any,
        outstandingPremiumAmount: '0.00' as any,
        paymentVerificationStatus: 'VERIFIED' as any,
        commissionSettlementMode: 'PAID_BY_INSURER' as any,
        insurerCommissionStatus: 'RECEIVABLE' as any,
      },
    });
    await prisma.directInsurerPayment.upsert({
      where: { id: sampleId('direct-payment-corporate-medical') },
      update: {
        policyId: corporateDirectPolicy.id,
        clientId: corporateDirectPolicy.clientId,
        insurerId: corporateDirectPolicy.insurerId,
        amount: directAmount.toFixed(2) as any,
        paymentDate: daysFromNow(-7),
        method: 'BANK_TRANSFER' as any,
        insurerReference: 'DTI-SEED-001',
        proofOfPaymentDocumentId: proofId,
        verificationStatus: 'VERIFIED' as any,
        verifiedById: financeUser.id,
        verifiedAt: daysFromNow(-6),
        createdById: financeUser.id,
      },
      create: {
        id: sampleId('direct-payment-corporate-medical'),
        acknowledgementNumber: 'ACK-2026-900001',
        policyId: corporateDirectPolicy.id,
        clientId: corporateDirectPolicy.clientId,
        insurerId: corporateDirectPolicy.insurerId,
        amount: directAmount.toFixed(2) as any,
        paymentDate: daysFromNow(-7),
        method: 'BANK_TRANSFER' as any,
        insurerReference: 'DTI-SEED-001',
        proofOfPaymentDocumentId: proofId,
        verificationStatus: 'VERIFIED' as any,
        verifiedById: financeUser.id,
        verifiedAt: daysFromNow(-6),
        createdById: financeUser.id,
      },
    });
  }

  const mixedPaymentPolicy = await prisma.policy.findUnique({ where: { policyNumber: makePolicyNumber(3) } });
  if (mixedPaymentPolicy) {
    const total = Number(mixedPaymentPolicy.totalPremium);
    const brokerPortion = Math.round(total * 0.55);
    const directPortion = total - brokerPortion;
    await prisma.policy.update({
      where: { id: mixedPaymentPolicy.id },
      data: {
        premiumCollectionMode: 'MIXED' as any,
        premiumPaidTo: 'BOTH' as any,
        paidAmount: total.toFixed(2) as any,
        outstandingAmount: '0.00' as any,
        brokerCollectedAmount: brokerPortion.toFixed(2) as any,
        directToInsurerAmount: directPortion.toFixed(2) as any,
        totalPremiumAmount: total.toFixed(2) as any,
        outstandingPremiumAmount: '0.00' as any,
        paymentVerificationStatus: 'VERIFIED' as any,
      },
    });
    await prisma.directInsurerPayment.upsert({
      where: { id: sampleId('direct-payment-sme-mixed') },
      update: {
        policyId: mixedPaymentPolicy.id,
        clientId: mixedPaymentPolicy.clientId,
        insurerId: mixedPaymentPolicy.insurerId,
        amount: directPortion.toFixed(2) as any,
        paymentDate: daysFromNow(-5),
        method: 'BANK_TRANSFER' as any,
        insurerReference: 'MIX-DTI-SEED-001',
        verificationStatus: 'VERIFIED' as any,
        verifiedById: financeUser.id,
        verifiedAt: daysFromNow(-4),
        createdById: financeUser.id,
      },
      create: {
        id: sampleId('direct-payment-sme-mixed'),
        acknowledgementNumber: 'ACK-2026-900002',
        policyId: mixedPaymentPolicy.id,
        clientId: mixedPaymentPolicy.clientId,
        insurerId: mixedPaymentPolicy.insurerId,
        amount: directPortion.toFixed(2) as any,
        paymentDate: daysFromNow(-5),
        method: 'BANK_TRANSFER' as any,
        insurerReference: 'MIX-DTI-SEED-001',
        verificationStatus: 'VERIFIED' as any,
        verifiedById: financeUser.id,
        verifiedAt: daysFromNow(-4),
        createdById: financeUser.id,
      },
    });
  }

  // 9) Claims (4) connected to policies/clients/products/insurers
  // ─────────────────────────────────────────────────────────
  const policyRows = await prisma.policy.findMany({ where: { policyNumber: { startsWith: 'POL-2026-' } } });
  const claimStatuses = ['REGISTERED', 'UNDER_REVIEW', 'SETTLEMENT_PENDING', 'SETTLED'] as const;
  for (let i = 1; i <= 4; i++) {
    const policy = policyRows[i - 1];
    if (!policy) throw new Error('Not enough policies for claims');
    const client = await prisma.client.findUnique({ where: { id: policy.clientId } });
    if (!client) throw new Error('Client not found for claim policy');
    const product = await prisma.product.findUnique({ where: { id: policy.productId } });
    if (!product) throw new Error('Product not found for claim policy');
    const insurer = await prisma.insurer.findUnique({ where: { id: policy.insurerId } });
    if (!insurer) throw new Error('Insurer not found for claim policy');

    const claimId = sampleId(`claim-${pad(i, 3)}`);
    const claimNumber = `CLM-2026-${pad(i, 6)}`;
    const status = claimStatuses[i - 1];
    const claimed = 250000 + i * 50000;
    const approved = status === 'SETTLED' ? claimed * 0.85 : status === 'SETTLEMENT_PENDING' ? claimed * 0.8 : null;
    const paid = status === 'SETTLED' ? (approved ?? 0) : 0;

    const claimantName = resolveClientName({
      companyName: client.companyName ?? null,
      firstName: client.firstName ?? null,
      lastName: client.lastName ?? null,
      clientNumber: client.clientNumber,
    });
    await prisma.claim.upsert({
      where: { claimNumber },
      update: {
        policyId: policy.id,
        clientId: client.id,
        insurerId: insurer.id,
        productId: product.id,
        claimantName,
        claimantPhone: client.phone ?? null,
        claimantEmail: client.email ?? null,
        claimantRelationship: 'Policyholder',
        dateOfLoss: daysFromNow(-30 - i),
        dateReported: daysFromNow(-28 - i),
        lossType: product.insuranceClass === ('MOTOR_PRIVATE' as any) ? 'ACCIDENT' : 'INCIDENT',
        lossCategory: product.insuranceClass === ('MOTOR_PRIVATE' as any) ? 'MOTOR_ACCIDENT' : 'GENERAL',
        lossDescription: `${SEED_TAG} sample claim incident`,
        lossLocation: 'Nairobi',
        amountClaimed: claimed.toFixed(2) as any,
        amountAssessed: approved ? (approved * 0.95).toFixed(2) as any : null,
        amountApproved: approved ? approved.toFixed(2) as any : null,
        amountPaid: paid.toFixed(2) as any,
        status: status as any,
        ownerId: claimsUser.id,
        notes: `${SEED_TAG} claim notes`,
        submittedToInsurerAt: status === 'UNDER_REVIEW' || status === 'SETTLEMENT_PENDING' || status === 'SETTLED' ? daysFromNow(-20) : null,
        approvedAt: status === 'SETTLEMENT_PENDING' || status === 'SETTLED' ? daysFromNow(-10) : null,
        settledAt: status === 'SETTLED' ? daysFromNow(-2) : null,
        createdById: claimsUser.id,
      },
      create: {
        id: claimId,
        claimNumber,
        policyId: policy.id,
        clientId: client.id,
        insurerId: insurer.id,
        productId: product.id,
        claimantName,
        claimantPhone: client.phone ?? null,
        claimantEmail: client.email ?? null,
        claimantRelationship: 'Policyholder',
        dateOfLoss: daysFromNow(-30 - i),
        dateReported: daysFromNow(-28 - i),
        lossType: product.insuranceClass === ('MOTOR_PRIVATE' as any) ? 'ACCIDENT' : 'INCIDENT',
        lossCategory: product.insuranceClass === ('MOTOR_PRIVATE' as any) ? 'MOTOR_ACCIDENT' : 'GENERAL',
        lossDescription: `${SEED_TAG} sample claim incident`,
        lossLocation: 'Nairobi',
        amountClaimed: claimed.toFixed(2) as any,
        amountAssessed: approved ? (approved * 0.95).toFixed(2) as any : null,
        amountApproved: approved ? approved.toFixed(2) as any : null,
        amountPaid: paid.toFixed(2) as any,
        status: status as any,
        ownerId: claimsUser.id,
        notes: `${SEED_TAG} claim notes`,
        submittedToInsurerAt: status === 'UNDER_REVIEW' || status === 'SETTLEMENT_PENDING' || status === 'SETTLED' ? daysFromNow(-20) : null,
        approvedAt: status === 'SETTLEMENT_PENDING' || status === 'SETTLED' ? daysFromNow(-10) : null,
        settledAt: status === 'SETTLED' ? daysFromNow(-2) : null,
        createdById: claimsUser.id,
      },
    });

    const claimRow = await prisma.claim.findUniqueOrThrow({ where: { claimNumber } });
    const claimDbId = claimRow.id;

    const docId = sampleId(`claim-doc-${pad(i, 3)}`);
    await prisma.claimDocument.upsert({
      where: { id: docId },
      update: {
        claimId: claimDbId,
        type: 'CLAIM_FORM',
        name: `claim-form-${i}.pdf`,
        fileUrl: `https://example.com/${SEED_TAG}/claim-form-${i}.pdf`,
        fileSize: 1024 * 200,
        mimeType: 'application/pdf',
        status: (status === 'SETTLED' ? 'VERIFIED' : 'PENDING') as any,
        uploadedById: claimsUser.id,
        verifiedById: status === 'SETTLED' ? claimsUser.id : null,
        verifiedAt: status === 'SETTLED' ? daysFromNow(-3) : null,
        notes: SEED_TAG,
      },
      create: {
        id: docId,
        claimId: claimDbId,
        type: 'CLAIM_FORM',
        name: `claim-form-${i}.pdf`,
        fileUrl: `https://example.com/${SEED_TAG}/claim-form-${i}.pdf`,
        fileSize: 1024 * 200,
        mimeType: 'application/pdf',
        status: (status === 'SETTLED' ? 'VERIFIED' : 'PENDING') as any,
        uploadedById: claimsUser.id,
        verifiedById: status === 'SETTLED' ? claimsUser.id : null,
        verifiedAt: status === 'SETTLED' ? daysFromNow(-3) : null,
        notes: SEED_TAG,
      },
    });

    const historyId = sampleId(`claim-history-${pad(i, 3)}`);
    await prisma.claimStatusHistory.upsert({
      where: { id: historyId },
      update: {
        claimId: claimDbId,
        fromStatus: 'REPORTED' as any,
        toStatus: status as any,
        reason: `${SEED_TAG} status seeded`,
        changedById: claimsUser.id,
        metadata: { tag: SEED_TAG },
      },
      create: {
        id: historyId,
        claimId: claimDbId,
        fromStatus: 'REPORTED' as any,
        toStatus: status as any,
        reason: `${SEED_TAG} status seeded`,
        changedById: claimsUser.id,
        metadata: { tag: SEED_TAG },
      },
    });

    if (i === 2) {
      const queryId = sampleId('claim-query-insurer-awaiting-client');
      await prisma.claimQuery.upsert({
        where: { id: queryId },
        update: {
          claimId: claimDbId,
          source: 'INSURER' as any,
          querySource: 'INSURER' as any,
          queryType: 'DOCUMENT_REQUEST' as any,
          queryText: 'Insurer requests police abstract and repair estimate before liability review.',
          requestedBy: 'Jubilee Claims Desk',
          raisedByName: 'Jubilee Claims Desk',
          raisedByExternalParty: insurer.name,
          dueDate: daysFromNow(2),
          priority: 'HIGH' as any,
          status: 'CLIENT_RESPONSE_PENDING' as any,
          insurerReference: `INS-Q-${pad(i, 4)}`,
          assignedToId: claimsUser.id,
          createdById: claimsUser.id,
        },
        create: {
          id: queryId,
          claimId: claimDbId,
          source: 'INSURER' as any,
          querySource: 'INSURER' as any,
          queryType: 'DOCUMENT_REQUEST' as any,
          queryText: 'Insurer requests police abstract and repair estimate before liability review.',
          requestedBy: 'Jubilee Claims Desk',
          raisedByName: 'Jubilee Claims Desk',
          raisedByExternalParty: insurer.name,
          dueDate: daysFromNow(2),
          priority: 'HIGH' as any,
          status: 'CLIENT_RESPONSE_PENDING' as any,
          insurerReference: `INS-Q-${pad(i, 4)}`,
          assignedToId: claimsUser.id,
          createdById: claimsUser.id,
        },
      });

      const queryTaskId = sampleId('task-claim-query-awaiting-client');
      await prisma.task.upsert({
        where: { id: queryTaskId },
        update: {
          title: 'Collect police abstract for insurer query',
          description: 'Client must share police abstract and repair estimate for insurer claim review.',
          category: 'CLAIM_QUERY',
          dueDate: daysFromNow(2),
          priority: 'HIGH' as any,
          status: 'IN_PROGRESS' as any,
          clientId: client.id,
          policyId: policy.id,
          claimId: claimDbId,
          claimQueryId: queryId,
          insurerId: insurer.id,
          assignedToId: claimsUser.id,
          createdById: claimsUser.id,
        },
        create: {
          id: queryTaskId,
          title: 'Collect police abstract for insurer query',
          description: 'Client must share police abstract and repair estimate for insurer claim review.',
          category: 'CLAIM_QUERY',
          dueDate: daysFromNow(2),
          priority: 'HIGH' as any,
          status: 'IN_PROGRESS' as any,
          clientId: client.id,
          policyId: policy.id,
          claimId: claimDbId,
          claimQueryId: queryId,
          insurerId: insurer.id,
          assignedToId: claimsUser.id,
          createdById: claimsUser.id,
        },
      });
    }

    if (i === 3) {
      const queryId = sampleId('claim-query-response-submitted');
      const queryDocId = sampleId('document-claim-query-response');
      await prisma.document.upsert({
        where: { id: queryDocId },
        update: {
          entityType: 'CLAIM_QUERY',
          entityId: queryId,
          relatedEntityType: 'CLAIM_QUERY',
          relatedEntityId: queryId,
          clientId: client.id,
          policyId: policy.id,
          claimId: claimDbId,
          insurerId: insurer.id,
          type: 'CLAIM_QUERY_RESPONSE',
          documentType: 'CLAIM_QUERY_RESPONSE',
          category: 'CLAIMS',
          name: 'repair-estimate-and-police-abstract.pdf',
          title: 'Repair estimate and police abstract',
          fileName: 'repair-estimate-and-police-abstract.pdf',
          originalFileName: 'repair-estimate-and-police-abstract.pdf',
          fileUrl: `https://example.com/${SEED_TAG}/repair-estimate-and-police-abstract.pdf`,
          storageKey: `${SEED_TAG}/claims/repair-estimate-and-police-abstract.pdf`,
          checksum: createHash('sha256').update(queryDocId).digest('hex'),
          fileSize: 1024 * 420,
          mimeType: 'application/pdf',
          status: 'VERIFIED' as any,
          visibility: 'INTERNAL' as any,
          sourceModule: 'claims',
          isVerified: true,
          verifiedById: claimsUser.id,
          verifiedAt: daysFromNow(-4),
          tags: ['claim-query', 'response', 'police-abstract'],
          uploadedById: claimsUser.id,
          createdById: claimsUser.id,
        },
        create: {
          id: queryDocId,
          entityType: 'CLAIM_QUERY',
          entityId: queryId,
          relatedEntityType: 'CLAIM_QUERY',
          relatedEntityId: queryId,
          clientId: client.id,
          policyId: policy.id,
          claimId: claimDbId,
          insurerId: insurer.id,
          type: 'CLAIM_QUERY_RESPONSE',
          documentType: 'CLAIM_QUERY_RESPONSE',
          category: 'CLAIMS',
          name: 'repair-estimate-and-police-abstract.pdf',
          title: 'Repair estimate and police abstract',
          fileName: 'repair-estimate-and-police-abstract.pdf',
          originalFileName: 'repair-estimate-and-police-abstract.pdf',
          fileUrl: `https://example.com/${SEED_TAG}/repair-estimate-and-police-abstract.pdf`,
          storageKey: `${SEED_TAG}/claims/repair-estimate-and-police-abstract.pdf`,
          checksum: createHash('sha256').update(queryDocId).digest('hex'),
          fileSize: 1024 * 420,
          mimeType: 'application/pdf',
          status: 'VERIFIED' as any,
          visibility: 'INTERNAL' as any,
          sourceModule: 'claims',
          isVerified: true,
          verifiedById: claimsUser.id,
          verifiedAt: daysFromNow(-4),
          tags: ['claim-query', 'response', 'police-abstract'],
          uploadedById: claimsUser.id,
          createdById: claimsUser.id,
        },
      });
      await prisma.claimQuery.upsert({
        where: { id: queryId },
        update: {
          claimId: claimDbId,
          source: 'INSURER' as any,
          querySource: 'INSURER' as any,
          queryType: 'CLARIFICATION' as any,
          queryText: 'Confirm accident scene details and attach repair estimate.',
          requestedBy: 'Claims Adjuster',
          raisedByName: 'Claims Adjuster',
          dueDate: daysFromNow(-3),
          priority: 'NORMAL' as any,
          status: 'SUBMITTED_TO_INSURER' as any,
          responseText: 'Client supplied estimate and police abstract; submitted to insurer.',
          respondedAt: daysFromNow(-4),
          submittedToInsurerAt: daysFromNow(-3),
          assignedToId: claimsUser.id,
          createdById: claimsUser.id,
        },
        create: {
          id: queryId,
          claimId: claimDbId,
          source: 'INSURER' as any,
          querySource: 'INSURER' as any,
          queryType: 'CLARIFICATION' as any,
          queryText: 'Confirm accident scene details and attach repair estimate.',
          requestedBy: 'Claims Adjuster',
          raisedByName: 'Claims Adjuster',
          dueDate: daysFromNow(-3),
          priority: 'NORMAL' as any,
          status: 'SUBMITTED_TO_INSURER' as any,
          responseText: 'Client supplied estimate and police abstract; submitted to insurer.',
          respondedAt: daysFromNow(-4),
          submittedToInsurerAt: daysFromNow(-3),
          assignedToId: claimsUser.id,
          createdById: claimsUser.id,
        },
      });
      await prisma.claimQueryResponse.upsert({
        where: { id: sampleId('claim-query-response-client') },
        update: {
          claimQueryId: queryId,
          responseSource: 'CLIENT' as any,
          responseText: 'Attached police abstract and garage repair estimate for insurer review.',
          respondedByName: claimantName,
          responseDate: daysFromNow(-4),
          submittedToInsurerAt: daysFromNow(-3),
          documents: { set: [{ id: queryDocId }] },
        },
        create: {
          id: sampleId('claim-query-response-client'),
          claimQueryId: queryId,
          responseSource: 'CLIENT' as any,
          responseText: 'Attached police abstract and garage repair estimate for insurer review.',
          respondedByName: claimantName,
          responseDate: daysFromNow(-4),
          submittedToInsurerAt: daysFromNow(-3),
          documents: { connect: [{ id: queryDocId }] },
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // 10) Tasks (up to 20) connected across entities + activities
  // ─────────────────────────────────────────────────────────
  const seededClaims = await prisma.claim.findMany({ where: { claimNumber: { startsWith: 'CLM-2026-' } } });
  const seededLeads = await prisma.lead.findMany({
    where: { sourceDetail: { contains: SEED_TAG } },
  });
  const seededPolicies = await prisma.policy.findMany({ where: { policyNumber: { startsWith: 'POL-2026-' } } });

  const taskStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
  for (let i = 1; i <= 20; i++) {
    const taskId = sampleId(`task-${pad(i, 3)}`);
    const status = taskStatuses[(i - 1) % taskStatuses.length];
    const priority = (i % 4 === 0 ? 'URGENT' : i % 4 === 1 ? 'HIGH' : i % 4 === 2 ? 'NORMAL' : 'LOW') as any;
    const client = clientRows[(i - 1) % clientRows.length];
    const policy = seededPolicies[(i - 1) % seededPolicies.length];
    const claim = seededClaims[(i - 1) % seededClaims.length];
    const lead = seededLeads[(i - 1) % seededLeads.length];
    const onboarding = onboardingRows[(i - 1) % onboardingRows.length];

    // Distribute polymorphic links
    const linkType = i % 5;
    const leadId = linkType === 0 ? lead?.id ?? null : null;
    const clientId = linkType === 1 ? client.id : linkType === 4 ? client.id : null;
    const policyId = linkType === 2 ? policy?.id ?? null : linkType === 4 ? policy?.id ?? null : null;
    const claimId = linkType === 3 ? claim?.id ?? null : linkType === 4 ? claim?.id ?? null : null;
    const onboardingCaseId = linkType === 4 ? onboarding?.id ?? null : null;

    const assignedToId = i % 4 === 0 ? relationshipUser.id : i % 4 === 1 ? salesUser.id : i % 4 === 2 ? claimsUser.id : financeUser.id;

    await prisma.task.upsert({
      where: { id: taskId },
      update: {
        title: `Task ${pad(i, 2)} - Follow up`,
        description: `${SEED_TAG} sample task for testing`,
        category: linkType === 0 ? 'LEAD' : linkType === 1 ? 'CLIENT' : linkType === 2 ? 'POLICY' : linkType === 3 ? 'CLAIM' : 'ONBOARDING',
        dueDate: daysFromNow((i % 14) - 7),
        priority,
        status: status as any,
        leadId,
        clientId,
        policyId,
        claimId,
        onboardingCaseId,
        assignedToId,
        completedAt: status === 'COMPLETED' ? daysFromNow(-1) : null,
        completedById: status === 'COMPLETED' ? assignedToId : null,
        createdById: relationshipUser.id,
      },
      create: {
        id: taskId,
        title: `Task ${pad(i, 2)} - Follow up`,
        description: `${SEED_TAG} sample task for testing`,
        category: linkType === 0 ? 'LEAD' : linkType === 1 ? 'CLIENT' : linkType === 2 ? 'POLICY' : linkType === 3 ? 'CLAIM' : 'ONBOARDING',
        dueDate: daysFromNow((i % 14) - 7),
        priority,
        status: status as any,
        leadId,
        clientId,
        policyId,
        claimId,
        onboardingCaseId,
        assignedToId,
        completedAt: status === 'COMPLETED' ? daysFromNow(-1) : null,
        completedById: status === 'COMPLETED' ? assignedToId : null,
        createdById: relationshipUser.id,
      },
    });

    const activityId = sampleId(`task-activity-${pad(i, 3)}`);
    await prisma.taskActivity.upsert({
      where: { id: activityId },
      update: {
        taskId,
        type: 'NOTE',
        description: `${SEED_TAG} created via seed`,
        metadata: { tag: SEED_TAG, idx: i },
        createdById: relationshipUser.id,
      },
      create: {
        id: activityId,
        taskId,
        type: 'NOTE',
        description: `${SEED_TAG} created via seed`,
        metadata: { tag: SEED_TAG, idx: i },
        createdById: relationshipUser.id,
      },
    });
  }

  // Create a small invoice set (not requested explicitly, but helps payments UI)
  for (let i = 1; i <= 3; i++) {
    const invId = sampleId(`invoice-${pad(i, 3)}`);
    const invoiceNumber = makeInvoiceNumber(i);
    const client = clientRows[i - 1];
    const policy = seededPolicies[i - 1];
    const amount = 15000 + i * 2500;
    await prisma.invoice.upsert({
      where: { invoiceNumber },
      update: {
        clientId: client.id,
        insurerId: policy?.insurerId ?? null,
        invoiceDate: daysFromNow(-15),
        dueDate: daysFromNow(15),
        subtotal: amount.toFixed(2) as any,
        taxAmount: '0.00' as any,
        totalAmount: amount.toFixed(2) as any,
        status: 'ISSUED' as any,
        paidAmount: '0.00' as any,
        balanceDue: amount.toFixed(2) as any,
        notes: `${SEED_TAG} sample invoice`,
        createdById: financeUser.id,
      },
      create: {
        id: invId,
        invoiceNumber,
        clientId: client.id,
        insurerId: policy?.insurerId ?? null,
        invoiceDate: daysFromNow(-15),
        dueDate: daysFromNow(15),
        subtotal: amount.toFixed(2) as any,
        taxAmount: '0.00' as any,
        totalAmount: amount.toFixed(2) as any,
        status: 'ISSUED' as any,
        paidAmount: '0.00' as any,
        balanceDue: amount.toFixed(2) as any,
        notes: `${SEED_TAG} sample invoice`,
        createdById: financeUser.id,
      },
    });

    const invoiceRow = await prisma.invoice.findUniqueOrThrow({ where: { invoiceNumber } });
    const invoiceDbId = invoiceRow.id;

    const lineId = sampleId(`invoice-line-${pad(i, 3)}`);
    await prisma.invoiceLine.upsert({
      where: { id: lineId },
      update: {
        invoiceId: invoiceDbId,
        description: `${SEED_TAG} admin service fee`,
        quantity: 1,
        unitPrice: amount.toFixed(2) as any,
        amount: amount.toFixed(2) as any,
        policyId: policy?.id ?? null,
      },
      create: {
        id: lineId,
        invoiceId: invoiceDbId,
        description: `${SEED_TAG} admin service fee`,
        quantity: 1,
        unitPrice: amount.toFixed(2) as any,
        amount: amount.toFixed(2) as any,
        policyId: policy?.id ?? null,
      },
    });
  }

  console.log('✓ Sample data seeded successfully');
  console.log('\n✅ Seed completed successfully!');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
