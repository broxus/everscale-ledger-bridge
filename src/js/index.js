import '../style.css'
import LedgerBridge from './ledger-bridge'

(() => {
    const params = new URLSearchParams(window.location.search)
    const theme = params.get('theme') || 'default'
    const container = document.querySelector(`[data-theme="${theme}"]`)

    container.style.display = null

    const bridge = new LedgerBridge()

    // User gesture
    const pairing = container.querySelector('[data-action="pairing"]')
    if (pairing) {
        pairing.addEventListener('click', () => bridge.getConfiguration())
    }

    const back = container.querySelector('[data-action="back"]')
    if (back) {
        back.addEventListener('click', () => bridge.cleanUp('ledger-bridge-back'))
    }

    console.log(`EVER Wallet <=> Ledger Bridge initialized from ${window.location}!`)
})()
