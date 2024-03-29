//import * as StellarSDK from '@stellar/stellar-sdk'
import { Asset, Horizon, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import {isConnected, getNetwork, getPublicKey, signTransaction} from "@stellar/freighter-api"

export default class Wallet {
  account = ''
  network = ''
  horizon = null
  soroban = null
  hznurl  = process.env.NEXT_PUBLIC_STELLAR_RPC_URI
  //sbnurl  = process.env.NEXT_PUBLIC_STELLAR_SOROBAN
  
  constructor() {
    console.log('FREIGHTER INIT')
  }

  async init() {
    console.log('INIT...')
    if(await isConnected()){
      return {success:true}
    } else {
      return {success:false}
    }
  }

  async connect() {
    try {
      console.log('CONNECT...')
      //this.soroban = new SorobanRpc.Server(this.sbnurl)
      this.horizon = new Horizon.Server(this.hznurl)
      this.account = await getPublicKey()
      this.network = (await getNetwork() || '').toLowerCase()
      return {success:true, account:this.account, network:this.network}
    } catch(ex:any) {
      console.error(ex)
      return {success:false, account:''}
    }
  }

  //async signTransaction(xdr:string, amt:string, memo:string) {}

  async sign(xdr:string) {
    try {
      let net = process.env.NEXT_PUBLIC_STELLAR_PASSPHRASE
      const sgn = await signTransaction(xdr, {networkPassphrase:net})
      console.log('SGN:', sgn)
      const txs = TransactionBuilder.fromXDR(sgn, net)
      console.log('TXS', txs)
      const result = await this.horizon.submitTransaction(txs)
      console.log('RES', result)
      const txid = result.hash
      //console.log("hash:", result.hash);
      //console.log("status:", result.status);
      //console.log("errorResultXdr:", result.errorResultXdr)
      if(result?.successful){
        return {success:true, result, txid}
      } else {
        return {success:false, error:'Signature rejected by user', result, txid}
      }
    } catch(ex:any) {
      console.error(ex)
      console.error('Codes:', ex?.response?.data?.extras?.result_codes)
      return {success:false, error:ex.message}
    }
  }

  async payment(dst:string, amt:string, memo:string) {
    try {
      let nwk = process.env.NEXT_PUBLIC_STELLAR_NETWORK.toUpperCase()
      let net = process.env.NEXT_PUBLIC_STELLAR_PASSPHRASE
      console.log('NET:', nwk, net)
      //let pub = process.env.NEXT_PUBLIC_NFT_ISSUER
      let pub = this.account
      console.log('From', pub)
      console.log('Paying', amt, 'XLM to', dst, 'Memo', memo)
      let act = await this.horizon.loadAccount(pub)
      let fee = await this.horizon.fetchBaseFee() // 100
      let opr = Operation.payment({
       destination: dst,
       asset: Asset.native(),
       amount: amt
      })
      // TODO: fix type error: TransactionBuilderOptions <<<
      const opt = { fee, network:nwk, networkPassphrase:net }
      let txn = new TransactionBuilder(act, opt)
       //.setNetworkPassphrase(net)
       .addOperation(opr)
       .setTimeout(30)
      if(memo) { txn.addMemo(Memo.text(memo)) }
      const built = txn.build()
      const txid  = built.hash().toString('hex')
      const xdr   = built.toXDR()
      console.log('XDR:', xdr)
      const sgn   = await signTransaction(xdr, {networkPassphrase:net})
      console.log('SGN:', sgn)
      //const env   = StellarSDK.xdr.Transaction.fromXDR(sgn, 'base64')
      //const env   = StellarSDK.xdr.TransactionEnvelope.fromXDR(sgn, 'base64')
      //console.log('ENV:', env)
      //const env = JSON.stringify(StellarSDK.xdr.TransactionEnvelope.fromXDR(sgn, 'base64'))
      //const env = StellarSDK.xdr.TransactionResult.fromXDR(xdr, 'base64')
      //const env = StellarSDK.xdr.TransactionMeta.fromXDR(xdr, 'base64')
      //console.log('ENX:', JSON.stringify(env))
      //const final = await this.submit(env)
      //const txs = new StellarSDK.Transaction(sgn)
      //console.log('TXS', txs)

      //const txs = new TransactionBuilder.fromXDR(sgn, this.hznurl)
      const txs = TransactionBuilder.fromXDR(sgn, net)
      console.log('TXS', txs)
      const result = await this.horizon.submitTransaction(txs)
      console.log('RES', result)
      //console.log("hash:", result.hash);
      //console.log("status:", result.status);
      //console.log("errorResultXdr:", result.errorResultXdr)
      if(result?.successful){
        return {success:true, result, txid}
      } else {
        return {success:false, error:'Payment rejected by user', result, txid}
      }
    } catch(err:any) {
      console.error('E>>', err)
      return {success:false, error:err}
    }
  }

  async fetchLedger(query:string){
    try {
      let url = this.hznurl + query
      console.log('FETCH', url)
      let options = {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
      let result = await fetch(url, options)
      let data = await result.json()
      return data
    } catch (ex:any) {
      console.error(ex)
      return { error: ex.message }
    }
  }

  async getTransactionInfo(txid: string){
    console.log('Get tx info by txid', txid);
    let txInfo = await this.fetchLedger('/transactions/'+txid)
    if (!txInfo || 'error' in txInfo) {
      console.log('ERROR', 'Transaction not found:', txid)
      return { error: 'Transaction not found' }
    }
    if (!txInfo?.successful) {
      console.log('ERROR', 'Transaction not valid')
      return { error: 'Transaction not valid' }
    }
    console.log('TXINFO', txInfo)
    const tag = txInfo.memo?.indexOf(':')>0 ? txInfo.memo?.split(':')[1] : ''
    const opid = (BigInt(txInfo.paging_token)+BigInt(1)).toString()
    const opInfo = await this.fetchLedger('/operations/'+opid)
    const result = {
      success: true,
      account: txInfo.source_account,
      amount: opInfo?.amount,
      destination: opInfo?.to,
      destinationTag: tag
    }
    return result
  }
}