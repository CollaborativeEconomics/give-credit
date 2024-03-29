import { NextApiRequest, NextApiResponse } from 'next'
import upload from 'libs/nft/upload'
import mint from 'libs/nft/mint'
import fetchLedger from 'libs/server/fetchLedger'
import { newUser, newUserWallet, getUserByWallet, getOrganizationById, getInitiativeById, createNFT } from 'utils/registry'
import getRates from 'utils/rates'

/*
function getTagFromMemo(memo){
  if(!memo) return ''
  const parts = memo.split(':')  // tag:84
  if(parts.length>1){
    return parts[1]
  }
  return ''
}
*/

// POST /api/nft/mint {paymentId}
// On donation:
//   Upload metadata to permanent storage
//   Mint nft with uri:metadata and get token Id
//   Create offer Id for NFT transfer
//   Send tokenId, offerId to client
export default async function Mint(req: NextApiRequest, res: NextApiResponse) {
  console.log('MINTING...')
  try {
    const {txid, initid, donor, destin, amount} = req.body
    console.log('BODY', txid, initid, donor, destin)

    // Get tx info
    const txInfo = await fetchLedger('/transactions/'+txid)
    if(!txInfo || txInfo.status==404) {
      console.log('ERROR', 'Transaction not found')
      return res.status(500).json({ error: 'Transaction info not found' })
    }
    if(!txInfo.successful) {
      console.log('ERROR', 'Transaction not valid')
      return res.status(500).json({ error: 'Transaction not valid' })
    }
    //console.log('TXINFO', txInfo)
    const page = BigInt(txInfo.paging_token) + BigInt(1)
    const opid = page.toString()
    //const tag  = getTagFromMemo(txInfo.memo)

    // Get op info
    const opInfo = await fetchLedger('/operations/'+opid)
    //console.log('OPINFO', opInfo)
    if(!opInfo || opInfo.status==404) {
      console.log('ERROR', 'Operation not found')
      return res.status(500).json({ error: 'Operation info not found' })
    }
    if(!opInfo.transaction_successful) {
      console.log('ERROR', 'Transaction not valid')
      return res.status(500).json({ error: 'Transaction not valid' })
    }
    if(donor!==opInfo?.from){
      return res.status(500).json({ error: 'Transaction not valid, wrong sender' })
    }

    // Form data
    const created = new Date().toJSON().replace('T', ' ').substr(0, 19)
    const donorAddress = opInfo.from
    const organizationAddress = opInfo.to

    // Get user data
    console.log('Donor', donor)
    let userInfo = await getUserByWallet(donor)
    console.log('USER', userInfo)
    const userId = userInfo?.id || ''
    if(!userId){
      const email = donor.substr(0,10).toLowerCase() + '@example.com'
      const user = await newUser({name:'Anonymous', email, wallet:donor})
      userInfo = user.data
      console.log('USER2', userInfo)
      if(userInfo){
        const wallet = await newUserWallet({userId:userInfo.id, address:donor, chain:'Stellar'})
        console.log('WALLET', wallet)
      } else {
        console.log('ERROR', 'User not found')
        return res.status(500).json({error:'User not found'})
      }
    }

    // Get initiative info
    const initiative = await getInitiativeById(initid)
    const initiativeId = initiative?.id || initid
    const initiativeName = initiative?.title || 'Direct Donation'
    //console.log('INITIATIVE', initiative)

    // Get org data
    console.log('Org wallet', organizationAddress)
    const orgInfo = await getOrganizationById(initiative?.organizationId)
    //console.log('ORG', orgInfo)
    if(!orgInfo || orgInfo?.error) {
      console.log('Organization not found', orgInfo?.error)
      return res.status(500).json({ error: 'Organization not found' })
    }
    const organizationId = orgInfo.id
    const organizationName = orgInfo.name

    // Get XLM/USD rate
    const usdRate = await getRates('XLM')
    console.log('XLM/USD', usdRate)

    //const amount = opInfo.amount
    const amountCUR = (+amount).toFixed(4)
    let amountUSD = (+amount * usdRate).toFixed(4)
    let coinCode = 'XLM'
    let coinIssuer = 'Stellar'

    if (opInfo.asset_type !== 'native') {
      amountUSD = '0'
      coinCode = opInfo.asset_code
      coinIssuer = opInfo.asset_issuer
    }

    let offsetVal = 0
    let offsetTxt = '0 Tons'
    console.log('CREDIT', initiative.credits)
    if(initiative?.credits?.length > 0){
      const creditVal = initiative?.credits[0].value || 0
      const creditTon = creditVal / (usdRate||1)
      offsetVal = creditTon>0 ? (+amountUSD / creditTon) : 0
      offsetTxt = offsetVal.toFixed(2) + ' Tons'
      console.log('CREDITVAL', creditVal)
      console.log('CREDITTON', creditTon)
      console.log('OFFSETVAL', offsetVal)
      console.log('OFFSETTXT', offsetTxt)
    }

    const uriImage = initiative?.imageUri || 'ipfs:QmZWgvsGUGykGyDqjL6zjbKjtqNntYZqNzQrFa6UnyZF1n'
    //const uriImage = 'ipfs:QmdmPTsnJr2AwokcR1QC11s1T3NRUh9PK8jste1ngnuDzT' // thank you NFT
    //let uriImage = 'https://ipfs.io/ipfs/bafybeihfgwla34hifpekxjpyga4bibjj3m37ul5j77br7q7vr4ajs4rgiq' // thank you NFT

    // Save metadata
    const metadata = {
      mintedBy: 'CFCE via GiveCredit',
      created,
      donorAddress,
      organization: organizationName,
      initiative: initiativeName,
      image: uriImage,
      network: process.env.STELLAR_NETWORK,
      coinCode,
      coinIssuer,
      coinValue: amountCUR,
      usdValue: amountUSD,
      creditValue: offsetTxt,
      operation: opid
    }
    console.log('META', metadata)
    const fileId = 'meta-' + opid // unique file id
    const bytes = Buffer.from(JSON.stringify(metadata, null, 2))
    const cidMeta = await upload(fileId, bytes, 'text/plain')
    console.log('CID', cidMeta)
    if (!cidMeta || (typeof cidMeta !== 'string' && cidMeta.error)) {
      return res.status(500).json({ error: 'Error uploading metadata' })
    }
    const uriMeta = 'ipfs:' + cidMeta
    //let uriMeta = process.env.IPFS_GATEWAY_URL + cidMeta
    console.log('META URI', uriMeta)

    // Mint NFT
    const resMint = await mint(donorAddress, uriMeta)
    console.log('RESMINT', resMint)
    console.log('TokenId', resMint?.id)
    if (!resMint || resMint?.error) {
      return res.status(500).json({ error: 'Error minting NFT' })
    }
    const tokenId = resMint?.id
    const offerId = '' // no need for offers in stellar

    // Save NFT data to Prisma
    const data = {
      created: new Date(),
      donorAddress,
      userId,
      organizationId,
      initiativeId,
      metadataUri: uriMeta,
      imageUri: uriImage,
      coinNetwork: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
      coinSymbol: coinCode,
      coinLabel: coinIssuer,
      coinValue: amountCUR,
      usdValue: amountUSD,
      tokenId,
      offerId,
      status: 0
    }

    console.log('NftData', data)
    const saved = await createNFT(data)
    console.log('Saved', saved)
    if (saved?.success) {
      console.log('NFT saved in DB!')
    } else {
      console.error('Error saving NFT in DB!')
    }

    // Success
    console.log('Minting completed')
    const result = {
      success:  true,
      image:    uriImage,
      metadata: uriMeta,
      tokenId:  tokenId,
      offerId:  offerId
    }
    console.log('RESULT', result)
    return res.status(200).json(result)
  } catch (ex) {
    console.error(ex)
    return res.status(500).json({ success: false, error: ex.message })
  }
}
