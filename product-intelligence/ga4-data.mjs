import {createSign} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const base64url=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
const numeric=value=>Number.isFinite(Number(value))?Number(value):0;

export async function loadServiceAccount(path){
  const account=JSON.parse(await readFile(path,'utf8'));
  if(!account.client_email||!account.private_key)throw new Error('Google service-account credentials are incomplete.');
  return account;
}

export async function googleAccessToken(account,{request=fetch,now=Math.floor(Date.now()/1000)}={}){
  const header=base64url({alg:'RS256',typ:'JWT'});
  const payload=base64url({iss:account.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const unsigned=`${header}.${payload}`;
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${signer.sign(account.private_key).toString('base64url')}`;
  const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error(`Google OAuth token request failed: ${response.status}`);
  return data.access_token;
}

export async function runGa4ProductReport({propertyId,accessToken,startDate='90daysAgo',endDate='yesterday',request=fetch}={}){
  if(!/^\d+$/.test(String(propertyId||'')))throw new Error('GA4_PROPERTY_ID must be numeric.');
  const response=await request(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,{
    method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},signal:AbortSignal.timeout(30000),
    body:JSON.stringify({dateRanges:[{startDate,endDate}],dimensions:[{name:'date'},{name:'eventName'},{name:'pagePathPlusQueryString'},{name:'sessionSource'},{name:'sessionMedium'}],metrics:[{name:'eventCount'},{name:'sessions'}],dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:['product_view','aliexpress_outbound_click']}}},limit:'100000'}),
  });
  const data=await response.json();
  if(!response.ok)throw new Error(`GA4 Data API request failed: ${response.status}`);
  return data;
}

export function ga4Rows(report={}){
  const dimensions=(report.dimensionHeaders||[]).map(item=>item.name);
  const metrics=(report.metricHeaders||[]).map(item=>item.name);
  return (report.rows||[]).map(row=>Object.fromEntries([
    ...dimensions.map((name,index)=>[name,row.dimensionValues?.[index]?.value||'']),
    ...metrics.map((name,index)=>[name,numeric(row.metricValues?.[index]?.value)]),
  ]));
}

export function productSlugFromPath(value=''){
  try{
    const url=new URL(value,'https://cleverfindspicks.github.io');
    const match=url.pathname.match(/^\/finds\/([^/]+)\/?$/);
    return match?decodeURIComponent(match[1]):null;
  }catch{return null;}
}

export function attributionFromPath(value=''){
  try{
    const url=new URL(value,'https://cleverfindspicks.github.io');
    return {pinTrackingId:url.searchParams.get('cf_pin'),instagramTrackingId:url.searchParams.get('cf_ig')};
  }catch{return {pinTrackingId:null,instagramTrackingId:null};}
}
