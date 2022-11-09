// Initialize ledger bridge
import LedgerBridge from './ledger-bridge'

(() => {
    const bridge = new LedgerBridge()

    // User gesture
    const button = document.getElementById('ledger-pairing-btn')
    if (button != null) {
        button.addEventListener('click', () => bridge.getConfiguration())
    }

    console.log(`EVER Wallet <=> Ledger Bridge initialized from ${window.location}!`)
})()
