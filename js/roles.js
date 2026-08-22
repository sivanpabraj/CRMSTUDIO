/* ══════════════════════════════════════════════
   Studio M — Role & Permission System
   ══════════════════════════════════════════════ */

const ROLE_DEFS = {
  system_admin:       { id: 'system_admin',       emoji: '🛡️', title: 'ادمین سیستم',     type: 'management', perms: ['all', 'manage_users', 'manage_system'] },
  studio_manager:     { id: 'studio_manager',     emoji: '👑', title: 'مدیر استودیو',    type: 'management', perms: ['view_all', 'view_contract', 'calendar', 'sms', 'editing', 'manage_personnel', 'manage_contracts', 'manage_finance'] },
  accountant:         { id: 'accountant',         emoji: '🧾', title: 'حسابدار',          type: 'management', perms: ['view_all', 'view_contract', 'manage_finance'] },
  office_secretary:   { id: 'office_secretary',   emoji: '📋', title: 'منشی / هماهنگ‌کننده', type: 'management', perms: ['calendar', 'view_contract', 'view_appointments', 'view_all', 'sms'] },
  coordinator:        { id: 'coordinator',        emoji: '🎯', title: 'هماهنگ‌کننده',    type: 'management', perms: ['calendar', 'view_contract', 'view_appointments', 'view_all', 'sms'], aliasOf: 'office_secretary' },
  inspector:          { id: 'inspector',          emoji: '🔍', title: 'بازرس',           type: 'management', perms: ['view_all', 'view_contract'] },
  photographer:       { id: 'photographer',       emoji: '📸', title: 'عکاس تالار',      type: 'field', perms: ['view_contract', 'view_own_projects'] },
  photographer_clip:  { id: 'photographer_clip',  emoji: '📷', title: 'عکاس کلیپ',       type: 'field', perms: ['view_contract', 'view_own_projects'] },
  vid_venue:          { id: 'vid_venue',          emoji: '🎬', title: 'فیلمبردار تالار', type: 'field', perms: ['view_contract', 'view_own_projects'] },
  vid_clip:           { id: 'vid_clip',           emoji: '🎥', title: 'فیلمبردار کلیپ',  type: 'field', perms: ['view_contract', 'view_own_projects'] },
  helishot:           { id: 'helishot',           emoji: '🚁', title: 'هلی‌شات / FPV',   type: 'field', perms: ['view_own_projects'] },
  crane:              { id: 'crane',              emoji: '🎥', title: 'کرین',            type: 'field', perms: ['view_own_projects'] },
  editor_venue:       { id: 'editor_venue',       emoji: '💻', title: 'ادیتور تالار',    type: 'office', perms: ['view_own_projects', 'editing'] },
  editor_clip:        { id: 'editor_clip',        emoji: '✂️', title: 'ادیتور کلیپ',     type: 'office', perms: ['view_own_projects', 'editing'] },
  album_designer:     { id: 'album_designer',     emoji: '🎨', title: 'طراح آلبوم',      type: 'office', perms: ['view_own_projects', 'editing'] },
  colorist:           { id: 'colorist',           emoji: '🌈', title: 'کالریست',         type: 'office', perms: ['view_own_projects', 'editing'] },
  freelancer:         { id: 'freelancer',         emoji: '⏳', title: 'فریلنسر زمان‌دار', type: 'field', perms: ['view_own_projects'] },
  other:              { id: 'other',              emoji: '👤', title: 'سایر',            type: 'field', perms: ['view_own_projects'] }
}

const ROLE_COLORS = {
  system_admin: '#FF3B30', studio_manager: '#5856D6',
  office_secretary: '#0071E3', coordinator: '#0071E3', inspector: '#64748B',
  photographer: '#0071E3', photographer_clip: '#5856D6',
  vid_venue: '#E68619', vid_clip: '#FF9500',
  helishot: '#00A3BF', crane: '#009688',
  editor_venue: '#34C759', editor_clip: '#30D158',
  album_designer: '#BF5AF2', colorist: '#FF375F', freelancer: '#F59E0B', other: '#94A3B8'
}

/** نقش‌های قابل انتخاب برای پرسنل (چند نقش همزمان) */
const PERSONNEL_ROLE_IDS = [
  'photographer', 'photographer_clip', 'vid_venue', 'vid_clip',
  'helishot', 'crane', 'editor_venue', 'editor_clip',
  'album_designer', 'colorist', 'freelancer', 'office_secretary', 'other'
]

