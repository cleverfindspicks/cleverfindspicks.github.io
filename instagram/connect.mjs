import {emitKeypressEvents} from 'node:readline';
import {stdin,stdout} from 'node:process';
import {loadCredentials,exchangeLongLived,saveCredentials} from './credentials.mjs';
import {InstagramApi} from './api.mjs';
// Interactive local-only setup: tokens are never command-line arguments, Git
// files, frontend settings or console output. Use the official app dashboard.
async function hiddenQuestion(prompt){
  if(!stdin.isTTY||!stdin.setRawMode)throw new Error('Run instagram:connect in an interactive local terminal. Secrets cannot be passed as command arguments.');
  stdout.write(prompt);emitKeypressEvents(stdin);stdin.setRawMode(true);stdin.resume();
  return new Promise((yes,no)=>{
    let value='';
    const done=()=>{stdin.off('keypress',handler);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};
    const handler=(text,key)=>{
      if(key?.ctrl&&key.name==='c'){done();no(new Error('Setup cancelled'));}
      else if(key?.name==='return'){done();yes(value);}
      else if(key?.name==='backspace')value=value.slice(0,-1);
      else if(text&&!key?.ctrl)value+=text;
    };
    stdin.on('keypress',handler);
  });
}
const current=await loadCredentials();
try{
  const appSecret=current.appSecret||await hiddenQuestion('Instagram app secret (hidden, local only): ');
  const shortToken=await hiddenQuestion('Official Instagram dashboard access token (hidden, local only): ');
  const credentials=await exchangeLongLived(shortToken.trim(),appSecret.trim());
  const profile=await new InstagramApi({...credentials,userId:'me'}).profile();
  const userId=String(profile.user_id||profile.id||'');if(!/^\d+$/.test(userId))throw new Error('Official API did not return an Instagram user ID');
  await saveCredentials({...credentials,userId});
  console.log(JSON.stringify({ok:true,status:'CONNECTED',expiresAt:credentials.expiresAt,credentialsSaved:'private-local-only'}));
}finally{stdin.pause();}
