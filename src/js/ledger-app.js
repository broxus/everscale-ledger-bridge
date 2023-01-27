import { Buffer } from 'buffer'

const CLA = 0xe0
const INS_GET_CONF = 0x01
const INS_GET_PK = 0x02
const INS_SIGN = 0x03
const INS_GET_ADDR = 0x04
const INS_SIGN_TRANSACTION = 0x05
const SW_OK = 0x9000
const SW_CANCEL = 0x6985
const SW_NOT_ALLOWED = 0x6c66
const SW_UNSUPPORTED = 0x6d00

export default class LedgerApp {
    constructor(transport, scrambleKey = 'l0v') {
        this.transport = void 0
        this.transport = transport
        transport.decorateAppAPIMethods(
          this,
          ['getConfiguration', 'getPublicKey', 'getAddress', 'signMessage', 'signTransaction'],
          scrambleKey,
        )
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

    getAddress(account, contract) {
        const data = Buffer.alloc(5)
        data.writeUInt32BE(account, 0)
        data.writeUint8(contract, 4)
        return this.transport
            .send(CLA, INS_GET_ADDR, 0x01, 0x00, data, [SW_OK])
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

    signMessage(account, message) {
        const data = Buffer.alloc(4)
        data.writeUInt32BE(account, 0)

        const buffer = [data, message]
        const apdus = Buffer.concat(buffer)

        return this.transport
            .send(CLA, INS_SIGN, 0x01, 0x00, apdus, [
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

    signTransaction(account, originalWallet, wallet, message, ctx) {
        const data = Buffer.alloc(6)
        data.writeUInt32BE(account, 0)
        data.writeUint8(originalWallet, 4)
        data.writeUint8(wallet, 5)

        const decimals = Buffer.alloc(1)
        decimals.writeUInt8(parseInt(ctx.decimals, 10), 0)

        let asset = ctx.asset
        if (ctx.asset.includes('-LP-')) {
            asset = 'LP'
        } else if (ctx.asset.length > 8) {
            asset = ctx.asset.substring(0, 6) + '..'
        }
        const ticker = Buffer.from(asset, 'utf-8')

        const address = ctx.address != null
            ? Buffer.concat([Buffer.alloc(1, 1), Buffer.from(ctx.address, 'hex')], 33)
            : Buffer.alloc(1, 0)

        const buffer = [data, decimals, Buffer.alloc(1, ticker.length), ticker, address, message.subarray(4)]
        const apdus = Buffer.concat(buffer)

        return this.transport
          .send(CLA, INS_SIGN_TRANSACTION, 0x01, 0x00, apdus, [
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
