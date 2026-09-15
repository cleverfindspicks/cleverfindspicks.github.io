/* oxlint-disable nextjs/no-html-link-for-pages */
import type {Metadata} from 'next';
import preview from '../instagram-preview.json';
import {getProduct} from '../products';
import '../instagram/style.css';
export const metadata:Metadata={title:'Instagram dry-run preview',robots:{index:false,follow:false},alternates:{canonical:'/instagram/'}};
export default function Preview(){
  const data=preview as {productSlug?:string;creativeId?:string;caption?:string;score?:number};
  const product=getProduct(data.productSlug||'');
  return <main className="site-shell ig-hub"><header><a href="/">Clever Finds</a></header>
    <section className="ig-intro"><p className="eyebrow">DRY RUN · NOT PUBLISHED</p><h1>Instagram preview</h1>
      <p>This new creative is a preview only and has not been published. It is not an Instagram performance result.</p>
      {product&&<><h2>{product.shortName}</h2><p>Instagram suitability: {data.score}/100</p>
        <video controls playsInline preload="metadata" poster={`/instagram/${data.creativeId}.png`} style={{width:'100%',maxWidth:390,borderRadius:12}} src={`/instagram/${data.creativeId}.mp4`}>
          <track kind="captions" srcLang="en" label="English" src={`/instagram/${data.creativeId}.vtt`}/>
        </video>
        <pre style={{whiteSpace:'pre-wrap',padding:20}}>{data.caption}</pre>
        <p>SIMULATED HUB CARD: {product.summary}</p>
        <a className="primary-link" href={`/finds/${product.slug}/?utm_source=instagram_preview&utm_medium=test&cf_preview=1`}>Preview destination →</a>
      </>}
    </section>
  </main>;
}
