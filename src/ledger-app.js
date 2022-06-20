'use strict'
require('buffer')

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
    constructor(transport, scrambleKey = "l0v") {
        this.transport = void 0
        this.transport = transport
        transport.decorateAppAPIMethods(this, ["getConfiguration", "getPublicKey", "getAddress", "signMessage"], scrambleKey)
    }

    getConfiguration() {
        return this.transport.send(CLA, INS_GET_CONF, 0x00, 0x00).then(response => {
            let status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
            if (status === SW_OK) {
                let configuration = response.slice()
                return {
                    configuration
                }
            } else {
                throw new Error('Failed to get configuration')
            }
        })
    }

    getPublicKey(account, boolValidate = false) {
        let data = Buffer.alloc(4)
        data.writeUInt32BE(account)
        return this.transport
            .send(CLA, INS_GET_PK, boolValidate ? 0x01 : 0x00, 0x00, data, [SW_OK])
            .then((response) => {
                let status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
                if (status === SW_OK) {
                    let offset = 1
                    let publicKey = response.slice(offset, offset + 32)
                    return {publicKey}
                } else {
                    throw new Error('Failed to get public key')
                }
            })
    }

    getAddress(account, contract, boolValidate = false) {
        let data = Buffer.alloc(8)
        data.writeUInt32BE(account, 0)
        data.writeUInt32BE(contract, 4)
        return this.transport
            .send(CLA, INS_GET_ADDR, boolValidate ? 0x01 : 0x00, 0x00, data, [SW_OK])
            .then((response) => {
                let status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
                if (status === SW_OK) {
                    let offset = 1
                    let address = response.slice(offset, offset + 32)
                    return {address}
                } else {
                    throw new Error('Failed to get address')
                }
            })
    }

    signMessage(account, message, ctx) {
        let data = Buffer.alloc(4)
        data.writeUInt32BE(account, 0)

        let amount = Buffer.alloc(16)
        if (ctx && ctx.amount) {
            let number = BigInt(ctx.amount)
            amount.writeBigUInt64BE(number >> 64n, 0)
            amount.writeBigUInt64BE(number & 0xffffffffffffffffn, 8)
        }

        let decimals = Buffer.alloc(1)
        if (ctx && ctx.decimals) {
            decimals.writeUInt8(parseInt(ctx.decimals, 10), 0)
        }

        let asset = Buffer.alloc(32)
        if (ctx && ctx.asset) {
            asset.write(ctx.asset, 'utf-8')
        }

        let address = Buffer.alloc(32)
        let workChain = Buffer.alloc(1)
        if (ctx && ctx.address) {
            const parts = ctx.address.split(':')
            workChain.writeInt8(parseInt(parts[0]), 0)
            address.write(parts[1], 'hex')
        }

        let buffer = [data, amount, asset, decimals, workChain, address, message]
        let apdus = Buffer.concat(buffer)

        return this.transport
            .send(CLA, INS_SIGN, 0x00, 0x00, apdus, [
                SW_OK,
                SW_CANCEL,
                SW_NOT_ALLOWED,
                SW_UNSUPPORTED,
            ])
            .then((response) => {
                let status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)
                if (status === SW_OK) {
                    let signature = response.slice(1, response.length - 2)
                    return {signature}
                } else if (status === SW_CANCEL) {
                    throw new Error('Transaction approval request was rejected')
                } else if (status === SW_UNSUPPORTED) {
                    throw new Error('Message signing is not supported')
                } else {
                    throw new Error(
                        'Message signing not allowed. Have you enabled it in the app settings?'
                    )
                }
            })
    }
}
