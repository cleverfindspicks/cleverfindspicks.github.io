import {randomBytes,timingSafeEqual} from 'node:crypto';
import {oauthAuthorizeUrl,InstagramApi} from './api.mjs';
import {exchangeLongLived} from './credentials.mjs';
export const redirectUri='https://cleverfindspicks.github.io/instagram-connect/';
export function beginOAuth(appId,now=Date.now()){
  if(!/^\d+$/.test(appId||''))throw new Error('Enter the Instagram App ID from API setup with Instagram login.');
  const session={appId,redirectUri,state:randomBytes(32).toString('hex'),createdAt:now};
  return {session,url:oauthAuthorizeUrl(session)};
}
export function validateCallback(value,session,now=Date.now()){
  const url=new URL(value);const expected=new URL(session.redirectUri);
  if(url.origin!==expected.origin||url.pathname!==expected.pathname||now-session.createdAt>15*60000||now<session.createdAt)throw new Error('OAuth callback origin or session lifetime invalid.');
  const actual=Buffer.from(url.searchParams.get('state')||'');const wanted=Buffer.from(session.state);
  if(actual.length!==wanted.length||!timingSafeEqual(actual,wanted))throw new Error('OAuth state mismatch.');
  if(url.searchParams.has('error'))throw new Error('Instagram authorization was declined.');
  const code=url.searchParams.get('code');if(!code)throw new Error('Missing official authorization code.');
  return code;
}
export async function completeOAuth(value,session,appSecret,{fetcher=fetch}={}){
  const code=validateCallback(value,session);
  const response=await fetcher('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:session.appId,client_secret:appSecret,grant_type:'authorization_code',redirect_uri:session.redirectUri,code}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok||!data.access_token)throw new Error('Official Instagram authorization-code exchange failed.');
  const credentials=await exchangeLongLived(data.access_token,appSecret,fetcher);
  const profile=await new InstagramApi({...credentials,userId:'me',fetcher}).profile();
  const userId=String(profile.user_id||profile.id||'');
  if(!/^\d+$/.test(userId)||profile.username?.toLowerCase()!=='cleverfindspicks')throw new Error('Authorized Instagram account is not cleverfindspicks; credentials were not saved.');
  return {...credentials,userId,username:profile.username};
}
