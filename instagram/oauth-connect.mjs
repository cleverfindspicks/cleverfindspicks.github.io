import {stdin} from 'node:process';
import {hiddenQuestion} from './secret-input.mjs';
import {beginOAuth,completeOAuth} from './oauth.mjs';
import {loadCredentials,saveCredentials} from './credentials.mjs';
// Manual official consent; no scraping, browser automation or password login.
try{
  const existing=await loadCredentials();
  const appId=existing.appId||await hiddenQuestion('Instagram App ID (local): ');
  const appSecret=existing.appSecret||await hiddenQuestion('Instagram App Secret (hidden, local only): ');
  const {session,url}=beginOAuth(appId);
  console.log('Open this official consent URL yourself. Sign in as cleverfindspicks:\n'+url);
  const callback=await hiddenQuestion('Paste the full returned callback URL (hidden, never into chat): ');
  const credentials=await completeOAuth(callback,session,appSecret);
  await saveCredentials(credentials);
  console.log(JSON.stringify({status:'CONNECTED',username:credentials.username,expiresAt:credentials.expiresAt,next:'One trial Reel only; daily publishing still requires review.'}));
}catch{console.error('OAuth did not complete. Nothing was published. Check the App ID, redirect URI, consent and account; retry locally.');process.exitCode=1;}
finally{stdin.pause();}
