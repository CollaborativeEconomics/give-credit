// Mints NFT and returns tokenId
//   metauri: uri to metadata

import { Asset, BASE_FEE, Keypair, Horizon, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

interface MintResponse {
  success?: boolean;
  error?:string|boolean;
  id?:string;
}

export default async function mintNFT(account:string, metauri: string):Promise<MintResponse>{
  console.log('Minting...', account, metauri)
  try {
    const server  = new Horizon.Server(process.env.STELLAR_RPC_URI)
    const minter  = Keypair.fromSecret(process.env.CFCE_MINTER_WALLET_SEED) // GDXMQPQAPJ2UYPTNC53ZQ756TIIGFWVDRAP2QEWK6KVBRHXE3DJMLDEG
    const issuer  = minter.publicKey()
    const source  = await server.loadAccount(issuer)
    const myNFT   = new Asset('GIVE', issuer)
    const phrase  = process.env.STELLAR_NETWORK=='mainnet' ? Networks.PUBLIC : Networks.TESTNET
    const timeout = 300 // five minutes

    var mintTx = new TransactionBuilder(source, {
      networkPassphrase: phrase,
      fee: BASE_FEE
    })

    let mintOp = Operation.payment({
      source: issuer,
      destination: account,
      asset: myNFT,
      amount: '1'
    })

    let mint = mintTx
      .addOperation(mintOp)
      //.addMemo(Memo.text(metauri))
      .setTimeout(timeout)
      .build()
    
    //console.log('Minting...')
    mint.sign(minter)
    let minted = await server.submitTransaction(mint)
    console.log('Minted', minted)
    if(minted?.successful){
      // StellarSDK interface from server.submitTransaction response without paging_token
      // Clone the result and get the paging_token from there
      const cloned = JSON.parse(JSON.stringify(minted))
      const opid = (BigInt(cloned?.paging_token || '0') + BigInt(1)).toString() // eslint-disable-line
      console.log('OPid', opid)
      return {success:true, id:opid}
    } else {
      //console.log('Error', minted.response?.data?.extras?.result_codes)
      //return {success:false, error:'Error minting '+minted?.response?.data?.extras?.result_codes}
      //console.log('Error?', minted?.response?.data)
      console.log('Error?', minted)
      return {success:false, error:'Error minting NFT'}
    }
  } catch(ex) {
    console.error(ex)
    return {success:false, error:ex.message}
  }
}

// END