import { Buffer } from 'buffer'

const CLA = 0xe0
const INS_GET_CONF = 0x01
const INS_GET_PK = 0x02
const INS_SIGN = 0x03
const INS_GET_ADDR = 0x04
const SW_OK = 0x9000
const SW_CANCEL = 0x6985
const SW_NOT_ALLOWED = 0x6c66
const SW_UNSUPPORTED = 0x6d00

export default class LedgerApp {
    constructor(transport, scrambleKey = 'l0v') {
        this.transport = void 0
        this.transport = transport
        transport.decorateAppAPIMethods(this, ['getConfiguration', 'getPublicKey', 'getAddress', 'signMessage'], scrambleKey)
    }

    getConfiguration() {
        return this.transport.send(CLA, INS_GET_CONF, 0x00, 0x00).then(response => {
            const status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
            if (status === SW_OK) {
                const configuration = response.slice()
                return {
                    configuration,
                }
            } else {
                throw new Error('Failed to get configuration')
            }
        })
    }

    getPublicKey(account, boolValidate = false) {
        const data = Buffer.alloc(4)
        data.writeUInt32BE(account)
        return this.transport
            .send(CLA, INS_GET_PK, boolValidate ? 0x01 : 0x00, 0x00, data, [SW_OK])
            .then((response) => {
                const status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
                if (status === SW_OK) {
                    const offset = 1
                    const publicKey = response.slice(offset, offset + 32)
                    return {publicKey}
                } else {
                    throw new Error('Failed to get public key')
                }
            })
    }

    getAddress(account, contract, boolValidate = false) {
        const data = Buffer.alloc(8)
        data.writeUInt32BE(account, 0)
        data.writeUInt32BE(contract, 4)
        return this.transport
            .send(CLA, INS_GET_ADDR, boolValidate ? 0x01 : 0x00, 0x00, data, [SW_OK])
            .then((response) => {
                const status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
                if (status === SW_OK) {
                    const offset = 1
                    const address = response.slice(offset, offset + 32)
                    return {address}
                } else {
                    throw new Error('Failed to get address')
                }
            })
    }

    signMessage(account, message, ctx) {
        const data = Buffer.alloc(4)
        data.writeUInt32BE(account, 0)

        const amount = Buffer.alloc(16)
        if (ctx && ctx.amount != null && ctx.decimals != null) {
            let number = BigInt(ctx.amount)

            // BEGIN TEMP (until ledger display buffer is fixed)
            const maxDisplayBufferLen = 17

            const formatted = number.toString()
            let intLength = formatted.length

            let decimals = parseInt(ctx.decimals, 10)
            if (intLength <= decimals) {
                while (decimals > maxDisplayBufferLen) {
                    number /= BigInt(10)
                    decimals -= 1
                }
            } else {
                const formattedDecimals = formatted.slice(-decimals)

                while (decimals > 0) {
                    if (formattedDecimals[decimals - 1] !== '0') {
                        break
                    }
                    number /= BigInt(10)
                    intLength -= 1
                    decimals -= 1
                }

                while ((intLength + (decimals > 0 ? 1 : 0)) > maxDisplayBufferLen) {
                    number /= BigInt(10)
                    intLength -= 1
                    if (decimals > 0) {
                        decimals -= 1
                    }
                }
            }
            ctx.decimals = decimals
            // END TEMP

            amount.writeBigUInt64BE(number >> BigInt(64), 0)
            amount.writeBigUInt64BE(number & BigInt(0xffffffffffffffff), 8)
        }

        const decimals = Buffer.alloc(1)
        if (ctx && ctx.decimals != null) {
            decimals.writeUInt8(parseInt(ctx.decimals, 10), 0)
        }

        const asset = Buffer.alloc(32)
        if (ctx && ctx.asset) {
            if (ctx.asset.includes('-LP-')) {
                asset.write('LP', 'utf-8')
            } else if (ctx.asset.length > 7) {
                asset.write(ctx.asset.substring(0, 6) + '..', 'utf-8')
            } else {
                asset.write(ctx.asset, 'utf-8')
            }
        }

        const address = Buffer.alloc(32)
        const workChain = Buffer.alloc(1)
        if (ctx && ctx.address) {
            const parts = ctx.address.split(':')
            workChain.writeInt8(parseInt(parts[0]), 0)
            address.write(parts[1], 'hex')
        }

        const buffer = [data, amount, asset, decimals, workChain, address, message]
        const apdus = Buffer.concat(buffer)

        return this.transport
            .send(CLA, INS_SIGN, 0x00, 0x00, apdus, [
                SW_OK,
                SW_CANCEL,
                SW_NOT_ALLOWED,
                SW_UNSUPPORTED,
            ])
            .then((response) => {
                const status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
                if (status === SW_OK) {
                    const signature = response.slice(1, response.length - 2)
                    return {signature}
                } else if (status === SW_CANCEL) {
                    throw new Error('Transaction approval request was rejected')
                } else if (status === SW_UNSUPPORTED) {
                    throw new Error('Message signing is not supported')
                } else {
                    throw new Error(
                        'Message signing not allowed. Have you enabled it in the app settings?',
                    )
                }
            })
    }
}
