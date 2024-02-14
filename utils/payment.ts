import { Asset, BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

export default async function PaymentXDR(source, destin, amount, currency, issuer, memo='') {
  console.log('PAYMENT', source, destin, amount, currency, issuer, memo)
  const server = new Horizon.Server(process.env.NEXT_PUBLIC_STELLAR_RPC_URI)
  const account = await server.loadAccount(source)
  //const baseFee = await server.fetchBaseFee()
  //const network = Networks.PUBLIC
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK=='mainnet' ? Networks.PUBLIC : Networks.TESTNET)
  const operation = Operation.payment({
    destination: destin,
    amount: amount,
    asset: Asset.native()
  })
  const transaction = new TransactionBuilder(account, {networkPassphrase: network, fee:BASE_FEE})
  const tx = transaction.addOperation(operation)
  if(memo) { tx.addMemo(Memo.text(memo)) }
  const built = tx.setTimeout(120).build()
  const txid  = built.hash().toString('hex')
  const xdr   = built.toXDR()
  //console.log('XDR:', xdr)
  //console.log('HASH:', txid)
  return {txid, xdr}
}