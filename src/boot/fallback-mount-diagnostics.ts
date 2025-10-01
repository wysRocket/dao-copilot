// Fallback diagnostics: separate module so CSP can stay restrictive (no inline scripts needed)
interface MountAwareWindow extends Window {
  __APP_MOUNTED?: boolean
}
const w = window as MountAwareWindow
const start = Date.now()

function renderFailure(reason: string) {
  const el = document.getElementById('app')
  if (!el || w.__APP_MOUNTED) return
  el.innerHTML = `<div style="font-family:Arial;padding:16px;color:#fff;background:#222">⚠️ Renderer issue: ${reason}<br>Elapsed: ${Date.now() - start}ms<br><pre style='white-space:pre-wrap;font-size:11px'>Scripts:\n${Array.from(
    document.scripts
  )
    .map(s => s.src || '[inline]')
    .join('\n')}</pre><p>Open DevTools (F12) and check console.</p></div>`
}

setTimeout(() => {
  if (!w.__APP_MOUNTED) {
    renderFailure('React did not mount within 5s')
  }
}, 5000)

window.addEventListener('error', e => {
  if (!w.__APP_MOUNTED) {
    renderFailure(`Error: ${e.message}`)
  }
})

window.addEventListener('unhandledrejection', e => {
  if (!w.__APP_MOUNTED) {
    renderFailure(`Unhandled rejection: ${e.reason}`)
  }
})

export {}
