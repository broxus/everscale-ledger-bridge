'use strict'
require('buffer')

import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import LedgerTon from "./hw-app-ton";


export default class LedgerBridge {
    constructor () {
        this.addEventListeners()
    }

    addEventListeners () {
        window.addEventListener('message', async e => {
            if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                const { action, params } = e.data
                const replyAction = `${action}-reply`

                switch (action) {
                    case 'ledger-get-configuration':
                        this.getConfiguration(replyAction)
                        break
                    case 'ledger-get-public-key':
                        this.getPublicKey(replyAction, params.account)
                        break
                    case 'ledger-sign-hash':
                        this.signHash(replyAction, params.account, params.message)
                        break
                    case 'ledger-close-bridge':
                        this.cleanUp(replyAction)
                        break
                }
            }
        }, false)
    }

    sendMessageToExtension (msg) {
        window.parent.postMessage(msg, '*')
    }

    async makeApp () {
        try {
            this.transport = await TransportWebHID.create()
            this.app = new LedgerTon(this.transport)
        } catch (e) {
            throw e
        }
    }

    cleanUp (replyAction) {
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

    async getConfiguration (replyAction) {
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
            this.cleanUp()
        }
    }

    async getPublicKey (replyAction, account) {
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
            this.cleanUp()
        }
    }

    async signHash (replyAction, account, message) {
        try {
            await this.makeApp()

            const res = await this.app.signHash(account, message)
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
            this.cleanUp()
        }
    }

    ledgerErrToMessage (err) {
        const isWrongAppError = (err) => String(err.message || err).includes('0x6700')
        const isLedgerLockedError = (err) => String(err.message || err).includes('0x6804')
        const isUserCanceledError = (err) => err.name && err.name.includes('TransportOpenUserCancelled')
        const isSignNotSupported = (err) => err.message && err.message.includes('Hash signing is not supported')
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
