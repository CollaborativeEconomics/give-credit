import { Asset, BASE_FEE, Horizon, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

export default async function trustlineXDR(account, code, issuer){
  console.log('Trustline for:', account)
  console.log('Code/issuer:', code, issuer)
  const server = new Horizon.Server(process.env.NEXT_PUBLIC_STELLAR_RPC_URI)
  const myNFT  = new Asset(code, issuer)
  const destin = await server.loadAccount(account)
  const phrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK=='mainnet' ? Networks.PUBLIC : Networks.TESTNET
  console.log('Network:', process.env.NEXT_PUBLIC_STELLAR_NETWORK, phrase)
  console.log('Destin:', JSON.stringify(destin,null,2))
  console.log('Destin:', destin)

  var trustTx = new TransactionBuilder(destin, {
    networkPassphrase: phrase,
    fee: BASE_FEE
  })

  const trustline = Operation.changeTrust({
    asset: myNFT,
    limit: '1000000000',
    source: account
  })

  const built = trustTx
    .addOperation(trustline)
    .setTimeout(120)
    .build()
  
  console.log('BUILT:', JSON.stringify(built,null,2))
  const trid = built.hash().toString('hex')
  const xdr  = built.toXDR()

  return {trid, xdr}
}