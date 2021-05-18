require('buffer')

const CLA = 0xe0
const INS_GET_CONF = 0x01;
const INS_GET_PK = 0x02
const INS_SIGN = 0x03
const SW_OK = 0x9000
const SW_CANCEL = 0x6985
const SW_NOT_ALLOWED = 0x6c66
const SW_UNSUPPORTED = 0x6d00

export default class LedgerApp {
    constructor(transport, scrambleKey = "l0v") {
        this.transport = void 0;
        this.transport = transport;
        transport.decorateAppAPIMethods(this, ["getPublicKey", "signHash"], scrambleKey);
    }

    getConfiguration(transport) {
        let data = Buffer.alloc(0x00, 0x04);
        return transport.send(CLA, INS_GET_CONF, 0x00, 0x00, data [SW_OK]).then(response => {
            let status = Buffer.from(response.slice(response.length - 2)).readUInt16BE(0);
            if (status === SW_OK && response.length === 5) {
                let configuration = response.slice(0, 3);
                return {
                    configuration
                };
            } else {
                throw new Error('Failed to get configuration')
            }
        });
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
                    return { publicKey }
                } else {
                    throw new Error('Failed to get public key')
                }
            })
    }

    signHash(account, hash) {
        let data = Buffer.alloc(4)
        data.writeUInt32BE(account)
        let buffer = [data, hash]
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
                    let signature = Buffer.from(response.slice(1, response.length - 2))
                    return { signature }
                } else if (status === SW_CANCEL) {
                    throw new Error('Transaction approval request was rejected')
                } else if (status === SW_UNSUPPORTED) {
                    throw new Error('Hash signing is not supported')
                } else {
                    throw new Error(
                        'Hash signing not allowed. Have you enabled it in the app settings?'
                    )
                }
            })
    }
}