const ROLE_LEGACY_MAP = {
  '👑 مدیر سیستم': 'studio_manager', '💼 مدیر آتلیه': 'studio_manager',
  'ادمین': 'system_admin', 'ادمین سیستم': 'system_admin',
  manager: 'studio_manager', admin: 'studio_manager', مدیر: 'studio_manager',
  'منشی دفتر': 'office_secretary', منشی: 'office_secretary', سایر: 'other',
  '📸 عکاس': 'photographer', '🎬 فیلم‌بردار مراسم': 'vid_venue', '🎥 فیلم‌بردار کلیپ': 'vid_clip',
  '🚁 خلبان هلی‌شات و FPV': 'helishot', '✂️ ادیتور کلیپ': 'editor_clip',
  '💻 ادیتور تالار': 'editor_venue', '🎨 طراح آلبوم دیجیتال': 'album_designer'
}

function normalizeRole(role) {
  if (!role) return 'other'
  const s = String(role).trim()
  if (s === 'coordinator') return 'office_secretary'
  if (ROLE_DEFS[s]) return ROLE_DEFS[s].aliasOf || s
  if (ROLE_LEGACY_MAP[s]) return normalizeRole(ROLE_LEGACY_MAP[s])
  const lower = s.toLowerCase()
  if (lower === 'coordinator') return 'office_secretary'
  if (ROLE_DEFS[lower]) return ROLE_DEFS[lower].aliasOf || lower
  if (ROLE_LEGACY_MAP[lower]) return normalizeRole(ROLE_LEGACY_MAP[lower])
  return s
}

function normalizeRoles(roles) {
  return [...new Set((roles || []).map(normalizeRole))]
}

function getRole(id) {
  const n = normalizeRole(id)
  const def = ROLE_DEFS[n] || ROLE_DEFS.other
  if (def.aliasOf && ROLE_DEFS[def.aliasOf]) return ROLE_DEFS[def.aliasOf]
  return def
}

function getRoleTitle(id) {
  return getRole(id).title
}

function getRoleEmoji(id) {
  return getRole(id).emoji
}

function getAllRoles() {
  const custom = (typeof DB !== 'undefined' ? DB.get('customRoles') : []) || []
  const base = Object.values(ROLE_DEFS).filter(r => !r.aliasOf)
  const customNorm = custom.map(c => ({
    id: c.id || c.title,
    emoji: c.emoji || '👤',
    title: c.title || c.id,
    type: c.type || 'field',
    perms: c.perms || ['view_own_projects']
  }))
  const seen = new Set()
  return [...base, ...customNorm].filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
}

function getPersonnelRoles() {
  const ids = new Set(PERSONNEL_ROLE_IDS.map(normalizeRole))
  return getAllRoles().filter(r => ids.has(r.id))
}

function getRoleColor(id) {
  return ROLE_COLORS[normalizeRole(id)] || '#64748B'
}

function getManagementRoles() {
  const order = ['system_admin', 'studio_manager', 'accountant', 'office_secretary', 'coordinator', 'inspector']
  return getAllRoles()
    .filter(r => r.type === 'management')
    .sort((a, b) => {
      const ia = order.indexOf(a.id)
      const ib = order.indexOf(b.id)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
}

function hasPermission(roleId, perm) {
  const role = getRole(roleId)
  if (!role.perms) return false
  if (role.perms.includes('all')) return true
  return role.perms.includes(perm)
}

function roleHasAnyPermission(roleIds, perm) {
  return normalizeRoles(roleIds).some(r => hasPermission(r, perm))
}

window.ROLE_DEFS = ROLE_DEFS
window.normalizeRole = normalizeRole
window.normalizeRoles = normalizeRoles
window.getRole = getRole
window.getRoleTitle = getRoleTitle
window.getRoleEmoji = getRoleEmoji
window.getAllRoles = getAllRoles
window.getPersonnelRoles = getPersonnelRoles
window.getRoleColor = getRoleColor
window.ROLE_COLORS = ROLE_COLORS
window.PERSONNEL_ROLE_IDS = PERSONNEL_ROLE_IDS
window.getManagementRoles = getManagementRoles
window.hasPermission = hasPermission
window.roleHasAnyPermission = roleHasAnyPermission

/** API امن — مستقل از ترتیب بارگذاری script */
const RolesHelper = {
  normalize(roles) {
    return typeof normalizeRoles === 'function' ? normalizeRoles(roles || []) : (roles || [])
  },
  emoji(id) {
    return typeof getRoleEmoji === 'function' ? getRoleEmoji(id) : '👤'
  },
  title(id) {
    return typeof getRoleTitle === 'function' ? getRoleTitle(id) : String(id || '—')
  }
}
window.RolesHelper = RolesHelper
