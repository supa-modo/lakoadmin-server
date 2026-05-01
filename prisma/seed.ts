import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

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

  // Settings
  { name: 'settings.read', module: 'settings', action: 'read', description: 'View settings' },
  { name: 'settings.update', module: 'settings', action: 'update', description: 'Update settings' },

  // Documents
  { name: 'documents.read', module: 'documents', action: 'read', description: 'View documents' },
  { name: 'documents.create', module: 'documents', action: 'create', description: 'Upload documents' },
  { name: 'documents.delete', module: 'documents', action: 'delete', description: 'Delete documents' },

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
      'documents.read', 'documents.create',
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
      'documents.read', 'documents.create',
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
      'documents.read',
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
      'commissions.read', 'commissions.calculate', 'commissions.approve', 'commissions.pay', 'commissions.hold',
      'commissions.clawback', 'commissions.statement',
      'communications.read', 'communications.send', 'communications.send_bulk', 'communications.schedule',
      'communications.templates.read', 'communications.campaigns.read', 'communications.logs.read',
      'notifications.read', 'notifications.manage',
      'reports.read', 'reports.export',
      'documents.read',
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
      'reports.read', 'reports.export',
      'documents.read',
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
      'communications.read', 'communications.templates.read', 'communications.campaigns.read',
      'communications.logs.read', 'notifications.read',
      'reports.read', 'reports.export',
      'documents.read',
    ],
  },
};

async function main(): Promise<void> {
  console.log('🌱 Starting seed...');

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
  console.log('\n✅ Seed completed successfully!');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
