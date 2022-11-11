import TransportWebHID from '@ledgerhq/hw-transport-webhid'

import LedgerApp from './ledger-app'

export default class LedgerBridge {
    constructor() {
        this.addEventListeners()
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
                    case 'ledger-sign-transaction':
                        await this.signTransaction(replyAction, params.account, params.wallet, params.message, params.context)
                        break
                    case 'ledger-close-bridge':
                        await this.cleanUp(replyAction)
                        break
                }
            }
        }, false)
    }

    sendMessageToExtension(msg) {
        window.parent.postMessage(msg, '*')
    }

    async makeApp() {
        try {
            this.transport = await TransportWebHID.create()
            this.app = new LedgerApp(this.transport)
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
            throw e
        }
    }

    async cleanUp(replyAction) {
        this.app = null
        if (this.transport) {
            await this.transport.close()
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
                error: new Error(e.toString()),
            })
        } finally {
            await this.cleanUp()
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
                error: new Error(e.toString()),
            })
        } finally {
            await this.cleanUp()
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
                error: new Error(e.toString()),
            })
        } finally {
            await this.cleanUp()
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
                error: new Error(e.toString()),
            })
        } finally {
            await this.cleanUp()
        }
    }

    async signTransaction(replyAction, account, wallet, message, context) {
        try {
            await this.makeApp()

            const res = await this.app.signTransaction(account, wallet, message, context)
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
                error: new Error(e.toString()),
            })
        } finally {
            await this.cleanUp()
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
