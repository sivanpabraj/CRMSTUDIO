/* Studio M — CSP-safe declarative events for non-admin application shells. */
(() => {
  const allowedActions = new Set([
    'ConsultationBooking._shiftMonth',
    'ConsultationBooking.pickDate',
    'ConsultationBooking.pickTime',
    'ConsultationBooking.toggleCalendar',
    'CustomerPortal.logout',
    'CustomerPortal.openAttachment',
    'CustomerPortal.replyToRequest',
    'CustomerPortal.selectReqType',
    'CustomerPortal.submitRequest',
    'GlassTheme.clearAndRenderInlinePicker',
    'GlassTheme.clearCustom',
    'GlassTheme.closePicker',
    'GlassTheme.onUpload',
    'GlassTheme.openPicker',
    'GlassTheme.saveGlobalAndClosePicker',
    'GlassTheme.selectAccent',
    'GlassTheme.selectPreset',
    'JoinPortal.submit',
    'Portal.acceptInvitation',
    'Portal.attendanceCheckIn',
    'Portal.attendanceCheckOut',
    'Portal.backToLogin',
    'Portal.logout',
    'Portal.oauthLogin',
    'Portal.rejectEmploymentContract',
    'Portal.rejectInvitation',
    'Portal.saveConsultation',
    'Portal.sendOtp',
    'Portal.setLoginMethod',
    'Portal.showSection',
    'Portal.verifyEmploymentContract',
    'Portal.verifyOtp',
    'Portal.verifyPortalInvite',
    'Portal.loginPassword',
    'PortalDashboard.closeModal',
    'PortalDashboard.openProject',
    'PortalDashboard.saveStatus',
    'PortalDashboard.selectStatus',
    'PortalDashboard.setTab',
    'PortalMessages.markRead',
    'PortalMessages.reply',
    'PortalProfile.onAvatarPick',
    'PortalProfile.save',
    'StartPortal.enterAdmin',
    'StartPortal.submit'
  ])

  const resolveAction = name => {
    if (!allowedActions.has(name)) return null
    const [rootName, methodName] = name.split('.')
    const root = window[rootName]
    const method = root?.[methodName]
    return typeof method === 'function' ? { root, method } : null
  }

  const dispatch = event => {
    const trigger = event.target?.closest?.('[data-csp-action]')
    if (!trigger) return
    const expectedType = trigger.getAttribute('data-csp-event') || 'click'
    if (expectedType !== event.type) return

    const action = resolveAction(trigger.getAttribute('data-csp-action') || '')
    if (!action) {
      console.error('Blocked unknown CSP action')
      return
    }

    if (trigger.hasAttribute('data-csp-stop')) event.stopPropagation()
    if (trigger.hasAttribute('data-csp-prevent')) event.preventDefault()

    const args = []
    if (trigger.hasAttribute('data-csp-pass-event')) args.push(event)
    if (trigger.hasAttribute('data-csp-arg')) args.push(trigger.getAttribute('data-csp-arg'))

    try {
      const result = action.method.apply(action.root, args)
      if (result && typeof result.catch === 'function') {
        result.catch(error => console.error('CSP action failed', error))
      }
    } catch (error) {
      console.error('CSP action failed', error)
    }
  }

  document.addEventListener('click', dispatch)
  document.addEventListener('change', dispatch)
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const trigger = event.target?.closest?.('[role="button"][data-csp-action]')
    if (!trigger) return
    event.preventDefault()
    trigger.click()
  })
  window.CspEvents = Object.freeze({ dispatch })
})()
