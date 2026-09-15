/* oxlint-disable next/no-html-link-for-pages, next/no-img-element */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { checkedAt, getProduct, products } from '../../products';
import { AffiliateLink, ProductView } from '@/components/affiliate-link';
import {categoryLabel,discoveryEligible,matchesDiscovery,discoveryMetadata} from '../../../lib/catalog-discovery';
import {isVisibleRecommendation} from '../../catalog-visibility';
import {ProductCard} from '@/components/product-discovery';
import {titleSimilarity} from '../../../product-intelligence/similarity.mjs';

export function generateStaticParams() {
  return products.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  return { title: product.shortName, description: product.summary, alternates: { canonical: `/finds/${product.slug}` } };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = getProduct((await params).slug);
  if (!product) notFound();
  const category=discoveryMetadata(product).primaryCategory;
  const related=products.filter(p=>p.slug!==product.slug&&p.productId!==product.productId&&titleSimilarity(p.shortName,product.shortName)<0.72&&discoveryEligible(p)&&isVisibleRecommendation(p.slug)&&(matchesDiscovery(p,{category})||p.cluster===product.cluster)).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).filter((p,i,rows)=>rows.findIndex(r=>r.productId===p.productId)===i&&!rows.slice(0,i).some(r=>titleSimilarity(r.shortName,p.shortName)>=0.72)).slice(0,3);
  const identity = {
    productId: product.productId!, productSlug: product.slug, cluster: product.cluster!,
    pinTrackingId: product.pinTrackingId!, publicationId: product.publicationId!,
    automationRunId: product.automationRunId, searchQuery: product.searchQuery,
  };

  return (
    <main className="site-shell detail-shell">
      <ProductView identity={identity} />
      <div className="brand-rule" />
      <header className="site-header">
        <a className="brand-lockup" href="/"><img src="/clever-finds.png" alt="" width="42" height="42" /><span>Clever Finds</span></a>
        <a className="back-link" href="/#finds">← All finds</a>
      </header>
      <nav className="category-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href={`/category/${category}/`}>{categoryLabel(category)}</a><span aria-hidden="true">/</span><span>{product.shortName}</span></nav>
      <article className="detail product-story">
        <div className="detail-image">{product.productImageVerified&&product.displayImage?<img src={product.displayImage} alt={product.name} width="900" height="900"/>:<p>Original product image temporarily unavailable.</p>}</div>
        <div className="detail-copy">
          <p className="eyebrow">{product.eyebrow} · SHORTLISTED PICK</p>
          <h1>{product.shortName}</h1>
          <p className="lead">{product.summary}</p>
          <p className="story-intro">Small homes rarely need more things—they need each shelf, drawer and corner to work harder. This pick stood out because it tackles one clear storage problem without demanding a permanent remodel.</p>
          <dl className="metrics detail-metrics">
            <div><dt>From*</dt><dd>{product.price}</dd></div>
            <div><dt>Positive feedback</dt><dd>{product.positiveFeedback}</dd></div>
            <div><dt>Recent volume</dt><dd>{product.recentVolume}</dd></div>
          </dl>
          {product.affiliateDestinationVerified ? (
            <><AffiliateLink href={product.affiliateUrl} identity={identity}>Check current price on AliExpress <span aria-hidden="true">↗</span></AffiliateLink><p className="affiliate-note">Affiliate link: we may earn a commission if you buy, at no extra cost to you.</p></>
          ) : (
            <><span className="buy-link buy-link-disabled" aria-disabled="true">Listing temporarily unavailable</span><p className="affiliate-note">We disabled this link because its exact AliExpress destination could not be verified.</p></>
          )}
        </div>
      </article>
      <section className="article-body" aria-label={`Why we shortlisted ${product.shortName}`}>
        <div className="article-main">
          <p className="eyebrow">WHY IT MADE THE EDIT</p>
          <h2>A practical upgrade for space you already have</h2>
          <p>{product.summary} The appeal is simple: it gives everyday items a clearer home, so the space is easier to use and quicker to reset.</p>
          <p>We shortlisted this option after weighing buyer feedback, recent demand and the usefulness of the idea for smaller UK homes. It is not a miracle fix, but it may remove a recurring bit of clutter with very little disruption.</p>
          <div className="editor-verdict">
            <span>THE CLEVER FINDS TAKE</span>
            <strong>Worth considering when the measurements fit and the delivered price still makes sense.</strong>
          </div>
          <h2>Where it can earn its keep</h2>
          <ul className="benefit-list">{product.bestFor.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
          <h2>Buy with your eyes open</h2>
          <p>AliExpress listings can combine several sizes, colours or quantities on one page. Treat the displayed price as a starting point and verify the exact option before paying.</p>
          <ol className="check-list">{product.checks.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ol>
        </div>
        <aside className="article-aside">
          <div className="sticky-buy">
            <p className="eyebrow">READY TO CHECK IT?</p>
            <h2>See the live listing</h2>
            <p>Confirm the current variant, delivery date and final price directly on AliExpress.</p>
            {product.affiliateDestinationVerified ? (
              <><AffiliateLink href={product.affiliateUrl} identity={identity}>View on AliExpress <span aria-hidden="true">↗</span></AffiliateLink><p className="affiliate-note">Sponsored affiliate link. You pay no extra; we may receive a commission.</p></>
            ) : (
              <><span className="buy-link buy-link-disabled" aria-disabled="true">Listing temporarily unavailable</span><p className="affiliate-note">The exact product destination is under review, so this CTA is disabled.</p></>
            )}
          </div>
        </aside>
      </section>
      <section className="detail-notes">
        <div><p className="eyebrow">BEST FOR</p><ul>{product.bestFor.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><p className="eyebrow">CHECK BEFORE BUYING</p><ul>{product.checks.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </section>
      <section className="related-finds"><h2>Related finds</h2><div className="product-grid">{related.map(p=><ProductCard key={p.slug} product={p}/>)}</div><p><a className="text-link" href={`/category/${category}/`}>← Back to {categoryLabel(category)}</a></p></section>
      <section className="newsletter-panel" aria-labelledby="newsletter-title">
        <div><p className="eyebrow">THE NEXT CLEVER FIND</p><h2 id="newsletter-title">Get new small-space picks by email.</h2></div>
        <p>One useful roundup, no clutter. The signup form will open here as soon as our mailing list is connected.</p>
      </section>
      <p className="price-note">*AliExpress data checked {checkedAt} for delivery to Great Britain. Price, variant, tax, shipping, feedback and availability can change. We have not physically tested this item.</p>
      <footer><div><span className="brand-name">Clever Finds</span></div><div className="footer-links"><a href="/affiliate-disclosure">How we choose</a><a href="mailto:cleverfindspicks@gmail.com">Contact</a></div></footer>
    </main>
  );
}
