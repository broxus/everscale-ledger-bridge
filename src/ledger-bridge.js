'use strict'

import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import WebSocketTransport from '@ledgerhq/hw-transport-http/lib/WebSocketTransport'

import LedgerApp from "./ledger-app";

// URL which triggers Ledger Live app to open and handle communication
const BRIDGE_URL = 'ws://localhost:8435'

// Number of seconds to poll for Ledger Live and Ethereum app opening
const TRANSPORT_CHECK_DELAY = 1000
const TRANSPORT_CHECK_LIMIT = 120

export default class LedgerBridge {
    constructor() {
        this.addEventListeners()
        this.useLedgerLive = false
    }

    addEventListeners() {
        window.addEventListener('message', async e => {
            if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                const {action, params} = e.data
                const replyAction = `${action}-reply`

                switch (action) {
                    case 'ledger-get-configuration':
                        await this.getConfiguration(replyAction)
                        break
                    case 'ledger-get-public-key':
                        await this.getPublicKey(replyAction, params.account)
                        break
                    case 'ledger-get-address':
                        await this.getAddress(replyAction, params.account, params.contract)
                        break
                    case 'ledger-sign-message':
                        await this.signMessage(replyAction, params.account, params.message)
                        break
                    case 'ledger-close-bridge':
                        await this.cleanUp(replyAction)
                        break
                    case 'ledger-update-transport':
                        await this.updateLedgerLivePreference(replyAction, params.useLedgerLive)
                        break
                }
            }
        }, false)
    }

    sendMessageToExtension(msg) {
        window.parent.postMessage(msg, '*')
    }

    checkTransportLoop(i) {
        const iterator = i || 0
        return WebSocketTransport.check(BRIDGE_URL).catch(async () => {
            await sleep(TRANSPORT_CHECK_DELAY)
            if (iterator < TRANSPORT_CHECK_LIMIT) {
                return this.checkTransportLoop(iterator + 1)
            } else {
                throw new Error('Ledger transport check timeout')
            }
        })
    }

    async makeApp() {
        try {
            if (this.useLedgerLive) {
                let reestablish = false;
                try {
                    await WebSocketTransport.check(BRIDGE_URL)
                } catch (_err) {
                    window.open('ledgerlive://bridge?appName=Ethereum')
                    await this.checkTransportLoop()
                    reestablish = true;
                }
                if (!this.app || reestablish) {
                    this.transport = await WebSocketTransport.open(BRIDGE_URL)
                    this.app = new LedgerApp(this.transport)
                }
            } else {
                this.transport = await TransportWebHID.create()
                this.app = new LedgerApp(this.transport)
            }
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
            throw e
        }
    }

    updateLedgerLivePreference(replyAction, useLedgerLive) {
        this.useLedgerLive = useLedgerLive
        this.cleanUp()
        this.sendMessageToExtension({
            action: replyAction,
            success: true,
        })
    }

    cleanUp(replyAction) {
        this.app = null
        if (this.transport) {
            this.transport.close()
        }
        if (replyAction) {
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
            })
        }
    }

    async getConfiguration(replyAction) {
        try {
            await this.makeApp()
            const res = await this.app.getConfiguration()
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                error: new Error(e.toString())
            })
        } finally {
            if (!this.useLedgerLive) {
                this.cleanUp()
            }
        }
    }

    async getPublicKey(replyAction, account) {
        try {
            await this.makeApp()
            const res = await this.app.getPublicKey(account)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                error: new Error(e.toString())
            })
        } finally {
            if (!this.useLedgerLive) {
                this.cleanUp()
            }
        }
    }

    async getAddress(replyAction, account, contract) {
        try {
            await this.makeApp()
            const res = await this.app.getAddress(account, contract)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                error: new Error(e.toString())
            })
        } finally {
            if (!this.useLedgerLive) {
                this.cleanUp()
            }
        }
    }

    async signMessage(replyAction, account, message) {
        try {
            await this.makeApp()

            const res = await this.app.signMessage(account, message)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                error: new Error(e.toString())
            })
        } finally {
            if (!this.useLedgerLive) {
                this.cleanUp()
            }
        }
    }

    ledgerErrToMessage(err) {
        const isWrongAppError = (err) => String(err.message || err).includes('0x6700')
        const isLedgerLockedError = (err) => String(err.message || err).includes('0x6804')
        const isUserCanceledError = (err) => err.name && err.name.includes('TransportOpenUserCancelled')
        const isSignNotSupported = (err) => err.message && err.message.includes('Message signing is not supported')
        const isTransactionRejected = (err) => err.message && err.message.includes('Transaction approval request was rejected')

        if (isWrongAppError(err)) {
            return 'LEDGER_WRONG_APP'
        }

        if (isLedgerLockedError(err)) {
            return 'LEDGER_LOCKED'
        }

        if (isTransactionRejected(err)) {
            return 'TRANSACTION_REJECTED'
        }

        if (isSignNotSupported(err)) {
            return 'SIGN_NON_SUPPORTED'
        }

        if (isUserCanceledError(err) && err.message && err.message.includes('Access denied to use Ledger device')) {
            return 'USER_DENIED'
        }

        if (isUserCanceledError(err) && err.message && err.message.includes('Failed to execute \'requestDevice\' on \'HID\'')) {
            return 'USER_CANCELLED'
        }

        // Other
        return err.toString()
    }
}

function sleep(ms) {
    return new Promise((success) => setTimeout(success, ms))
}
