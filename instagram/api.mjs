import config from './config.json' with { type: 'json' };

export class InstagramApiError extends Error {
  constructor(code,status,transient=false) {super(`Instagram API error code=${code || 'UNKNOWN'} HTTP=${status}`);this.code=code;this.status=status;this.retryable=transient || status===429 || status>=500;this.tokenExpired=code===190;}
}
export class InstagramApi {
  constructor({token,userId,version=config.apiVersion,fetcher=fetch}) {if(!/^v\d+\.\d+$/.test(version))throw new Error('Invalid Instagram API version');this.token=token;this.userId=userId;this.version=version;this.fetcher=fetcher;}
  async request(path,{method='GET',params={}}={}) {
    const url=new URL(`${config.graphHost}/${this.version}/${path}`);
    const init={method,headers:{Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(30000)};
    if(method==='GET')for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
    else init.body=new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]));
    let response;
    try{response=await this.fetcher(url,init);}catch{throw new InstagramApiError('NETWORK',0,true);}
    let data;try{data=await response.json();}catch{throw new InstagramApiError('INVALID_RESPONSE',response.status,true);}
    if(!response.ok || data.error)throw new InstagramApiError(data.error?.code,response.status,data.error?.is_transient===true);
    return data;
  }
  profile(){return this.request('me',{params:{fields:'user_id,username'}});}
  createReel(videoUrl,caption){return this.request(`${this.userId}/media`,{method:'POST',params:{media_type:'REELS',video_url:videoUrl,caption,share_to_feed:true}});}
  container(id){return this.request(id,{params:{fields:'status_code,status'}});}
  publish(id){return this.request(`${this.userId}/media_publish`,{method:'POST',params:{creation_id:id}});}
  media(id){return this.request(id,{params:{fields:'id,permalink,timestamp,caption,media_type'}});}
  insights(id,metric){return this.request(`${id}/insights`,{params:{metric,period:'lifetime'}});}
  async reconcile(row) {
    // Instagram has no client-provided idempotency key. On an ambiguous publish,
    // never create or publish another container. Search official media instead.
    let after=null;
    for(let page=0;page<10;page++){
      const data=await this.request(`${this.userId}/media`,{params:{fields:'id,caption,timestamp,permalink,media_type',limit:100,...(after?{after}:{})}});
      const matches=(data.data||[]).filter(m=>m.caption===row.caption && m.media_type==='VIDEO' && new Date(m.timestamp)>=new Date(new Date(row.publish_attempt_at).getTime()-300000));
      if(matches.length===1)return matches[0];
      if(matches.length>1)throw new InstagramApiError('AMBIGUOUS_RECONCILIATION',409,false);
      if(!data.paging?.next)return null;
      after=data.paging?.cursors?.after;if(!after)return null;
    }
    return null;
  }
}

export function tokenHealth(credentials,now=Date.now()) {
  if(!credentials?.token || !credentials?.userId)return 'NOT_CONFIGURED';
  if(!credentials.expiresAt)return 'TOKEN_EXPIRING';
  const remaining=new Date(credentials.expiresAt).getTime()-now;
  if(remaining<=0)return 'TOKEN_EXPIRED';
  return remaining<7*86400000?'TOKEN_EXPIRING':'CONNECTED';
}
export function oauthAuthorizeUrl({appId,redirectUri,state}) {
  const url=new URL('https://www.instagram.com/oauth/authorize');
  for(const [k,v] of Object.entries({client_id:appId,redirect_uri:redirectUri,response_type:'code',scope:config.requestedScopes.join(','),state,enable_fb_login:'0',force_authentication:'1'}))url.searchParams.set(k,v);
  return url.toString();
}
