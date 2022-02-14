'use strict'
const {Buffer} = require('buffer')
window.Buffer = Buffer;

console.log('hello', window.Buffer)

// Initialize ledger bridge
import LedgerBridge from './ledger-bridge'

(() => {
    const bridge = new LedgerBridge()

    // User gesture
    const button = document.getElementById('ledger-pairing-btn')
    if (button != null) {
        button.addEventListener('click', () => bridge.getConfiguration())
    }

    console.log(`Broxus < = > Ledger Bridge initialized from ${window.location}!`)
})()
