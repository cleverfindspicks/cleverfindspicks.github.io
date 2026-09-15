'use client';
import { useEffect } from 'react';
import { captureAttribution } from '@/lib/tracking';
import { sendAnalyticsEvent } from '@/lib/analytics-events';
export function InstagramHubAttribution() {
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(!params.has('utm_source')){params.set('utm_source','instagram');params.set('utm_medium','organic');params.set('utm_campaign','clever_finds');}
    captureAttribution(params.toString(),window.sessionStorage);
    sendAnalyticsEvent('instagram_hub_view',{utm_source:'instagram',utm_medium:'organic',utm_campaign:'clever_finds'});
  },[]);
  return null;
}
