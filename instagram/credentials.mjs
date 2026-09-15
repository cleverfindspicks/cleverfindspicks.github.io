import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { localEnvironment } from '../product-intelligence/local-env.mjs';
import { tokenHealth } from './api.mjs';
const tokenFile=new URL('../product-intelligence/.local/instagram-token.json',import.meta.url);
export async function loadCredentials() {
  const env=await localEnvironment();
  const stored=JSON.parse(await readFile(tokenFile,'utf8').catch(()=> '{}'));
  return {token:stored.token||env.INSTAGRAM_ACCESS_TOKEN,userId:stored.userId||env.INSTAGRAM_USER_ID,expiresAt:stored.expiresAt||env.INSTAGRAM_TOKEN_EXPIRES_AT,issuedAt:stored.issuedAt||env.INSTAGRAM_TOKEN_ISSUED_AT,appId:env.INSTAGRAM_APP_ID,appSecret:env.INSTAGRAM_APP_SECRET};
}
export async function saveCredentials(value) {await mkdir(new URL('../product-intelligence/.local/',import.meta.url),{recursive:true});await writeFile(tokenFile,JSON.stringify(value),{mode:0o600});}
export async function exchangeLongLived(shortToken,appSecret,fetcher=fetch) {
  const url=new URL('https://graph.instagram.com/access_token');
  for(const [k,v] of Object.entries({grant_type:'ig_exchange_token',client_secret:appSecret,access_token:shortToken}))url.searchParams.set(k,v);
  const response=await fetcher(url,{signal:AbortSignal.timeout(30000)});const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error('Official Instagram long-lived token exchange failed; credentials were not saved.');
  return {token:data.access_token,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+data.expires_in*1000).toISOString()};
}
export async function refreshIfNeeded(credentials,fetcher=fetch) {
  const status=tokenHealth(credentials);
  if(status!=='TOKEN_EXPIRING'||!credentials.issuedAt||Date.now()-new Date(credentials.issuedAt).getTime()<86400000)return credentials;
  const url=new URL('https://graph.instagram.com/refresh_access_token');url.searchParams.set('grant_type','ig_refresh_token');url.searchParams.set('access_token',credentials.token);
  const response=await fetcher(url,{signal:AbortSignal.timeout(30000)});const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error('Instagram token refresh failed');
  const next={...credentials,token:data.access_token,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+data.expires_in*1000).toISOString()};
  await saveCredentials({token:next.token,userId:next.userId,issuedAt:next.issuedAt,expiresAt:next.expiresAt});return next;
}
