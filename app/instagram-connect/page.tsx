import type {Metadata} from 'next';
export const metadata:Metadata={title:'Instagram connection',robots:{index:false,follow:false},referrer:'no-referrer'};
// Static callback: no secret/token exchange in Pages or frontend. No analytics.
export default function InstagramConnect(){return <main style={{maxWidth:620,margin:'60px auto',padding:24}}><h1>Instagram authorisation returned</h1><p>Return to the local Clever Finds OAuth terminal and paste this page’s full address into its hidden prompt.</p><p>Do not paste the address into chat. This page does not store tokens or publish anything. Close this tab after the terminal confirms CONNECTED.</p></main>;}
