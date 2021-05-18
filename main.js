'use strict'
import LedgerBridge from './ledger-bridge'

(async () => {
    const bridge = new LedgerBridge()

    // User gesture
    const button = document.getElementById('ledger-pairing-btn')
    if (button != null) {
        button.addEventListener('click', () => {
            bridge.getConfiguration();
        })
    }
})()

console.log(`Broxus < = > Ledger Bridge initialized from ${window.location}!`)
