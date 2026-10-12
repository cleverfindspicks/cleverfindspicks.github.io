export async function listOwnedPins(token,{request=fetch,maxPages=5}={}){
  const items=[];let bookmark=null;
  for(let page=0;page<maxPages;page++){
    const url=new URL('https://api.pinterest.com/v5/pins');
    url.searchParams.set('page_size','250');url.searchParams.set('domain','cleverfindspicks.github.io');
    if(bookmark)url.searchParams.set('bookmark',bookmark);
    const response=await request(url,{headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok)throw new Error(`Pinterest pin discovery HTTP ${response.status}`);
    items.push(...(Array.isArray(data.items)?data.items:[]));bookmark=data.bookmark||null;
    if(!bookmark)break;
  }
  return items;
}

export function pinIdentity(pin={}){
  try{
    const url=new URL(pin.link||pin.destination_url||'');
    const slug=url.pathname.match(/^\/finds\/([^/]+)\/?$/)?.[1]||null;
    return {officialPinId:String(pin.id||''),pinTrackingId:url.searchParams.get('cf_pin'),productSlug:slug?decodeURIComponent(slug):null};
  }catch{return {officialPinId:String(pin.id||''),pinTrackingId:null,productSlug:null};}
}

export function hydrateOfficialPinIds(db,items=[]){
  const exact=db.prepare('SELECT pin_tracking_id FROM pins WHERE pin_tracking_id=? LIMIT 1');
  const bySlug=db.prepare('SELECT p.pin_tracking_id FROM pins p JOIN publications x ON x.publication_id=p.publication_id WHERE x.product_slug=? ORDER BY p.published_at DESC LIMIT 1');
  const update=db.prepare('UPDATE pins SET official_pin_id=? WHERE pin_tracking_id=? AND (official_pin_id IS NULL OR official_pin_id=?)');
  let matched=0;
  for(const item of items){
    const identity=pinIdentity(item);if(!identity.officialPinId)continue;
    const local=(identity.pinTrackingId?exact.get(identity.pinTrackingId):null)||
      (identity.productSlug?bySlug.get(identity.productSlug):null);
    if(local){update.run(identity.officialPinId,local.pin_tracking_id,identity.officialPinId);matched++;}
  }
  return matched;
}
