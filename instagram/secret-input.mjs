import {emitKeypressEvents} from 'node:readline';
import {stdin,stdout} from 'node:process';
export async function hiddenQuestion(prompt){
  if(!stdin.isTTY||!stdin.setRawMode)throw new Error('Use an interactive local terminal. Never pass secrets as command arguments.');
  stdout.write(prompt);emitKeypressEvents(stdin);stdin.setRawMode(true);stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    const done=()=>{stdin.off('keypress',handler);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};
    const handler=(text,key)=>{
      if(key?.ctrl&&key.name==='c'){done();reject(new Error('Setup cancelled'));}
      else if(key?.name==='return'){done();resolve(value.trim());}
      else if(key?.name==='backspace')value=value.slice(0,-1);
      else if(text&&!key?.ctrl)value+=text;
    };
    stdin.on('keypress',handler);
  });
}
