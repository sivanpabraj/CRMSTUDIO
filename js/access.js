/* ══════════════════════════════════════════════
   Studio M — Access Control & Role Routing
   ══════════════════════════════════════════════ */

const Access = {
  MANAGEMENT_ROLES: ['system_admin', 'studio_manager', 'office_secretary', 'coordinator', 'inspector'],

  REQUEST_TYPE_ROLES: {
    mp3: ['editor_clip', 'editor_venue'],
    music: ['editor_clip', 'editor_venue'],
    taste: ['editor_clip', 'editor_venue', 'coordinator'],
    photo_select: ['photographer', 'photographer_clip', 'editor_venue', 'album_designer'],
    album: ['album_designer', 'editor_venue'],
    print: ['album_designer', 'office_secretary'],
    other: ['coordinator', 'studio_manager']
  },

  roles(user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    if (!user) return []
    return typeof normalizeRoles === 'function' ? normalizeRoles(user.roles || []) : (user.roles || [])
  },

  isSystemAdmin(user) {
    return this.roles(user).includes('system_admin')
  },

  isStudioManager(user) {
    return this.roles(user).includes('studio_manager')
  },

  isManagement(user) {
    return this.roles(user).some(r => {
      const def = typeof getRole === 'function' ? getRole(r) : null
      return def?.type === 'management' || this.MANAGEMENT_ROLES.includes(r)
    })
  },

  isStaffOnly(user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    if (!user) return false
    if (this.isManagement(user)) return false
    return this.roles(user).some(r => {
      const t = getRole(r).type
      return t === 'field' || t === 'office'
    })
  },

  getPrimaryRoleLabel(user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    const roles = this.roles(user)
    const order = ['system_admin', 'studio_manager', 'office_secretary', 'coordinator', 'inspector']
    for (const id of order) {
      if (roles.includes(id) && typeof getRoleTitle === 'function') return getRoleTitle(id)
    }
    if (roles.length && typeof getRoleTitle === 'function') return getRoleTitle(roles[0])
    return 'کاربر'
  },

  getRoleBadge(user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    const roles = this.roles(user)
    const id = roles.find(r => this.MANAGEMENT_ROLES.includes(r)) || roles[0]
    if (!id || typeof getRole !== 'function') return { emoji: '👤', title: 'کاربر' }
    const def = getRole(id)
    return { emoji: def.emoji, title: def.title }
  },

  getLandingUrl() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return 'index.html'
    const user = Auth.getUser()
    if (this.isSystemAdmin(user) || this.isStudioManager(user)) return 'studio-m/'
    if (this.isManagement(user)) return 'studio-m/'
    if (this.isStaffOnly(user) || Auth.userHasPermission?.('view_own_projects')) {
      return 'index.html?view=portal'
    }
    return 'index.html?view=portal'
  },

  canManageUsers(user) {
    return this.isSystemAdmin(user)
  },

  canManageStudioOps(user) {
    return this.isSystemAdmin(user) || this.isStudioManager(user) ||
      roleHasAnyPermission(this.roles(user), 'view_all')
  },

  canAccessStudioM(user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    if (!user) return false
    if (this.isSystemAdmin(user) || this.isStudioManager(user)) return true
    return this.isManagement(user)
  },

  canAccessLegacyAdmin(user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    if (!user) return false
    if (this.isSystemAdmin(user) || this.isStudioManager(user)) return true
    if (this.isStaffOnly(user)) return false
    const roles = this.roles(user)
    return roles.some(r => normalizeRole(r) === 'office_secretary') ||
      roleHasAnyPermission(roles, 'view_all') ||
      roleHasAnyPermission(roles, 'calendar')
  },

  getRequestTargetRoles(type) {
    return [...(this.REQUEST_TYPE_ROLES[type] || ['coordinator'])]
  },

  getPersonnelForUser(user) {
    if (!user || typeof DB === 'undefined') return null
    return DB.findPersonnelByUserId(user.id) || DB.findPersonnelByPhone(user.phone) || null
  },

  isAssignedToContract(personnelId, contractId) {
    if (!personnelId || !contractId || typeof DB === 'undefined') return false
    return DB.filter('persProjects', p =>
      p.contractId === contractId && p.personnelId === personnelId && p.accepted === true
    ).length > 0
  },

  canViewCustomerRequest(user, req) {
    if (!user || !req) return false
    if (this.isSystemAdmin(user) || this.isStudioManager(user)) return true
    if (roleHasAnyPermission(this.roles(user), 'view_all')) return true

    const personnel = this.getPersonnelForUser(user)
    if (!personnel) return false
    if (!this.isAssignedToContract(personnel.id, req.contractId)) return false

    const targetRoles = req.targetRoles?.length
      ? req.targetRoles
      : this.getRequestTargetRoles(req.type)
    const myRoles = normalizeRoles(personnel.roles || user.roles || [])
    const projects = DB.filter('persProjects', p =>
      p.contractId === req.contractId && p.personnelId === personnel.id && p.accepted === true
    )
    return projects.some(p => targetRoles.includes(p.roleId) && myRoles.includes(p.roleId))
  },

  filterVisibleRequests(user, list) {
    const raw = list || (typeof DB !== 'undefined'
      ? (typeof DB.active === 'function' ? DB.active('customerRequests') : DB.get('customerRequests'))
      : []) || []
    const items = raw.filter(r => r && !r._deleted)
    return items.filter(r => this.canViewCustomerRequest(user, r))
  },

  staffRouteIds() {
    return ['dashboard', 'workflow', 'notifications', 'calendar', 'contracts', 'files']
  },

  filterStudioRoutes(routes, user) {
    user = user || (typeof Auth !== 'undefined' ? Auth.getUser() : null)
    if (!user) return []
    if (this.isSystemAdmin(user) || this.isStudioManager(user)) return routes
    if (this.isStaffOnly(user)) {
      const allowed = new Set(this.staffRouteIds())
      return routes.filter(r => allowed.has(r.id) || !r.perm)
    }
    return routes.filter(r => {
      if (!r.perm) return true
      if (r.perm === 'manage_users') return this.canManageUsers(user)
      if (r.perm === 'all') return this.isSystemAdmin(user)
      return roleHasAnyPermission(this.roles(user), r.perm)
    })
  }
}

window.Access = Access
