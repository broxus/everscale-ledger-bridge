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
const FLAG_WITH_WALLET_ID = 1 << 0
const FLAG_WITH_WORKCHAIN_ID = 1 << 1
const FLAG_WITH_ADDRESS = 1 << 2
const FLAG_WITH_CHAIN_ID = 1 << 3
const MAX_CHUNK_SIZE = 255

export default class LedgerApp {
    constructor(transport, scrambleKey = 'l0v') {
        /**
         * @type {Transport}
         */
        this.transport = void 0
        this.transport = transport
        /**
         * @type {Uint8Array | null}
         */
        this.configuration = null
        transport.decorateAppAPIMethods(
          this,
          ['getConfiguration', 'getPublicKey', 'getAddress', 'signMessage', 'signTransaction'],
          scrambleKey,
        )
    }

    get version() {
        if (!this.configuration) return null
        return {
            major: this.configuration[0],
            minor: this.configuration[1],
            patch: this.configuration[2],
        }
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

    getPublicKey({ account }, boolValidate = false) {
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

    getAddress({ account, contract }) {
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

    async signMessage({ account, message, chainId }) {
        const optional = []

        const data = Buffer.alloc(4)
        data.writeUInt32BE(account, 0)

        // < 1.1.0
        if (this.version && this.version.major === 1 && this.version.minor === 0) {
            let metadata = 0

            if (typeof chainId === 'number') {
                const b = Buffer.alloc(4)
                b.writeInt32BE(chainId, 0)

                metadata |= FLAG_WITH_CHAIN_ID
                optional.push(Buffer.alloc(1, metadata), b)
            } else {
                optional.push(Buffer.alloc(1, metadata))
            }
        }

        const buffer = [data, ...optional, message]
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

    async signTransaction({ account, originalWallet, wallet, message, chainId, context }) {
        // params.account, params.originalWallet, params.wallet, params.message, params.context
        let metadata = 0
        const optional = []

        const data = Buffer.alloc(5)
        data.writeUInt32BE(account, 0)
        data.writeUint8(originalWallet, 4)

        const decimals = Buffer.alloc(1)
        decimals.writeUInt8(context.decimals, 0)

        let asset = context.asset
        if (context.asset.includes('-LP-')) {
            asset = 'LP'
        } else if (context.asset.length > 8) {
            asset = context.asset.substring(0, 6) + '..'
        }
        const ticker = Buffer.from(asset, 'utf-8')

        if (typeof wallet === 'number' && wallet !== originalWallet) {
            metadata |= FLAG_WITH_WALLET_ID
            optional.push(Buffer.alloc(1, wallet))
        }

        if (typeof context.workchainId === 'number') {
            metadata |= FLAG_WITH_WORKCHAIN_ID
            optional.push(Buffer.alloc(1, context.workchainId))
        }

        if (typeof context.address === 'string') {
            if (context.address.length !== 64) {
                throw new Error('Invalid address format')
            }

            metadata |= FLAG_WITH_ADDRESS
            optional.push(Buffer.from(context.address, 'hex'))
        }

        if (typeof chainId === 'number') {
            const b = Buffer.alloc(4)
            b.writeInt32BE(chainId, 0)

            metadata |= FLAG_WITH_CHAIN_ID
            optional.push(b)
        }

        const buffer = [
            data,
            decimals,
            Buffer.alloc(1, ticker.length),
            ticker,
            Buffer.alloc(1, metadata),
            ...optional,
            message.subarray(4),
        ]
        const apdus = Buffer.concat(buffer)
        const slices = []

        for (let i = 0; i < apdus.length; i += MAX_CHUNK_SIZE) {
            slices.push(
              apdus.slice(i, Math.min(apdus.length, i + MAX_CHUNK_SIZE)),
            )
        }

        let response, status

        for (let i = 0; i < slices.length; i++) {
            const slice = slices[i]
            let p2 = 0x00 // single chunk

            if (slices.length !== 1) {
                if (i === 0) {
                    p2 = 0x02 // first chunk
                } else if (i === slices.length - 1) {
                    p2 = 0x01 // last chunk
                } else {
                    p2 = 0x03 // intermediate chunk
                }
            }

            response = await this.transport
              .send(CLA, INS_SIGN_TRANSACTION, 0x01, p2, slice, [
                  SW_OK,
                  SW_CANCEL,
                  SW_NOT_ALLOWED,
                  SW_UNSUPPORTED,
              ])
            status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0)

            if (status !== SW_OK) break
        }

        if (status === SW_OK) { // 36864
            const signature = response.slice(1, response.length - 2)
            return { signature }
        } else if (status === SW_CANCEL) {
            throw new Error('Transaction approval request was rejected')
        } else if (status === SW_UNSUPPORTED) {
            throw new Error('Message signing is not supported')
        } else {
            throw new Error(
              'Message signing not allowed. Have you enabled it in the app settings?',
            )
        }
    }
}
