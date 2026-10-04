/**
 * CRMSTUDIO Canonical Database Schema & Collections Registry
 * منبع واحد حقیقت (Single Source of Truth) برای کلیدها، نوع داده‌ها و مهاجرت‌ها
 */

export const DB_VERSION = 20

export const DB_OBJECT_KEYS = new Set([
  'studioInfo',
  'securityState',
  '_meta'
])

export const DB_CORE_COLLECTIONS = [
  'users',
  'contracts',
  'transactions',
  'banks',
  'personnelProposals',
  'persProjects',
  'revisions',
  'persContracts',
  'notifications',
  'smsTemplates',
  'logs',
  'leads',
  'tasks',
  'albums',
  'messages',
  'personnel',
  'appointments',
  'calendarReminders',
  'printOrders',
  'utilities',
  'issues',
  'customerRequests',
  'customRoles',
  'cheques',
  'equipment',
  'bookings',
  'invoices',
  'packages',
  'attendance',
  'expenses',
  'galleries',
  'signatures',
  'timelines',
  'workflows',
  'fileAssets',
  'commLogs',
  'apiKeys',
  'payrollRuns',
  'customerCustody'
]

// کلیدهای افزوده شده در مهاجرت‌های تاریخی
export const DB_MIGRATION_COLLECTIONS = [
  'printShops',
  'photoSelections',
  'salaryPayments'
]

/**
 * رده‌بندی محصولی و معماری همگام‌سازی (Sync Taxonomy)
 */
export const SYNC_TAXONOMY = {
  // ۱. ردیف‌محور و جابه‌جا شونده میان دستگاه‌ها (Business Critical)
  synced: [
    'contracts', 'transactions', 'invoices', 'bookings', 'personnel', 'equipment',
    'workflows', 'packages', 'expenses', 'leads', 'banks', 'cheques',
    'appointments', 'customerRequests', 'fileAssets',
    'attendance', 'tasks', 'galleries', 'signatures', 'payrollRuns'
  ],
  // ۲. محلی و مخصوص همان دستگاه (Local Cache / Device Specific)
  local: [
    'notifications', 'calendarReminders', 'messages', 'personnelProposals',
    'persProjects', 'revisions', 'persContracts', 'printOrders', 'utilities',
    'issues', 'timelines', 'customerCustody'
  ],
  // ۳. کاملاً خصوصی و غیرقابل صدور (Server-Only / Security)
  serverOnly: [
    'logs', 'apiKeys', 'securityState', 'commLogs', 'users'
  ]
}

export const ALL_VALID_COLLECTIONS = new Set([
  ...DB_CORE_COLLECTIONS,
  ...DB_MIGRATION_COLLECTIONS,
  ...DB_OBJECT_KEYS
])

export const REQUIRED_COLLECTIONS = [
  'users',
  'contracts',
  'studioInfo'
]

export function allCollections() {
  return [...DB_CORE_COLLECTIONS, ...DB_MIGRATION_COLLECTIONS]
}

export function isObjectCollection(key) {
  return DB_OBJECT_KEYS.has(key)
}

if (typeof window !== 'undefined') {
  window.DbSchema = {
    DB_VERSION,
    DB_OBJECT_KEYS,
    DB_CORE_COLLECTIONS,
    DB_MIGRATION_COLLECTIONS,
    SYNC_TAXONOMY,
    ALL_VALID_COLLECTIONS,
    REQUIRED_COLLECTIONS,
    allCollections,
    isObjectCollection
  }
}

